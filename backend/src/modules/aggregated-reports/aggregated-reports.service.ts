/**
 * Бизнес-логика агрегированных отчётов: предпросмотр, создание, список, просмотр, удаление.
 */

import { EntityManager, MikroORM } from '@mikro-orm/postgresql';
import { MetricReport } from '../../entities/metric-report.entity';
import { Subscription } from '../../entities/subscription.entity';
import { SubscriptionEmployee } from '../../entities/subscription-employee.entity';
import { Team } from '../../entities/team.entity';
import { AggregatedReport } from '../../entities/aggregated-report.entity';
import { getMonday, getWeekRange, formatYTDate } from '../../common/utils/week-utils';
import {
  avgNullable,
  calcTrend,
  calcMetricTrend,
  minutesToHours,
} from '../../common/utils/metrics-utils';
import { LlmService } from '../llm/llm.service';
import { buildPeriodAnalysisPrompt, PeriodPromptData } from './period-llm.prompt';
import {
  PreviewRequest,
  PreviewResponse,
  CreateResponse,
  AggregatedMetricsDTO,
  WeeklyDataItem,
  WeeklyTrendItem,
  OverallTrend,
  WeeklyLlmItem,
  EmployeeAggItem,
  AggregatedReportDTO,
  AggregatedReportListItem,
  ListResponse,
} from './aggregated-reports.types';

function getEffectiveScore(report: MetricReport): number | null {
  return report.llmScore ?? null;
}

export class AggregatedReportsService {
  constructor(
    private em: EntityManager,
    private llmService: LlmService | null,
    private orm: MikroORM,
  ) {}

  // ─── Preview ──────────────────────────────────────────────────────
  async preview(params: PreviewRequest & { userId: string }): Promise<PreviewResponse> {
    const { periodStart, periodEnd, weeksCount } = this.roundPeriod(params.dateFrom, params.dateTo);
    const targetName = await this.resolveTargetName(params.type, params.targetId, params.userId);
    const reports = await this.fetchReports(params.type, params.targetId, params.userId, periodStart, periodEnd);

    const weeklyData = this.buildWeeklyData(reports, params.type);
    const availableWeeks = weeklyData.filter(w => w.totalIssues > 0 || w.totalSpentHours > 0).length;
    const aggregatedMetrics = this.aggregateMetrics(reports);

    return {
      periodStart: formatYTDate(periodStart),
      periodEnd: formatYTDate(periodEnd),
      weeksCount,
      targetName,
      availableWeeks,
      aggregatedMetrics,
      weeklyData,
    };
  }

  // ─── Create ───────────────────────────────────────────────────────
  async create(params: PreviewRequest & { userId: string }): Promise<CreateResponse> {
    const { periodStart, periodEnd, weeksCount } = this.roundPeriod(params.dateFrom, params.dateTo);
    const targetName = await this.resolveTargetName(params.type, params.targetId, params.userId);
    const reports = await this.fetchReports(params.type, params.targetId, params.userId, periodStart, periodEnd);

    const weeklyData = this.buildWeeklyData(reports, params.type);
    const weeklyTrends = this.buildWeeklyTrends(weeklyData);
    const overallTrend = this.buildOverallTrend(weeklyData);
    const weeklyLlmSummaries = this.buildWeeklyLlmSummaries(reports, params.type);
    const aggregatedMetrics = this.aggregateMetrics(reports);
    const employeesData = params.type !== 'employee' ? await this.buildEmployeesData(reports) : null;

    const report = new AggregatedReport();
    report.type = params.type;
    report.targetName = targetName;
    report.periodStart = periodStart;
    report.periodEnd = periodEnd;
    report.weeksCount = weeksCount;

    // Set target fields
    if (params.type === 'employee') report.targetLogin = params.targetId;
    else if (params.type === 'project') report.targetSubscriptionId = params.targetId;
    else report.targetTeamId = params.targetId;

    // Aggregated metrics
    report.totalIssues = aggregatedMetrics.totalIssues;
    report.completedIssues = aggregatedMetrics.completedIssues;
    report.overdueIssues = aggregatedMetrics.overdueIssues;
    report.totalSpentMinutes = Math.round(aggregatedMetrics.totalSpentHours * 60);
    report.totalEstimationMinutes = Math.round(aggregatedMetrics.totalEstimationHours * 60);
    report.avgUtilization = aggregatedMetrics.avgUtilization ?? undefined;
    report.avgEstimationAccuracy = aggregatedMetrics.avgEstimationAccuracy ?? undefined;
    report.avgFocus = aggregatedMetrics.avgFocus ?? undefined;
    report.avgCompletionRate = aggregatedMetrics.avgCompletionRate ?? undefined;
    report.avgCycleTimeHours = aggregatedMetrics.avgCycleTimeHours ?? undefined;
    report.avgScore = aggregatedMetrics.avgScore ?? undefined;

    // JSONB fields
    report.weeklyData = weeklyData as unknown as object[];
    report.weeklyTrends = weeklyTrends as unknown as object[];
    report.overallTrend = overallTrend as unknown as object;
    report.weeklyLlmSummaries = weeklyLlmSummaries as unknown as object[];
    if (employeesData) report.employeesData = employeesData as unknown as object[];

    report.createdBy = params.userId;

    // LLM or ready
    if (this.llmService) {
      report.status = 'generating';
      this.em.persist(report);
      await this.em.flush();

      // Async LLM generation — MUST use orm.em.fork() because HTTP em will be invalid
      const reportId = report.id;
      setImmediate(() => {
        this.generatePeriodLlmSummary(reportId).catch(() => {
          // Error handling is inside generatePeriodLlmSummary
        });
      });

      return { id: report.id, status: 'generating' };
    } else {
      report.status = 'ready';
      this.em.persist(report);
      await this.em.flush();
      return { id: report.id, status: 'ready' };
    }
  }

