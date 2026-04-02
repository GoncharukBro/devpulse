/**
 * Двухуровневый LLM pipeline для анализа агрегированных отчётов за произвольный период.
 *
 * Уровень 1 — анализ каждого сотрудника отдельным запросом к LLM.
 * Уровень 2 — сводный анализ команды/проекта на основе результатов уровня 1.
 */

import { MikroORM } from '@mikro-orm/core';
import { AggregatedReport } from '../../entities/aggregated-report.entity';
import { LlmService } from '../llm/llm.service';
import { Logger } from '../../common/types/logger';
import { minutesToHours } from '../../common/utils/metrics-utils';
import {
  CollectedData,
  CollectedEmployeeData as CollectedEmpData,
  EmployeeAggItemV2,
  PeriodBreakdownItem,
  ReportProgress,
} from './aggregated-reports.types';
import {
  buildEmployeeAnalysisPrompt,
  buildSummaryAnalysisPrompt,
  EmployeePromptData,
  EmployeeMiniSummary,
  SummaryPromptData,
} from './period-llm.prompt';
import { formatYTDate } from '../../common/utils/week-utils';

// ─── Parsed LLM response types ────────────────────────────────────────────────

interface EmployeeLlmResult {
  score: number;
  summary: string;
  concerns: string[];
  recommendations: string[];
  taskClassification?: {
    businessCritical: string[];
    technicallySignificant: string[];
    bugfixes: string[];
    other: string[];
  };
}

interface SummaryLlmResult {
  score: number;
  summary: string;
  concerns: string[];
  recommendations: string[];
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export class ReportLlmPipeline {
  constructor(
    private orm: MikroORM,
    private llmService: LlmService,
    private log: Logger,
  ) {}

  /**
   * Запускает двухуровневый LLM анализ для отчёта.
   * Возвращает итоговый статус: 'ready' | 'partial' | 'failed'.
   */
  async analyze(
    reportId: string,
    type: 'employee' | 'project' | 'team',
    collected: CollectedData,
    employeesData: EmployeeAggItemV2[],
  ): Promise<'ready' | 'partial' | 'failed'> {
    const em = this.orm.em.fork();

    let report: AggregatedReport;
    try {
      report = await em.findOneOrFail(AggregatedReport, reportId);
    } catch (err) {
      this.log.error(`ReportLlmPipeline: report ${reportId} not found: ${(err as Error).message}`);
      return 'failed';
    }

    // Mark as analyzing
    report.status = 'analyzing';
    this.setProgress(report, 'analyzing', employeesData.length, 0, 'Начало LLM-анализа');
    await em.flush();

    // ─── Level 1: Per-employee analysis ──────────────────────────────

    // Only real employees (skip 'Итого' rows)
    const realEmployees = employeesData.filter(e => e.projectName !== 'Итого');
    const totalCalls = realEmployees.length + (type !== 'employee' ? 1 : 0);
    let completedCalls = 0;
    let failedCalls = 0;

    for (const empData of realEmployees) {
      this.setProgress(
        report,
        'analyzing',
        totalCalls,
        completedCalls,
        `Анализ: ${empData.displayName}`,
      );
      await em.flush();

      try {
        const promptData = this.buildEmployeePromptData(empData, collected, report);
        const messages = buildEmployeeAnalysisPrompt(promptData);
        const response = await this.llmService.chatCompletion(messages);

        if (!response) {
          this.log.warn(`ReportLlmPipeline: empty LLM response for ${empData.displayName}`);
          failedCalls++;
          completedCalls++;
          continue;
        }

        const parsed = this.parseEmployeeLlmResponse(response);
        if (!parsed) {
          this.log.warn(`ReportLlmPipeline: failed to parse LLM response for ${empData.displayName}`);
          failedCalls++;
          completedCalls++;
          continue;
        }

        empData.llmScore = parsed.score;
        empData.llmSummary = parsed.summary;
        empData.llmConcerns = parsed.concerns;
        empData.llmRecommendations = parsed.recommendations;

        this.log.info(
          `ReportLlmPipeline: analyzed ${empData.displayName} → score=${parsed.score}`,
        );
      } catch (err) {
        this.log.error(
          `ReportLlmPipeline: LLM call failed for ${empData.displayName}: ${(err as Error).message}`,
        );
        failedCalls++;
      }

      completedCalls++;
    }

    // Copy LLM scores to 'Итого' entries (average of per-project scores)
    this.propagateScoresToTotals(employeesData);

    // Save employeesData to report
    report.employeesData = employeesData as unknown as object[];

    // ─── Level 2: Summary analysis (project/team only) ────────────────

    if (type !== 'employee') {
      this.setProgress(
        report,
        'analyzing',
        totalCalls,
        completedCalls,
        'Сводный анализ команды',
      );
      await em.flush();

      try {
        const summaryPromptData = this.buildSummaryPromptData(report, type, employeesData);
        const messages = buildSummaryAnalysisPrompt(summaryPromptData);
        const response = await this.llmService.chatCompletion(messages);

        if (response) {
          const parsed = this.parseSummaryLlmResponse(response);
          if (parsed) {
            report.llmPeriodScore = parsed.score;
            report.llmPeriodSummary = parsed.summary;
            report.llmPeriodConcerns = parsed.concerns;
            report.llmPeriodRecommendations = parsed.recommendations;
            this.log.info(`ReportLlmPipeline: summary analyzed → score=${parsed.score}`);
          } else {
            this.log.warn('ReportLlmPipeline: failed to parse summary LLM response');
            failedCalls++;
          }
        } else {
          this.log.warn('ReportLlmPipeline: empty summary LLM response');
          failedCalls++;
        }
      } catch (err) {
        this.log.error(
          `ReportLlmPipeline: summary LLM call failed: ${(err as Error).message}`,
        );
        failedCalls++;
      }

      completedCalls++;
    }

    // ─── Determine final status ───────────────────────────────────────

    let finalStatus: 'ready' | 'partial' | 'failed';
    if (failedCalls === 0) {
      finalStatus = 'ready';
    } else if (failedCalls >= totalCalls) {
      finalStatus = 'failed';
    } else {
      finalStatus = 'partial';
    }

    // Update avgScore from LLM results
    const allScores = employeesData
      .filter(e => e.projectName !== 'Итого' && e.llmScore != null)
      .map(e => e.llmScore!);
    if (allScores.length > 0) {
      report.avgScore = Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length * 10) / 10;
    }

    // For employee type without Level 2, copy LLM summary to period fields
    if (type === 'employee' && !report.llmPeriodSummary) {
      const summaryItem = employeesData.find(e => e.projectName === 'Итого') ?? employeesData.find(e => e.llmScore != null);
      if (summaryItem) {
        report.llmPeriodScore = summaryItem.llmScore ?? undefined;
        report.llmPeriodSummary = summaryItem.llmSummary ?? undefined;
        report.llmPeriodConcerns = summaryItem.llmConcerns ?? undefined;
        report.llmPeriodRecommendations = summaryItem.llmRecommendations ?? undefined;
      }
    }

    // Clear progress, set status, flush
    report.progress = null;
    report.status = finalStatus;
    report.employeesData = employeesData as unknown as object[];
    await em.flush();

    this.log.info(
      `ReportLlmPipeline: finished reportId=${reportId}, status=${finalStatus}, failed=${failedCalls}/${totalCalls}`,
    );

    return finalStatus;
  }

