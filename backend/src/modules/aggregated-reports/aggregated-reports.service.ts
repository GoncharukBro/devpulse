/**
 * Бизнес-логика агрегированных отчётов: создание, список, просмотр, удаление.
 */

import { EntityManager, MikroORM } from '@mikro-orm/postgresql';
import { Subscription } from '../../entities/subscription.entity';
import { SubscriptionEmployee } from '../../entities/subscription-employee.entity';
import { Team } from '../../entities/team.entity';
import { AggregatedReport } from '../../entities/aggregated-report.entity';
import { formatYTDate } from '../../common/utils/week-utils';
import { minutesToHours } from '../../common/utils/metrics-utils';
import { LlmService } from '../llm/llm.service';
import {
  CreateRequest,
  CreateResponse,
  WeeklyDataItem,
  WeeklyTrendItem,
  OverallTrend,
  WeeklyLlmItem,
  EmployeeAggItem,
  AggregatedReportDTO,
  AggregatedReportListItem,
  ListResponse,
} from './aggregated-reports.types';
import { ReportCollector } from './report-collector';
import { ReportLlmPipeline } from './report-llm-pipeline';
import { aggregateCollectedData, aggregateMetricsFromCollected } from './report-aggregator';

export class AggregatedReportsService {
  private log = {
    info: (...args: unknown[]) => console.log('[AggReports]', ...args),
    warn: (...args: unknown[]) => console.warn('[AggReports]', ...args),
    error: (...args: unknown[]) => console.error('[AggReports]', ...args),
  };

  constructor(
    private em: EntityManager,
    private llmService: LlmService | null,
    private orm: MikroORM,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────
  async create(params: CreateRequest & { userId: string }): Promise<CreateResponse> {
    const dateFrom = new Date(params.dateFrom);
    const dateTo = new Date(params.dateTo);

    if (dateFrom >= dateTo) throw new Error('dateFrom must be before dateTo');
    if (dateFrom > new Date()) throw new Error('Period cannot be in the future');

    const targetName = await this.resolveTargetName(params.type, params.targetId, params.userId);
    const days = (dateTo.getTime() - dateFrom.getTime()) / 86400000;
    const weeksCount = Math.ceil(days / 7);

    const report = new AggregatedReport();
    report.type = params.type;
    report.targetName = targetName;
    report.periodStart = dateFrom;
    report.periodEnd = dateTo;
    report.weeksCount = weeksCount;
    report.status = 'collecting';
    report.createdBy = params.userId;

    if (params.type === 'employee') report.targetLogin = params.targetId;
    else if (params.type === 'project') report.targetSubscriptionId = params.targetId;
    else report.targetTeamId = params.targetId;

    this.em.persist(report);
    await this.em.flush();

    const reportId = report.id;
    const reportType = params.type;
    const targetId = params.targetId;
    const userId = params.userId;

    setImmediate(() => {
      this.runPipeline(reportId, reportType, targetId, userId, dateFrom, dateTo).catch((err) => {
        this.log.error(`Report pipeline failed: ${(err as Error).message}`);
      });
    });

    return { id: report.id, status: 'collecting' };
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
      status: r.status,
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
      progress: null,
      collectedData: null,
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

  private async runPipeline(
    reportId: string,
    type: 'employee' | 'project' | 'team',
    targetId: string,
    userId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<void> {
    const em = this.orm.em.fork();
    try {
      const report = await em.findOneOrFail(AggregatedReport, reportId);

      // Phase 1: Collect
      const collector = new ReportCollector(em, this.log as any);
      const targets = await collector.resolveTargets(type, targetId, userId);
      if (targets.length === 0) {
        report.status = 'failed';
        report.errorMessage = 'No active employees found';
        report.progress = null;
        await em.flush();
        return;
      }

      const collected = await collector.collect(report, targets, dateFrom, dateTo);
      if (collected.employees.length === 0) {
        report.status = 'failed';
        report.errorMessage = 'Collection returned no data';
        report.progress = null;
        await em.flush();
        return;
      }

      report.collectedData = collected as unknown as object;

      // Phase 2: Aggregate
      const employeesData = aggregateCollectedData(collected, type, dateFrom, dateTo);
      const metrics = aggregateMetricsFromCollected(collected);

      report.totalIssues = metrics.totalIssues;
      report.completedIssues = metrics.completedIssues;
      report.overdueIssues = metrics.overdueIssues;
      report.totalSpentMinutes = Math.round(metrics.totalSpentHours * 60);
      report.totalEstimationMinutes = Math.round(metrics.totalEstimationHours * 60);
      report.avgUtilization = metrics.avgUtilization ?? undefined;
      report.avgEstimationAccuracy = metrics.avgEstimationAccuracy ?? undefined;
      report.avgFocus = metrics.avgFocus ?? undefined;
      report.avgCompletionRate = metrics.avgCompletionRate ?? undefined;
      report.avgCycleTimeHours = metrics.avgCycleTimeHours ?? undefined;
      report.employeesData = employeesData as unknown as object[];
      await em.flush();

      // Phase 3: LLM
      if (this.llmService) {
        const pipeline = new ReportLlmPipeline(this.orm, this.llmService, this.log as any);
        await pipeline.analyze(reportId, type, collected, employeesData);
      } else {
        report.status = 'ready';
        report.progress = null;
        await em.flush();
      }
    } catch (err) {
      try {
        const freshEm = this.orm.em.fork();
        const failedReport = await freshEm.findOne(AggregatedReport, reportId);
        if (failedReport) {
          failedReport.status = 'failed';
          failedReport.errorMessage = (err as Error).message;
          failedReport.progress = null;
          await freshEm.flush();
        }
      } catch { /* ignore */ }
    }
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
}