  // ─── List ─────────────────────────────────────────────────────────
  async list(params: { type?: string; page?: number; limit?: number; userId: string }): Promise<ListResponse> {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = { createdBy: params.userId };
    if (params.type) where.type = params.type;

    const [items, total] = await this.em.findAndCount(
      AggregatedReport,
      where,
      {
        orderBy: { createdAt: 'DESC' },
        limit,
        offset,
      },
    );

    const data: AggregatedReportListItem[] = items.map((r) => ({
      id: r.id,
      type: r.type,
      targetName: r.targetName,
      periodStart: formatYTDate(r.periodStart),
      periodEnd: formatYTDate(r.periodEnd),
      weeksCount: r.weeksCount,
      avgScore: r.avgScore ?? null,
      status: r.status as 'generating' | 'ready' | 'failed',
      createdAt: r.createdAt.toISOString(),
    }));

    return { data, total, page, limit };
  }

  // ─── GetById ──────────────────────────────────────────────────────
  async getById(id: string, userId: string): Promise<AggregatedReportDTO | null> {
    const r = await this.em.findOne(AggregatedReport, { id, createdBy: userId });
    if (!r) return null;

    return {
      id: r.id,
      type: r.type,
      targetName: r.targetName,
      periodStart: formatYTDate(r.periodStart),
      periodEnd: formatYTDate(r.periodEnd),
      weeksCount: r.weeksCount,
      aggregatedMetrics: {
        totalIssues: r.totalIssues,
        completedIssues: r.completedIssues,
        overdueIssues: r.overdueIssues,
        totalSpentHours: minutesToHours(r.totalSpentMinutes),
        totalEstimationHours: minutesToHours(r.totalEstimationMinutes),
        avgUtilization: r.avgUtilization ?? null,
        avgEstimationAccuracy: r.avgEstimationAccuracy ?? null,
        avgFocus: r.avgFocus ?? null,
        avgCompletionRate: r.avgCompletionRate ?? null,
        avgCycleTimeHours: r.avgCycleTimeHours ?? null,
        avgScore: r.avgScore ?? null,
      },
      weeklyData: r.weeklyData as unknown as WeeklyDataItem[],
      weeklyTrends: r.weeklyTrends as unknown as WeeklyTrendItem[],
      overallTrend: r.overallTrend as unknown as OverallTrend,
      weeklyLlmSummaries: r.weeklyLlmSummaries as unknown as WeeklyLlmItem[],
      llmPeriodScore: r.llmPeriodScore ?? null,
      llmPeriodSummary: r.llmPeriodSummary ?? null,
      llmPeriodConcerns: r.llmPeriodConcerns ?? null,
      llmPeriodRecommendations: r.llmPeriodRecommendations ?? null,
      employeesData: r.employeesData as unknown as EmployeeAggItem[] | null,
      status: r.status,
      errorMessage: r.errorMessage ?? null,
      createdBy: r.createdBy ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  // ─── Email preview ───────────────────────────────────────────────
  async getEmailPreview(id: string, userId: string): Promise<{ subject: string; html: string } | null> {
    const r = await this.em.findOne(AggregatedReport, { id, createdBy: userId });
    if (!r) return null;

    const { generateAggregatedEmailHtml } = await import('../reports/email-template');

    const employees = r.employeesData as unknown as EmployeeAggItem[] | null;

    const data = {
      type: r.type,
      targetName: r.targetName,
      period: { start: formatYTDate(r.periodStart), end: formatYTDate(r.periodEnd) },
      weeksCount: r.weeksCount,
      avgScore: r.avgScore ?? null,
      kpis: {
        utilization: r.avgUtilization ?? null,
        estimationAccuracy: r.avgEstimationAccuracy ?? null,
        focus: r.avgFocus ?? null,
        completionRate: r.avgCompletionRate ?? null,
      },
      tasks: {
        total: r.totalIssues,
        completed: r.completedIssues,
        overdue: r.overdueIssues,
      },
      time: {
        spentHours: minutesToHours(r.totalSpentMinutes),
        avgCycleTimeHours: r.avgCycleTimeHours ?? null,
      },
      llm: r.llmPeriodSummary ? {
        score: r.llmPeriodScore ?? null,
        summary: r.llmPeriodSummary ?? null,
        concerns: r.llmPeriodConcerns ?? null,
        recommendations: r.llmPeriodRecommendations ?? null,
      } : null,
      employees: employees?.map(e => ({
        displayName: e.displayName,
        score: e.avgScore,
        utilization: e.avgUtilization,
        completedIssues: e.completedIssues,
        totalIssues: e.totalIssues,
      })) ?? null,
    };

    const html = generateAggregatedEmailHtml(data);
    const subject = `DevPulse · ${r.targetName} · ${data.period.start}–${data.period.end} (${r.weeksCount} нед.)`;

    return { subject, html };
  }

  // ─── Delete ───────────────────────────────────────────────────────
  async delete(id: string, userId: string): Promise<void> {
    const report = await this.em.findOne(AggregatedReport, { id, createdBy: userId });
    if (report) {
      await this.em.removeAndFlush(report);
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private async generatePeriodLlmSummary(reportId: string): Promise<void> {
    const em = this.orm.em.fork();
    try {
      const report = await em.findOneOrFail(AggregatedReport, reportId);

      const promptData: PeriodPromptData = {
        targetType: report.type,
        targetName: report.targetName,
        periodStart: formatYTDate(report.periodStart),
        periodEnd: formatYTDate(report.periodEnd),
        weeksCount: report.weeksCount,
        aggregatedMetrics: {
          totalIssues: report.totalIssues,
          completedIssues: report.completedIssues,
          overdueIssues: report.overdueIssues,
          totalSpentHours: minutesToHours(report.totalSpentMinutes),
          totalEstimationHours: minutesToHours(report.totalEstimationMinutes),
          avgUtilization: report.avgUtilization ?? null,
          avgEstimationAccuracy: report.avgEstimationAccuracy ?? null,
          avgFocus: report.avgFocus ?? null,
          avgCompletionRate: report.avgCompletionRate ?? null,
          avgCycleTimeHours: report.avgCycleTimeHours ?? null,
          avgScore: report.avgScore ?? null,
        },
        weeklyData: report.weeklyData as unknown as WeeklyDataItem[],
        weeklyLlmSummaries: report.weeklyLlmSummaries as unknown as WeeklyLlmItem[],
      };

      const messages = buildPeriodAnalysisPrompt(promptData);
      const response = await this.llmService!.chatCompletion(messages);

      if (!response) {
        report.status = 'failed';
        report.errorMessage = 'LLM returned empty response';
        await em.flush();
        return;
      }

      // Parse JSON response
      const parsed = this.parsePeriodLlmResponse(response);
      if (!parsed) {
        report.status = 'failed';
        report.errorMessage = 'Failed to parse LLM response';
        await em.flush();
        return;
      }

      report.llmPeriodScore = parsed.score;
      report.llmPeriodSummary = parsed.summary;
      report.llmPeriodConcerns = parsed.concerns;
      report.llmPeriodRecommendations = parsed.recommendations;
      report.status = 'ready';
      await em.flush();
    } catch (err) {
      try {
        const freshEm = this.orm.em.fork();
        const failedReport = await freshEm.findOne(AggregatedReport, reportId);
        if (failedReport) {
          failedReport.status = 'failed';
          failedReport.errorMessage = (err as Error).message;
          await freshEm.flush();
        }
      } catch {
        // ignore cleanup errors
      }
    }
  }

  private parsePeriodLlmResponse(raw: string): {
    score: number;
    summary: string;
    concerns: string[];
    recommendations: string[];
  } | null {
    if (!raw || raw.trim().length === 0) return null;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Try to extract JSON from text
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        parsed = JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }

    const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : null;
    if (score === null) return null;

    const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 2000) : '';
    const concerns = Array.isArray(parsed.concerns) ? parsed.concerns.filter((v): v is string => typeof v === 'string') : [];
    const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations.filter((v): v is string => typeof v === 'string') : [];

    return { score, summary, concerns, recommendations };
  }

  private roundPeriod(dateFrom: string, dateTo: string): {
    periodStart: Date;
    periodEnd: Date;
    weeksCount: number;
  } {
    const periodStart = getMonday(new Date(dateFrom));
    const { end: periodEnd } = getWeekRange(new Date(dateTo));
    // Count weeks
    const diffMs = periodEnd.getTime() - periodStart.getTime();
    const weeksCount = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
    return { periodStart, periodEnd, weeksCount };
  }

  private async resolveTargetName(
    type: 'employee' | 'project' | 'team',
    targetId: string,
    userId: string,
  ): Promise<string> {
    if (type === 'employee') {
      // Find displayName from any subscription
      const employee = await this.em.findOne(SubscriptionEmployee, { youtrackLogin: targetId });
      return employee?.displayName ?? targetId;
    }
    if (type === 'project') {
      const sub = await this.em.findOne(Subscription, { id: targetId });
      if (!sub) throw new Error('Subscription not found');
      return sub.projectName;
    }
    // team
    const team = await this.em.findOne(Team, { id: targetId });
    if (!team) throw new Error('Team not found');
    return team.name;
  }

  private async fetchReports(
    type: 'employee' | 'project' | 'team',
    targetId: string,
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<MetricReport[]> {
    // Get last monday within the period for comparison
    const lastMonday = getMonday(periodEnd);

    if (type === 'employee') {
      // All reports for this login across user's subscriptions
      const subs = await this.em.find(Subscription, { ownerId: userId });
      if (subs.length === 0) return [];
      return this.em.find(MetricReport, {
        subscription: { $in: subs.map(s => s.id) },
        youtrackLogin: targetId,
        periodStart: { $gte: periodStart, $lte: lastMonday },
      }, {
        populate: ['subscription'],
        orderBy: { periodStart: 'ASC' },
      });
    }

    if (type === 'project') {
      return this.em.find(MetricReport, {
        subscription: targetId,
        periodStart: { $gte: periodStart, $lte: lastMonday },
      }, {
        populate: ['subscription'],
        orderBy: { periodStart: 'ASC' },
      });
    }

    // team: fetch all logins from team members, then all their reports
    const team = await this.em.findOne(Team, { id: targetId }, { populate: ['members'] });
    if (!team) throw new Error('Team not found');
    const logins = team.members.getItems().map(m => m.youtrackLogin);
    if (logins.length === 0) return [];

    const subs = await this.em.find(Subscription, { ownerId: userId });
    if (subs.length === 0) return [];

    return this.em.find(MetricReport, {
      subscription: { $in: subs.map(s => s.id) },
      youtrackLogin: { $in: logins },
      periodStart: { $gte: periodStart, $lte: lastMonday },
    }, {
      populate: ['subscription'],
      orderBy: { periodStart: 'ASC' },
    });
  }

  private buildWeeklyData(reports: MetricReport[], type: 'employee' | 'project' | 'team'): WeeklyDataItem[] {
    // Group reports by periodStart
    const byWeek = new Map<string, MetricReport[]>();
    for (const r of reports) {
      const key = formatYTDate(r.periodStart);
      if (!byWeek.has(key)) byWeek.set(key, []);
      byWeek.get(key)!.push(r);
    }

    const sortedKeys = [...byWeek.keys()].sort();

    return sortedKeys.map(key => {
      const weekReports = byWeek.get(key)!;

      if (type === 'employee') {
        // For employee: aggregate across projects (multiple subscriptions)
        const totalSpentMinutes = weekReports.reduce((s, r) => s + r.totalSpentMinutes, 0);
        return {
          periodStart: key,
          periodEnd: formatYTDate(weekReports[0].periodEnd),
          score: avgNullable(weekReports.map(r => getEffectiveScore(r))),
          utilization: avgNullable(weekReports.map(r => r.utilization)),
          estimationAccuracy: avgNullable(weekReports.map(r => r.estimationAccuracy)),
          focus: avgNullable(weekReports.map(r => r.focus)),
          completionRate: avgNullable(weekReports.map(r => r.completionRate)),
          avgCycleTimeHours: avgNullable(weekReports.map(r => r.avgCycleTimeHours)),
          totalSpentHours: minutesToHours(totalSpentMinutes),
          completedIssues: weekReports.reduce((s, r) => s + r.completedIssues, 0),
          totalIssues: weekReports.reduce((s, r) => s + r.totalIssues, 0),
          overdueIssues: weekReports.reduce((s, r) => s + r.overdueIssues, 0),
        };
      }

      // project/team: aggregate across all employees for this week
      const totalSpentMinutes = weekReports.reduce((s, r) => s + r.totalSpentMinutes, 0);
      return {
        periodStart: key,
        periodEnd: formatYTDate(weekReports[0].periodEnd),
        score: avgNullable(weekReports.map(r => getEffectiveScore(r))),
        utilization: avgNullable(weekReports.map(r => r.utilization)),
        estimationAccuracy: avgNullable(weekReports.map(r => r.estimationAccuracy)),
        focus: avgNullable(weekReports.map(r => r.focus)),
        completionRate: avgNullable(weekReports.map(r => r.completionRate)),
        avgCycleTimeHours: avgNullable(weekReports.map(r => r.avgCycleTimeHours)),
        totalSpentHours: minutesToHours(totalSpentMinutes),
        completedIssues: weekReports.reduce((s, r) => s + r.completedIssues, 0),
        totalIssues: weekReports.reduce((s, r) => s + r.totalIssues, 0),
        overdueIssues: weekReports.reduce((s, r) => s + r.overdueIssues, 0),
      };
    });
  }

  private buildWeeklyTrends(weeklyData: WeeklyDataItem[]): WeeklyTrendItem[] {
    return weeklyData.map((week, i) => {
      const prev = i > 0 ? weeklyData[i - 1] : null;
      return {
        periodStart: week.periodStart,
        score: calcMetricTrend(week.score, prev?.score ?? null, 5),
        utilization: calcMetricTrend(week.utilization, prev?.utilization ?? null, 5),
        estimationAccuracy: calcMetricTrend(week.estimationAccuracy, prev?.estimationAccuracy ?? null, 5),
        focus: calcMetricTrend(week.focus, prev?.focus ?? null, 5),
        completionRate: calcMetricTrend(week.completionRate, prev?.completionRate ?? null, 5),
      };
    });
  }

  private buildOverallTrend(weeklyData: WeeklyDataItem[]): OverallTrend {
    const first = weeklyData.length > 0 ? weeklyData[0] : null;
    const last = weeklyData.length > 1 ? weeklyData[weeklyData.length - 1] : null;

    return {
      score: calcMetricTrend(last?.score ?? null, first?.score ?? null, 5),
      utilization: calcMetricTrend(last?.utilization ?? null, first?.utilization ?? null, 5),
      estimationAccuracy: calcMetricTrend(last?.estimationAccuracy ?? null, first?.estimationAccuracy ?? null, 5),
      focus: calcMetricTrend(last?.focus ?? null, first?.focus ?? null, 5),
      completionRate: calcMetricTrend(last?.completionRate ?? null, first?.completionRate ?? null, 5),
      spentHours: calcMetricTrend(last?.totalSpentHours ?? null, first?.totalSpentHours ?? null, 10),
    };
  }

  private buildWeeklyLlmSummaries(reports: MetricReport[], type: 'employee' | 'project' | 'team'): WeeklyLlmItem[] {
    // Group by week
    const byWeek = new Map<string, MetricReport[]>();
    for (const r of reports) {
      const key = formatYTDate(r.periodStart);
      if (!byWeek.has(key)) byWeek.set(key, []);
      byWeek.get(key)!.push(r);
    }

    const sortedKeys = [...byWeek.keys()].sort();

    return sortedKeys.map(key => {
      const weekReports = byWeek.get(key)!;

      if (type === 'employee') {
        // Take first report with LLM data
        const withLlm = weekReports.find(r => r.llmSummary);
        return {
          periodStart: key,
          score: withLlm ? getEffectiveScore(withLlm) : avgNullable(weekReports.map(r => getEffectiveScore(r))),
          summary: withLlm?.llmSummary ?? null,
          concerns: withLlm?.llmConcerns ?? null,
          recommendations: withLlm?.llmRecommendations ?? null,
        };
      }

      // project/team: combine all LLM summaries for the week
      const summaries = weekReports.filter(r => r.llmSummary).map(r => r.llmSummary!);
      const allConcerns = weekReports.flatMap(r => r.llmConcerns ?? []);
      const allRecs = weekReports.flatMap(r => r.llmRecommendations ?? []);

      return {
        periodStart: key,
        score: avgNullable(weekReports.map(r => getEffectiveScore(r))),
        summary: summaries.length > 0 ? summaries.join('\n\n') : null,
        concerns: allConcerns.length > 0 ? allConcerns : null,
        recommendations: allRecs.length > 0 ? allRecs : null,
      };
    });
  }

  private async buildEmployeesData(reports: MetricReport[]): Promise<EmployeeAggItem[]> {
    // Group by youtrackLogin
    const byLogin = new Map<string, MetricReport[]>();
    for (const r of reports) {
      if (!byLogin.has(r.youtrackLogin)) byLogin.set(r.youtrackLogin, []);
      byLogin.get(r.youtrackLogin)!.push(r);
    }

    const result: EmployeeAggItem[] = [];

    for (const [login, empReports] of byLogin) {
      const scores = empReports.map(r => getEffectiveScore(r));

      result.push({
        youtrackLogin: login,
        displayName: login, // Will be resolved below
        avgScore: avgNullable(scores),
        avgUtilization: avgNullable(empReports.map(r => r.utilization)),
        avgCompletionRate: avgNullable(empReports.map(r => r.completionRate)),
        completedIssues: empReports.reduce((s, r) => s + r.completedIssues, 0),
        totalIssues: empReports.reduce((s, r) => s + r.totalIssues, 0),
        scoreTrend: calcTrend(scores),
      });
    }

    // Resolve displayNames from SubscriptionEmployee
    const logins = result.map(e => e.youtrackLogin);
    const employees = await this.em.find(SubscriptionEmployee, { youtrackLogin: { $in: logins } });
    const nameMap = new Map<string, string>();
    for (const e of employees) {
      if (!nameMap.has(e.youtrackLogin)) {
        nameMap.set(e.youtrackLogin, e.displayName);
      }
    }
    for (const item of result) {
      item.displayName = nameMap.get(item.youtrackLogin) ?? item.youtrackLogin;
    }

    return result;
  }

  private aggregateMetrics(reports: MetricReport[]): AggregatedMetricsDTO {
    return {
      totalIssues: reports.reduce((s, r) => s + r.totalIssues, 0),
      completedIssues: reports.reduce((s, r) => s + r.completedIssues, 0),
      overdueIssues: reports.reduce((s, r) => s + r.overdueIssues, 0),
      totalSpentHours: minutesToHours(reports.reduce((s, r) => s + r.totalSpentMinutes, 0)),
      totalEstimationHours: minutesToHours(reports.reduce((s, r) => s + r.totalEstimationMinutes, 0)),
      avgUtilization: avgNullable(reports.map(r => r.utilization)),
      avgEstimationAccuracy: avgNullable(reports.map(r => r.estimationAccuracy)),
      avgFocus: avgNullable(reports.map(r => r.focus)),
      avgCompletionRate: avgNullable(reports.map(r => r.completionRate)),
      avgCycleTimeHours: avgNullable(reports.map(r => r.avgCycleTimeHours)),
      avgScore: avgNullable(reports.map(r => getEffectiveScore(r))),
    };
  }
}