  // ─── Private: Build employee prompt data ─────────────────────────────────

  private buildEmployeePromptData(
    empData: EmployeeAggItemV2,
    collected: CollectedData,
    report: AggregatedReport,
  ): EmployeePromptData {
    // Gather all collected entries for this employee (may span multiple subscriptions)
    const empCollected = collected.employees.filter(
      e => e.login === empData.youtrackLogin,
    );

    // Aggregate metrics across all subscriptions
    const totalIssues = empCollected.reduce((s, e) => s + e.metrics.totalIssues, 0);
    const completedIssues = empCollected.reduce((s, e) => s + e.metrics.completedIssues, 0);
    const overdueIssues = empCollected.reduce((s, e) => s + e.metrics.overdueIssues, 0);
    const totalSpentMinutes = empCollected.reduce((s, e) => s + e.metrics.totalSpentMinutes, 0);
    const totalEstimationMinutes = empCollected.reduce(
      (s, e) => s + e.metrics.totalEstimationMinutes,
      0,
    );

    // Aggregate issuesByType
    const issuesByType: Record<string, number> = {};
    for (const e of empCollected) {
      for (const [type, count] of Object.entries(e.metrics.issuesByType)) {
        issuesByType[type] = (issuesByType[type] ?? 0) + count;
      }
    }

    // Average KPIs
    const kpiValues = (key: keyof CollectedEmpData['kpi']) =>
      empCollected.map(e => e.kpi[key]).filter((v): v is number => v != null);

    const avgKpi = (key: keyof CollectedEmpData['kpi']): number | null => {
      const values = kpiValues(key);
      if (values.length === 0) return null;
      return values.reduce((s, v) => s + v, 0) / values.length;
    };

    // Top tasks — merge and take top 20 by spentMinutes
    const allTasks = empCollected.flatMap(e => e.topTasks);
    allTasks.sort((a, b) => b.spentMinutes - a.spentMinutes);
    const topTasks = allTasks.slice(0, 20);

    // Period breakdown from empData
    const periodBreakdown = empData.periodBreakdown ?? null;

    // Projects summary (if multiple subscriptions)
    let projectsSummary: string | undefined;
    if (empCollected.length > 1) {
      const lines = empCollected.map(e =>
        `${e.projectName}: ${e.metrics.totalIssues} задач, ${e.metrics.completedIssues} закрыто, ${minutesToHours(e.metrics.totalSpentMinutes)}ч`,
      );
      projectsSummary = lines.join('\n');
    }

    return {
      displayName: empData.displayName,
      periodStart: formatYTDate(report.periodStart),
      periodEnd: formatYTDate(report.periodEnd),
      totalIssues,
      completedIssues,
      overdueIssues,
      totalSpentMinutes,
      totalEstimationMinutes,
      utilization: avgKpi('utilization'),
      estimationAccuracy: avgKpi('estimationAccuracy'),
      focus: avgKpi('focus'),
      completionRate: avgKpi('completionRate'),
      avgCycleTimeHours: avgKpi('avgCycleTimeHours'),
      issuesByType,
      periodBreakdown,
      topTasks,
      projectsSummary,
    };
  }

  // ─── Private: Build summary prompt data ──────────────────────────────────

  private buildSummaryPromptData(
    report: AggregatedReport,
    type: 'project' | 'team',
    employeesData: EmployeeAggItemV2[],
  ): SummaryPromptData {
    // Use non-Итого rows for mini-summaries
    const realEmployees = employeesData.filter(e => e.projectName !== 'Итого');

    const employees: EmployeeMiniSummary[] = realEmployees.map(e => ({
      displayName: e.displayName,
      llmScore: e.llmScore,
      llmSummary: e.llmSummary,
    }));

    // Deduplicate by displayName for summary (employee may appear in multiple projects)
    const seen = new Set<string>();
    const uniqueEmployees: EmployeeMiniSummary[] = [];
    for (const emp of employees) {
      if (!seen.has(emp.displayName)) {
        seen.add(emp.displayName);
        uniqueEmployees.push(emp);
      }
    }

    const scores = uniqueEmployees
      .map(e => e.llmScore)
      .filter((s): s is number => s != null);
    const avgScore =
      scores.length > 0
        ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) / 100
        : null;

    return {
      targetName: report.targetName,
      targetType: type,
      periodStart: formatYTDate(report.periodStart),
      periodEnd: formatYTDate(report.periodEnd),
      totalIssues: report.totalIssues,
      completedIssues: report.completedIssues,
      overdueIssues: report.overdueIssues,
      totalSpentMinutes: report.totalSpentMinutes,
      avgUtilization: report.avgUtilization ?? null,
      avgCompletionRate: report.avgCompletionRate ?? null,
      avgScore,
      employees: uniqueEmployees,
    };
  }

  // ─── Private: Propagate scores to 'Итого' rows ───────────────────────────

  private propagateScoresToTotals(employeesData: EmployeeAggItemV2[]): void {
    // Group real rows by login
    const scoresByLogin = new Map<string, number[]>();
    for (const e of employeesData) {
      if (e.projectName === 'Итого') continue;
      if (e.llmScore == null) continue;
      const arr = scoresByLogin.get(e.youtrackLogin) ?? [];
      arr.push(e.llmScore);
      scoresByLogin.set(e.youtrackLogin, arr);
    }

    // Set average score on Итого rows
    for (const e of employeesData) {
      if (e.projectName !== 'Итого') continue;
      const scores = scoresByLogin.get(e.youtrackLogin);
      if (!scores || scores.length === 0) continue;
      e.llmScore =
        Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) / 100;
    }
  }

  // ─── Private: Progress helper ─────────────────────────────────────────────

  private setProgress(
    report: AggregatedReport,
    phase: 'collecting' | 'analyzing',
    total: number,
    completed: number,
    currentStep: string,
  ): void {
    const progress: ReportProgress = { phase, total, completed, currentStep };
    report.progress = progress as unknown as object;
  }

  // ─── Private: JSON parsers ────────────────────────────────────────────────

  private parseEmployeeLlmResponse(raw: string): EmployeeLlmResult | null {
    const parsed = this.extractJson(raw);
    if (!parsed) return null;

    const score =
      typeof parsed.score === 'number'
        ? Math.max(0, Math.min(100, Math.round(parsed.score)))
        : null;
    if (score === null) return null;

    const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 2000) : '';
    const concerns = Array.isArray(parsed.concerns)
      ? parsed.concerns.filter((v): v is string => typeof v === 'string')
      : [];
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.filter((v): v is string => typeof v === 'string')
      : [];

    return { score, summary, concerns, recommendations };
  }

  private parseSummaryLlmResponse(raw: string): SummaryLlmResult | null {
    const parsed = this.extractJson(raw);
    if (!parsed) return null;

    const score =
      typeof parsed.score === 'number'
        ? Math.max(0, Math.min(100, Math.round(parsed.score)))
        : null;
    if (score === null) return null;

    const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 2000) : '';
    const concerns = Array.isArray(parsed.concerns)
      ? parsed.concerns.filter((v): v is string => typeof v === 'string')
      : [];
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.filter((v): v is string => typeof v === 'string')
      : [];

    return { score, summary, concerns, recommendations };
  }

  private extractJson(raw: string): Record<string, unknown> | null {
    if (!raw || raw.trim().length === 0) return null;

    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Fallback: extract first {...} block
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }
}

