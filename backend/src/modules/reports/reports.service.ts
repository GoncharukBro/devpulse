/**
 * Бизнес-логика агрегации метрик для отчётов.
 */

import { EntityManager } from '@mikro-orm/postgresql';
import { Subscription } from '../../entities/subscription.entity';
import { SubscriptionEmployee } from '../../entities/subscription-employee.entity';
import { MetricReport } from '../../entities/metric-report.entity';
import { Achievement } from '../../entities/achievement.entity';
import { Team } from '../../entities/team.entity';
import { NotFoundError } from '../../common/errors';
import { formatYTDate } from '../../common/utils/week-utils';
import { AchievementsService } from '../achievements/achievements.service';
import {
  EmployeeReportDTO,
  EmployeeHistoryDTO,
  EmployeeSummaryDTO,
  ProjectSummaryDTO,
  ProjectHistoryDTO,
  OverviewDTO,
  EmployeeListItem,
  PaginatedEmployeeReports,
  ScoreTrend,
  ProjectConcernItem,
  OverviewConcernItem,
  ProjectWeekData,
  EmployeeWeekData,
} from './reports.types';
import {
  generateEmployeeEmailHtml,
  generateProjectEmailHtml,
  generateTeamEmailHtml,
  generateSubject,
  type EmployeeEmailData,
  type ProjectEmailData,
  type TeamEmailData,
} from './email-template';

function getEffectiveScore(report: MetricReport): number | null {
  return report.llmScore ?? null;
}

function getScoreSource(report: MetricReport): 'llm' | null {
  if (report.llmScore != null) return 'llm';
  return null;
}

function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

function minutesByTypeToHours(byType: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(byType)) {
    result[k] = minutesToHours(v);
  }
  return result;
}

function calcTrend(scores: Array<number | null>): ScoreTrend {
  const valid = scores.filter((s): s is number => s !== null);
  if (valid.length < 2) return null;
  const last = valid[valid.length - 1];
  const prev = valid[valid.length - 2];
  const diff = last - prev;
  if (diff > 5) return 'up';
  if (diff < -5) return 'down';
  return 'stable';
}

function avgNullable(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 100) / 100;
}

export class ReportsService {
  constructor(private em: EntityManager) {}

  // ─── Employee Report ───────────────────────────────────────────────

  async getEmployeeReport(params: {
    youtrackLogin: string;
    subscriptionId: string;
    periodStart: Date;
    userId: string;
  }): Promise<EmployeeReportDTO | null> {
    const sub = await this.em.findOne(Subscription, {
      id: params.subscriptionId,
      ownerId: params.userId,
    });
    if (!sub) throw new NotFoundError('Subscription not found');

    const report = await this.em.findOne(MetricReport, {
      subscription: sub,
      youtrackLogin: params.youtrackLogin,
      periodStart: params.periodStart,
    });
    if (!report) return null;

    const employee = await this.em.findOne(SubscriptionEmployee, {
      subscription: sub,
      youtrackLogin: params.youtrackLogin,
    });

    return {
      youtrackLogin: report.youtrackLogin,
      displayName: employee?.displayName ?? report.youtrackLogin,
      email: employee?.email,
      subscriptionId: sub.id,
      projectName: sub.projectName,
      periodStart: formatYTDate(report.periodStart),
      periodEnd: formatYTDate(report.periodEnd),

      score: getEffectiveScore(report),
      scoreSource: getScoreSource(report),

      totalIssues: report.totalIssues,
      completedIssues: report.completedIssues,
      inProgressIssues: report.inProgressIssues,
      overdueIssues: report.overdueIssues,
      issuesByType: report.issuesByType,
      issuesWithoutEstimation: report.issuesWithoutEstimation,
      issuesOverEstimation: report.issuesOverEstimation,

      totalSpentHours: minutesToHours(report.totalSpentMinutes),
      spentByType: minutesByTypeToHours(report.spentByType),
      totalEstimationHours: minutesToHours(report.totalEstimationMinutes),
      aiSavingHours: minutesToHours(report.aiSavingMinutes),

      utilization: report.utilization ?? null,
      estimationAccuracy: report.estimationAccuracy ?? null,
      focus: report.focus ?? null,
      avgComplexityHours: report.avgComplexityHours ?? null,
      completionRate: report.completionRate ?? null,
      avgCycleTimeHours: report.avgCycleTimeHours ?? null,

      llmSummary: report.llmSummary ?? null,
      llmAchievements: report.llmAchievements ?? null,
      llmConcerns: report.llmConcerns ?? null,
      llmRecommendations: report.llmRecommendations ?? null,
      llmTaskClassification: report.llmTaskClassification ?? null,

      status: report.status,
      llmStatus: report.llmStatus,
      llmProcessedAt: report.llmProcessedAt?.toISOString() ?? null,

      bugsAfterRelease: report.bugsAfterRelease,
      bugsOnTest: report.bugsOnTest,
    };
  }

  // ─── Employee History ──────────────────────────────────────────────

  async getEmployeeHistory(params: {
    youtrackLogin: string;
    userId: string;
    subscriptionId?: string;
    weeks?: number;
  }): Promise<EmployeeHistoryDTO> {
    const weeksCount = params.weeks ?? 12;

    const subscriptions = await this.getUserSubscriptions(params.userId, params.subscriptionId);

    const reports = await this.em.find(
      MetricReport,
      {
        subscription: { $in: subscriptions.map((s) => s.id) },
        youtrackLogin: params.youtrackLogin,
      },
      {
        orderBy: { periodStart: 'DESC' },
        limit: weeksCount,
      },
    );

    // Sort ascending for display
    reports.sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());

    const employee = await this.findEmployee(subscriptions, params.youtrackLogin);

    const weeks: EmployeeWeekData[] = reports.map((r) => ({
      periodStart: formatYTDate(r.periodStart),
      periodEnd: formatYTDate(r.periodEnd),
      score: getEffectiveScore(r),
      utilization: r.utilization ?? null,
      estimationAccuracy: r.estimationAccuracy ?? null,
      focus: r.focus ?? null,
      completionRate: r.completionRate ?? null,
      avgCycleTimeHours: r.avgCycleTimeHours ?? null,
      totalSpentHours: minutesToHours(r.totalSpentMinutes),
      completedIssues: r.completedIssues,
      totalIssues: r.totalIssues,
    }));

    const scores = weeks.map((w) => w.score);
    const scoreTrend = calcTrend(scores);
    const avgScore = avgNullable(scores);

    return {
      youtrackLogin: params.youtrackLogin,
      displayName: employee?.displayName ?? params.youtrackLogin,
      weeks,
      scoreTrend,
      avgScore,
    };
  }

  // ─── Employee Summary ──────────────────────────────────────────────

  async getEmployeeSummary(params: {
    youtrackLogin: string;
    userId: string;
  }): Promise<EmployeeSummaryDTO> {
    const subscriptions = await this.getUserSubscriptions(params.userId);
    const employee = await this.findEmployee(subscriptions, params.youtrackLogin);

    // Get all reports for this employee across all subscriptions
    const allReports = await this.em.find(
      MetricReport,
      {
        subscription: { $in: subscriptions.map((s) => s.id) },
        youtrackLogin: params.youtrackLogin,
      },
      {
        populate: ['subscription'],
        orderBy: { periodStart: 'DESC' },
      },
    );

    // Group by subscription to get per-project info
    const bySubscription = new Map<string, MetricReport[]>();
    for (const r of allReports) {
      const subId = r.subscription.id;
      if (!bySubscription.has(subId)) bySubscription.set(subId, []);
      bySubscription.get(subId)!.push(r);
    }

    const projects: EmployeeSummaryDTO['projects'] = [];
    for (const sub of subscriptions) {
      const subReports = bySubscription.get(sub.id);
      if (!subReports || subReports.length === 0) continue;

      const lastScore = getEffectiveScore(subReports[0]);
      const scores = subReports.slice(0, 4).map((r) => getEffectiveScore(r));
      const scoreTrend = calcTrend(scores);

      projects.push({
        subscriptionId: sub.id,
        projectName: sub.projectName,
        projectShortName: sub.projectShortName,
        lastScore,
        scoreTrend,
      });
    }

    // Aggregate latest period across all projects
    const latestPeriod = allReports.length > 0 ? allReports[0].periodStart : null;
    const latestReports = latestPeriod
      ? allReports.filter((r) => r.periodStart.getTime() === latestPeriod.getTime())
      : [];

    const avgScore = avgNullable(latestReports.map((r) => getEffectiveScore(r)));
    const avgUtilization = avgNullable(latestReports.map((r) => r.utilization));
    const avgEstimationAccuracy = avgNullable(latestReports.map((r) => r.estimationAccuracy));
    const avgFocus = avgNullable(latestReports.map((r) => r.focus));
    const totalCompletedIssues = latestReports.reduce((s, r) => s + r.completedIssues, 0);

    // Overall trend
    const allScores = allReports.slice(0, 4).map((r) => getEffectiveScore(r));
    const scoreTrend = calcTrend(allScores);

    // Latest LLM data
    const withLlm = allReports.find((r) => r.llmSummary);
    const lastLlmSummary = withLlm?.llmSummary ?? null;
    const lastLlmConcerns = withLlm?.llmConcerns ?? null;

    // Employee achievements
    const achievementsService = new AchievementsService(this.em);
    const achievements = await achievementsService.getByEmployee(params.youtrackLogin, params.userId);

    return {
      youtrackLogin: params.youtrackLogin,
      displayName: employee?.displayName ?? params.youtrackLogin,
      email: employee?.email,
      projects,
      avgScore,
      avgUtilization,
      avgEstimationAccuracy,
      avgFocus,
      totalCompletedIssues,
      scoreTrend,
      lastLlmSummary,
      lastLlmConcerns,
      achievements,
    };
  }

  // ─── Project Summary ───────────────────────────────────────────────

  async getProjectSummary(params: {
    subscriptionId: string;
    userId: string;
  }): Promise<ProjectSummaryDTO> {
    const sub = await this.em.findOne(
      Subscription,
      { id: params.subscriptionId, ownerId: params.userId },
      { populate: ['employees'] },
    );
    if (!sub) throw new NotFoundError('Subscription not found');

    // Get last period
    const lastReport = await this.em.findOne(
      MetricReport,
      { subscription: sub },
      { orderBy: { periodStart: 'DESC' } },
    );

    const lastPeriodStart = lastReport?.periodStart ?? null;

    // Get all reports for last period
    const lastPeriodReports = lastPeriodStart
      ? await this.em.find(MetricReport, {
          subscription: sub,
          periodStart: lastPeriodStart,
        })
      : [];

    // Get previous period reports for trend
    const prevPeriodReports = await this.getPreviousPeriodReports(sub, lastPeriodStart);

    const prevScoreMap = new Map<string, number | null>();
    for (const r of prevPeriodReports) {
      prevScoreMap.set(r.youtrackLogin, getEffectiveScore(r));
    }

    // Build employees list
    const activeEmployees = sub.employees.getItems().filter((e) => e.isActive);
    const employeeMap = new Map<string, SubscriptionEmployee>();
    for (const e of activeEmployees) {
      employeeMap.set(e.youtrackLogin, e);
    }

    const employees = lastPeriodReports.map((r) => {
      const emp = employeeMap.get(r.youtrackLogin);
      const currentScore = getEffectiveScore(r);
      const prevScore = prevScoreMap.get(r.youtrackLogin) ?? null;
      const scoreTrend = calcTrend([prevScore, currentScore]);

      return {
        youtrackLogin: r.youtrackLogin,
        displayName: emp?.displayName ?? r.youtrackLogin,
        score: currentScore,
        utilization: r.utilization ?? null,
        estimationAccuracy: r.estimationAccuracy ?? null,
        completionRate: r.completionRate ?? null,
        completedIssues: r.completedIssues,
        totalIssues: r.totalIssues,
        scoreTrend,
        llmConcerns: r.llmConcerns ?? null,
      };
    });

    // Aggregated metrics
    const avgScore = avgNullable(lastPeriodReports.map((r) => getEffectiveScore(r)));
    const avgUtilization = avgNullable(lastPeriodReports.map((r) => r.utilization));
    const avgEstimationAccuracy = avgNullable(lastPeriodReports.map((r) => r.estimationAccuracy));
    const avgCompletionRate = avgNullable(lastPeriodReports.map((r) => r.completionRate));
    const avgCycleTimeHours = avgNullable(lastPeriodReports.map((r) => r.avgCycleTimeHours));

    // Trend
    const prevAvgScore = avgNullable(prevPeriodReports.map((r) => getEffectiveScore(r)));
    const scoreTrend = calcTrend([prevAvgScore, avgScore]);

    // Concerns
    const concerns = this.buildProjectConcerns(lastPeriodReports, prevPeriodReports, employeeMap);

    // Aggregated recommendations
    const recommendations: string[] = [];
    for (const r of lastPeriodReports) {
      if (r.llmRecommendations) {
        recommendations.push(...r.llmRecommendations);
      }
    }
    const uniqueRecs = [...new Set(recommendations)];

    return {
      subscriptionId: sub.id,
      projectName: sub.projectName,
      projectShortName: sub.projectShortName,
      isActive: sub.isActive,
      lastPeriodStart: lastPeriodStart ? formatYTDate(lastPeriodStart) : null,
      lastPeriodEnd: lastReport ? formatYTDate(lastReport.periodEnd) : null,
      avgScore,
      avgUtilization,
      avgEstimationAccuracy,
      avgCompletionRate,
      avgCycleTimeHours,
      totalEmployees: activeEmployees.length,
      scoreTrend,
      employees,
      concerns,
      aggregatedRecommendations: uniqueRecs,
    };
  }

  // ─── Project History ───────────────────────────────────────────────

  async getProjectHistory(params: {
    subscriptionId: string;
    userId: string;
    weeks?: number;
  }): Promise<ProjectHistoryDTO> {
    const sub = await this.em.findOne(Subscription, {
      id: params.subscriptionId,
      ownerId: params.userId,
    });
    if (!sub) throw new NotFoundError('Subscription not found');

    const weeksCount = params.weeks ?? 12;

    // Get distinct periods
    const allReports = await this.em.find(
      MetricReport,
      { subscription: sub },
      { orderBy: { periodStart: 'DESC' } },
    );

    // Group by periodStart
    const byPeriod = new Map<string, MetricReport[]>();
    for (const r of allReports) {
      const key = formatYTDate(r.periodStart);
      if (!byPeriod.has(key)) byPeriod.set(key, []);
      byPeriod.get(key)!.push(r);
    }

    const sortedPeriods = [...byPeriod.keys()].sort().slice(-weeksCount);

    const weeks: ProjectWeekData[] = sortedPeriods.map((periodKey) => {
      const reports = byPeriod.get(periodKey)!;
      return {
        periodStart: periodKey,
        periodEnd: formatYTDate(reports[0].periodEnd),
        avgScore: avgNullable(reports.map((r) => getEffectiveScore(r))),
        avgUtilization: avgNullable(reports.map((r) => r.utilization)),
        avgEstimationAccuracy: avgNullable(reports.map((r) => r.estimationAccuracy)),
        avgCompletionRate: avgNullable(reports.map((r) => r.completionRate)),
        totalCompletedIssues: reports.reduce((s, r) => s + r.completedIssues, 0),
        totalIssues: reports.reduce((s, r) => s + r.totalIssues, 0),
        employeesCount: reports.length,
      };
    });

    return { weeks };
  }

  // ─── Overview ──────────────────────────────────────────────────────

  async getOverview(userId: string): Promise<OverviewDTO> {
    const subscriptions = await this.getUserSubscriptions(userId);

    if (subscriptions.length === 0) {
      return {
        totalEmployees: 0,
        avgScore: null,
        avgUtilization: null,
        scoreTrend: null,
        concerns: [],
        recentAchievements: [],
        weeklyTrend: [],
      };
    }

    const subIds = subscriptions.map((s) => s.id);

    // All reports, ordered by period DESC
    const allReports = await this.em.find(
      MetricReport,
      { subscription: { $in: subIds } },
      {
        populate: ['subscription'],
        orderBy: { periodStart: 'DESC' },
      },
    );

    if (allReports.length === 0) {
      return {
        totalEmployees: 0,
        avgScore: null,
        avgUtilization: null,
        scoreTrend: null,
        concerns: [],
        recentAchievements: [],
        weeklyTrend: [],
      };
    }

    // Unique employees
    const uniqueLogins = new Set<string>();
    for (const r of allReports) {
      uniqueLogins.add(r.youtrackLogin);
    }

    // Last period: find the most recent periodStart
    const lastPeriod = allReports[0].periodStart;
    const lastPeriodReports = allReports.filter(
      (r) => r.periodStart.getTime() === lastPeriod.getTime(),
    );

    // Deduplicate by employee: average if in multiple projects
    const byEmployee = new Map<string, MetricReport[]>();
    for (const r of lastPeriodReports) {
      if (!byEmployee.has(r.youtrackLogin)) byEmployee.set(r.youtrackLogin, []);
      byEmployee.get(r.youtrackLogin)!.push(r);
    }

    const employeeScores: Array<number | null> = [];
    const employeeUtils: Array<number | null> = [];
    for (const reports of byEmployee.values()) {
      employeeScores.push(avgNullable(reports.map((r) => getEffectiveScore(r))));
      employeeUtils.push(avgNullable(reports.map((r) => r.utilization)));
    }

    const avgScore = avgNullable(employeeScores);
    const avgUtilization = avgNullable(employeeUtils);

    // Previous period for trend
    const prevPeriodReports = allReports.filter(
      (r) => r.periodStart.getTime() !== lastPeriod.getTime(),
    );
    const prevPeriod = prevPeriodReports.length > 0 ? prevPeriodReports[0].periodStart : null;
    const prevReports = prevPeriod
      ? prevPeriodReports.filter((r) => r.periodStart.getTime() === prevPeriod.getTime())
      : [];

    const prevByEmployee = new Map<string, MetricReport[]>();
    for (const r of prevReports) {
      if (!prevByEmployee.has(r.youtrackLogin)) prevByEmployee.set(r.youtrackLogin, []);
      prevByEmployee.get(r.youtrackLogin)!.push(r);
    }
    const prevEmployeeScores: Array<number | null> = [];
    for (const reports of prevByEmployee.values()) {
      prevEmployeeScores.push(avgNullable(reports.map((r) => getEffectiveScore(r))));
    }
    const prevAvgScore = avgNullable(prevEmployeeScores);
    const scoreTrend = calcTrend([prevAvgScore, avgScore]);

    // Concerns
    const employeeMap = await this.buildEmployeeMap(subscriptions);
    const concerns = this.buildOverviewConcerns(
      lastPeriodReports,
      prevReports,
      employeeMap,
    );

    // Weekly trend (last 12 weeks)
    const byPeriod = new Map<string, MetricReport[]>();
    for (const r of allReports) {
      const key = formatYTDate(r.periodStart);
      if (!byPeriod.has(key)) byPeriod.set(key, []);
      byPeriod.get(key)!.push(r);
    }

    const sortedPeriods = [...byPeriod.keys()].sort().slice(-12);
    const weeklyTrend = sortedPeriods.map((periodKey) => {
      const reports = byPeriod.get(periodKey)!;
      const uniqueEmp = new Set(reports.map((r) => r.youtrackLogin));

      // Deduplicate scores per employee
      const empScores: Array<number | null> = [];
      const empUtils: Array<number | null> = [];
      const empReports = new Map<string, MetricReport[]>();
      for (const r of reports) {
        if (!empReports.has(r.youtrackLogin)) empReports.set(r.youtrackLogin, []);
        empReports.get(r.youtrackLogin)!.push(r);
      }
      for (const reps of empReports.values()) {
        empScores.push(avgNullable(reps.map((r) => getEffectiveScore(r))));
        empUtils.push(avgNullable(reps.map((r) => r.utilization)));
      }

      return {
        periodStart: periodKey,
        periodEnd: formatYTDate(reports[0].periodEnd),
        avgScore: avgNullable(empScores),
        avgUtilization: avgNullable(empUtils),
        totalEmployees: uniqueEmp.size,
      };
    });

    // Fetch recent achievements
    const achievementsService = new AchievementsService(this.em);
    const recentAchievements = await achievementsService.getRecent(userId, 5);

    return {
      totalEmployees: uniqueLogins.size,
      avgScore,
      avgUtilization,
      scoreTrend,
      concerns,
      recentAchievements,
      weeklyTrend,
    };
  }

  // ─── Employee List ─────────────────────────────────────────────────

  async getEmployeeList(
    userId: string,
    subscriptionId?: string,
  ): Promise<EmployeeListItem[]> {
    const subscriptions = await this.getUserSubscriptions(userId);
    if (subscriptions.length === 0) return [];

    const filteredSubs = subscriptionId
      ? subscriptions.filter((s) => s.id === subscriptionId)
      : subscriptions;
    if (filteredSubs.length === 0) return [];

    const subIds = filteredSubs.map((s) => s.id);

    // Get all employees across subscriptions
    const employees = await this.em.find(SubscriptionEmployee, {
      subscription: { $in: subIds },
    }, { populate: ['subscription'] });

    // Deduplicate by login
    const byLogin = new Map<string, { emp: SubscriptionEmployee; projects: string[] }>();
    for (const emp of employees) {
      if (!byLogin.has(emp.youtrackLogin)) {
        byLogin.set(emp.youtrackLogin, { emp, projects: [] });
      }
      byLogin.get(emp.youtrackLogin)!.projects.push(emp.subscription.projectName);
    }

    // Get latest reports for each unique employee
    const result: EmployeeListItem[] = [];

    for (const [login, { emp, projects }] of byLogin) {
      const reports = await this.em.find(
        MetricReport,
        {
          subscription: { $in: subIds },
          youtrackLogin: login,
        },
        { orderBy: { periodStart: 'DESC' }, limit: 4 },
      );

      const lastReport = reports.length > 0 ? reports[0] : null;
      const lastScore = lastReport ? getEffectiveScore(lastReport) : null;
      const scores = reports.map((r) => getEffectiveScore(r));
      const scoreTrend = calcTrend(scores);

      result.push({
        youtrackLogin: login,
        displayName: emp.displayName,
        email: emp.email,
        projects: [...new Set(projects)],
        lastScore,
        utilization: lastReport?.utilization ?? null,
        estimationAccuracy: lastReport?.estimationAccuracy ?? null,
        completionRate: lastReport?.completionRate ?? null,
        scoreTrend,
      });
    }

    return result;
  }

  // ─── Employee Report List ──────────────────────────────────────────

  async getEmployeeReportList(params: {
    youtrackLogin: string;
    userId: string;
    subscriptionId?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedEmployeeReports> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const offset = (page - 1) * limit;

    const subscriptions = await this.getUserSubscriptions(params.userId, params.subscriptionId);
    const subIds = subscriptions.map((s) => s.id);

    const [reports, total] = await this.em.findAndCount(
      MetricReport,
      {
        subscription: { $in: subIds },
        youtrackLogin: params.youtrackLogin,
      },
      {
        populate: ['subscription'],
        orderBy: { periodStart: 'DESC' },
        limit,
        offset,
      },
    );

    const data = reports.map((r) => ({
      periodStart: formatYTDate(r.periodStart),
      periodEnd: formatYTDate(r.periodEnd),
      score: getEffectiveScore(r),
      scoreSource: getScoreSource(r),
      utilization: r.utilization ?? null,
      completedIssues: r.completedIssues,
      totalIssues: r.totalIssues,
      status: r.status,
      subscriptionId: r.subscription.id,
      projectName: r.subscription.projectName,
    }));

    return { data, total, page, limit };
  }

  // ─── Private Helpers ───────────────────────────────────────────────

  private async getUserSubscriptions(
    userId: string,
    subscriptionId?: string,
  ): Promise<Subscription[]> {
    if (subscriptionId) {
      const sub = await this.em.findOne(Subscription, {
        id: subscriptionId,
        ownerId: userId,
      });
      if (!sub) throw new NotFoundError('Subscription not found');
      return [sub];
    }
    return this.em.find(Subscription, { ownerId: userId });
  }

  private async findEmployee(
    subscriptions: Subscription[],
    login: string,
  ): Promise<SubscriptionEmployee | null> {
    return this.em.findOne(SubscriptionEmployee, {
      subscription: { $in: subscriptions.map((s) => s.id) },
      youtrackLogin: login,
    });
  }

  private async getPreviousPeriodReports(
    sub: Subscription,
    lastPeriodStart: Date | null,
  ): Promise<MetricReport[]> {
    if (!lastPeriodStart) return [];

    const prevReport = await this.em.findOne(
      MetricReport,
      {
        subscription: sub,
        periodStart: { $lt: lastPeriodStart },
      },
      { orderBy: { periodStart: 'DESC' } },
    );

    if (!prevReport) return [];

    return this.em.find(MetricReport, {
      subscription: sub,
      periodStart: prevReport.periodStart,
    });
  }

  private async buildEmployeeMap(
    subscriptions: Subscription[],
  ): Promise<Map<string, SubscriptionEmployee>> {
    const employees = await this.em.find(SubscriptionEmployee, {
      subscription: { $in: subscriptions.map((s) => s.id) },
    });
    const map = new Map<string, SubscriptionEmployee>();
    for (const e of employees) {
      if (!map.has(e.youtrackLogin)) map.set(e.youtrackLogin, e);
    }
    return map;
  }

  private buildProjectConcerns(
    currentReports: MetricReport[],
    prevReports: MetricReport[],
    employeeMap: Map<string, SubscriptionEmployee>,
  ): ProjectConcernItem[] {
    const prevScoreMap = new Map<string, number | null>();
    for (const r of prevReports) {
      prevScoreMap.set(r.youtrackLogin, getEffectiveScore(r));
    }

    const concerns: ProjectConcernItem[] = [];

    for (const r of currentReports) {
      const displayName =
        employeeMap.get(r.youtrackLogin)?.displayName ?? r.youtrackLogin;
      const currentScore = getEffectiveScore(r);
      const prevScore = prevScoreMap.get(r.youtrackLogin) ?? null;

      // Score drop
      if (currentScore !== null && prevScore !== null) {
        const drop = prevScore - currentScore;
        if (drop > 10) {
          concerns.push({
            youtrackLogin: r.youtrackLogin,
            displayName,
            reason: `Падение score: ${prevScore} → ${currentScore}`,
            severity: 'danger',
          });
        } else if (drop > 5) {
          concerns.push({
            youtrackLogin: r.youtrackLogin,
            displayName,
            reason: `Падение score: ${prevScore} → ${currentScore}`,
            severity: 'warning',
          });
        }
      }

      // Utilization
      if (r.utilization != null) {
        if (r.utilization > 110) {
          concerns.push({
            youtrackLogin: r.youtrackLogin,
            displayName,
            reason: `Высокая загрузка (${Math.round(r.utilization)}%)`,
            severity: 'danger',
          });
        } else if (r.utilization < 50) {
          concerns.push({
            youtrackLogin: r.youtrackLogin,
            displayName,
            reason: `Низкая загрузка (${Math.round(r.utilization)}%)`,
            severity: 'warning',
          });
        }
      }

      // LLM concerns
      if (r.llmConcerns && r.llmConcerns.length > 0) {
        concerns.push({
          youtrackLogin: r.youtrackLogin,
          displayName,
          reason: 'Замечания от LLM',
          severity: 'warning',
        });
      }

      // Estimation accuracy
      if (r.estimationAccuracy != null && r.estimationAccuracy < 50) {
        concerns.push({
          youtrackLogin: r.youtrackLogin,
          displayName,
          reason: `Низкая точность оценок (${Math.round(r.estimationAccuracy)}%)`,
          severity: 'warning',
        });
      }
    }

    return concerns;
  }

  private buildOverviewConcerns(
    currentReports: MetricReport[],
    prevReports: MetricReport[],
    employeeMap: Map<string, SubscriptionEmployee>,
  ): OverviewConcernItem[] {
    const prevScoreMap = new Map<string, number | null>();
    for (const r of prevReports) {
      const key = `${r.youtrackLogin}:${r.subscription.id}`;
      prevScoreMap.set(key, getEffectiveScore(r));
    }

    const concerns: OverviewConcernItem[] = [];

    for (const r of currentReports) {
      const displayName =
        employeeMap.get(r.youtrackLogin)?.displayName ?? r.youtrackLogin;
      const projectName = r.subscription.projectName;
      const currentScore = getEffectiveScore(r);
      const key = `${r.youtrackLogin}:${r.subscription.id}`;
      const prevScore = prevScoreMap.get(key) ?? null;

      if (currentScore !== null && prevScore !== null) {
        const drop = prevScore - currentScore;
        if (drop > 10) {
          concerns.push({
            youtrackLogin: r.youtrackLogin,
            displayName,
            projectName,
            reason: `Падение score: ${prevScore} → ${currentScore}`,
            severity: 'danger',
          });
        } else if (drop > 5) {
          concerns.push({
            youtrackLogin: r.youtrackLogin,
            displayName,
            projectName,
            reason: `Падение score: ${prevScore} → ${currentScore}`,
            severity: 'warning',
          });
        }
      }

      if (r.utilization != null) {
        if (r.utilization > 110) {
          concerns.push({
            youtrackLogin: r.youtrackLogin,
            displayName,
            projectName,
            reason: `Высокая загрузка (${Math.round(r.utilization)}%)`,
            severity: 'danger',
          });
        } else if (r.utilization < 50) {
          concerns.push({
            youtrackLogin: r.youtrackLogin,
            displayName,
            projectName,
            reason: `Низкая загрузка (${Math.round(r.utilization)}%)`,
            severity: 'warning',
          });
        }
      }

      if (r.llmConcerns && r.llmConcerns.length > 0) {
        concerns.push({
          youtrackLogin: r.youtrackLogin,
          displayName,
          projectName,
          reason: 'Замечания от LLM',
          severity: 'warning',
        });
      }

      if (r.estimationAccuracy != null && r.estimationAccuracy < 50) {
        concerns.push({
          youtrackLogin: r.youtrackLogin,
          displayName,
          projectName,
          reason: `Низкая точность оценок (${Math.round(r.estimationAccuracy)}%)`,
          severity: 'warning',
        });
      }
    }

    return concerns;
  }

  // ─── Email Preview ─────────────────────────────────────────────────

  async getEmailPreview(params: {
    type: 'employee' | 'project' | 'team';
    userId: string;
    youtrackLogin?: string;
    subscriptionId?: string;
    teamId?: string;
    periodStart?: string;
  }): Promise<{ subject: string; html: string }> {
    if (params.type === 'employee') {
      return this.getEmployeeEmailPreview(params.userId, params.youtrackLogin!, params.subscriptionId!, params.periodStart);
    }
    if (params.type === 'project') {
      return this.getProjectEmailPreview(params.userId, params.subscriptionId!, params.periodStart);
    }
    return this.getTeamEmailPreview(params.userId, params.teamId!, params.periodStart);
  }

  private async getEmployeeEmailPreview(
    userId: string,
    youtrackLogin: string,
    subscriptionId: string,
    periodStart?: string,
  ): Promise<{ subject: string; html: string }> {
    const sub = await this.em.findOne(Subscription, {
      id: subscriptionId,
      ownerId: userId,
    });
    if (!sub) throw new NotFoundError('Subscription not found');

    // Find report
    const reportWhere: Record<string, unknown> = {
      subscription: sub,
      youtrackLogin,
    };
    if (periodStart) {
      reportWhere.periodStart = new Date(periodStart);
    }

    const report = await this.em.findOne(MetricReport, reportWhere, {
      orderBy: { periodStart: 'DESC' },
    });
    if (!report) throw new NotFoundError('Report not found');

    // Find previous report for trend
    const prevReport = await this.em.findOne(
      MetricReport,
      {
        subscription: sub,
        youtrackLogin,
        periodStart: { $lt: report.periodStart },
      },
      { orderBy: { periodStart: 'DESC' } },
    );

    const employee = await this.em.findOne(SubscriptionEmployee, {
      subscription: sub,
      youtrackLogin,
    });

    // Find achievements for this period
    const achievements = await this.em.find(Achievement, {
      subscription: sub,
      youtrackLogin,
      periodStart: report.periodStart,
    });

    const DEFINITIONS_MAP = await this.getAchievementDefinitionsMap();

    const data: EmployeeEmailData = {
      employee: {
        displayName: employee?.displayName ?? youtrackLogin,
        login: youtrackLogin,
      },
      project: sub.projectName,
      period: {
        start: formatYTDate(report.periodStart),
        end: formatYTDate(report.periodEnd),
      },
      score: getEffectiveScore(report),
      prevScore: prevReport ? getEffectiveScore(prevReport) : null,
      kpis: {
        utilization: report.utilization ?? null,
        estimationAccuracy: report.estimationAccuracy ?? null,
        focus: report.focus ?? null,
        completionRate: report.completionRate ?? null,
        avgComplexity: report.avgComplexityHours ?? null,
        avgCycleTimeHours: report.avgCycleTimeHours ?? null,
      },
      tasks: {
        total: report.totalIssues,
        completed: report.completedIssues,
        inProgress: report.inProgressIssues,
        overdue: report.overdueIssues,
        byType: report.issuesByType,
      },
      time: {
        spentHours: minutesToHours(report.totalSpentMinutes),
        estimationHours: minutesToHours(report.totalEstimationMinutes),
      },
      llm: report.llmSummary
        ? {
            summary: report.llmSummary ?? null,
            achievements: report.llmAchievements ?? [],
            concerns: report.llmConcerns ?? [],
            recommendations: report.llmRecommendations ?? [],
          }
        : null,
      nftAchievements: achievements.map((a) => ({
        icon: DEFINITIONS_MAP.get(a.type) ?? '🏆',
        title: a.title,
        rarity: a.rarity,
      })),
    };

    const html = generateEmployeeEmailHtml(data);
    const subject = generateSubject(
      'employee',
      data.employee.displayName,
      data.period.start,
      data.period.end,
    );

    return { subject, html };
  }

  private async getProjectEmailPreview(
    userId: string,
    subscriptionId: string,
    periodStart?: string,
  ): Promise<{ subject: string; html: string }> {
    const sub = await this.em.findOne(
      Subscription,
      { id: subscriptionId, ownerId: userId },
      { populate: ['employees'] },
    );
    if (!sub) throw new NotFoundError('Subscription not found');

    // Find last report period
    const reportWhere: Record<string, unknown> = { subscription: sub };
    if (periodStart) {
      reportWhere.periodStart = new Date(periodStart);
    }

    const latestReport = await this.em.findOne(MetricReport, reportWhere, {
      orderBy: { periodStart: 'DESC' },
    });
    if (!latestReport) throw new NotFoundError('No reports found');

    const lastPeriodStart = latestReport.periodStart;

    // All reports for the period
    const reports = await this.em.find(MetricReport, {
      subscription: sub,
      periodStart: lastPeriodStart,
    });

    // Previous period for trend
    const prevPeriodReports = await this.getPreviousPeriodReports(sub, lastPeriodStart);
    const prevAvgScore = prevPeriodReports.length > 0
      ? avgNullable(prevPeriodReports.map((r) => getEffectiveScore(r)))
      : null;

    const employeeMap = new Map<string, SubscriptionEmployee>();
    for (const e of sub.employees.getItems()) {
      employeeMap.set(e.youtrackLogin, e);
    }

    const employees = reports.map((r) => {
      const emp = employeeMap.get(r.youtrackLogin);
      return {
        displayName: emp?.displayName ?? r.youtrackLogin,
        score: getEffectiveScore(r),
        utilization: r.utilization ?? null,
        completedIssues: r.completedIssues,
        totalIssues: r.totalIssues,
      };
    });

    // Build concerns
    const rawConcerns = this.buildProjectConcerns(reports, prevPeriodReports, employeeMap);
    const concernsByPerson = new Map<string, string[]>();
    for (const c of rawConcerns) {
      const arr = concernsByPerson.get(c.displayName) ?? [];
      arr.push(c.reason);
      concernsByPerson.set(c.displayName, arr);
    }
    const concerns = [...concernsByPerson.entries()].map(([displayName, reasons]) => ({
      displayName,
      reasons,
    }));

    // Aggregate recommendations
    const recommendations: string[] = [];
    for (const r of reports) {
      if (r.llmRecommendations) recommendations.push(...r.llmRecommendations);
    }

    const data: ProjectEmailData = {
      project: { name: sub.projectName, shortName: sub.projectShortName },
      period: {
        start: formatYTDate(lastPeriodStart),
        end: formatYTDate(latestReport.periodEnd),
      },
      avgScore: avgNullable(reports.map((r) => getEffectiveScore(r))),
      prevAvgScore: prevAvgScore,
      employeeCount: employees.length,
      employees,
      concerns,
      recommendations: [...new Set(recommendations)],
    };

    const html = generateProjectEmailHtml(data);
    const subject = generateSubject(
      'project',
      data.project.name,
      data.period.start,
      data.period.end,
    );

    return { subject, html };
  }

  private async getTeamEmailPreview(
    userId: string,
    teamId: string,
    periodStart?: string,
  ): Promise<{ subject: string; html: string }> {
    const team = await this.em.findOne(
      Team,
      { id: teamId, ownerId: userId },
      { populate: ['members'] },
    );
    if (!team) throw new NotFoundError('Team not found');

    const subscriptions = await this.getUserSubscriptions(userId);
    const subIds = subscriptions.map((s) => s.id);
    const logins = team.members.getItems().map((m) => m.youtrackLogin);

    if (logins.length === 0 || subIds.length === 0) {
      throw new NotFoundError('No data for team');
    }

    // Find latest period
    const reportWhere: Record<string, unknown> = {
      subscription: { $in: subIds },
      youtrackLogin: { $in: logins },
    };
    if (periodStart) {
      reportWhere.periodStart = new Date(periodStart);
    }

    const latestReport = await this.em.findOne(MetricReport, reportWhere, {
      orderBy: { periodStart: 'DESC' },
    });
    if (!latestReport) throw new NotFoundError('No reports found');

    const lastPeriodStart = latestReport.periodStart;

    // All reports for team members in this period
    const reports = await this.em.find(MetricReport, {
      subscription: { $in: subIds },
      youtrackLogin: { $in: logins },
      periodStart: lastPeriodStart,
    }, { populate: ['subscription'] });

    // Previous period for trend
    const prevReport = await this.em.findOne(MetricReport, {
      subscription: { $in: subIds },
      youtrackLogin: { $in: logins },
      periodStart: { $lt: lastPeriodStart },
    }, { orderBy: { periodStart: 'DESC' } });

    let prevAvgScore: number | null = null;
    if (prevReport) {
      const prevReports = await this.em.find(MetricReport, {
        subscription: { $in: subIds },
        youtrackLogin: { $in: logins },
        periodStart: prevReport.periodStart,
      });
      prevAvgScore = avgNullable(prevReports.map((r) => getEffectiveScore(r)));
    }

    // Employee names
    const employeeNames = await this.buildEmployeeMap(subscriptions);

    // Build members list (one entry per login, pick best report or first)
    const byLogin = new Map<string, MetricReport[]>();
    for (const r of reports) {
      const arr = byLogin.get(r.youtrackLogin) ?? [];
      arr.push(r);
      byLogin.set(r.youtrackLogin, arr);
    }

    const members: TeamEmailData['members'] = [];
    for (const login of logins) {
      const loginReports = byLogin.get(login);
      if (!loginReports || loginReports.length === 0) continue;
      const r = loginReports[0];
      members.push({
        displayName: employeeNames.get(login)?.displayName ?? login,
        projectName: r.subscription.projectName,
        score: getEffectiveScore(r),
        utilization: r.utilization ?? null,
        completionRate: r.completionRate ?? null,
        estimationAccuracy: r.estimationAccuracy ?? null,
      });
    }

    // Build concerns
    const concernsByPerson = new Map<string, string[]>();
    for (const r of reports) {
      const displayName = employeeNames.get(r.youtrackLogin)?.displayName ?? r.youtrackLogin;
      const reasons: string[] = [];

      const score = getEffectiveScore(r);
      if (score !== null && score < 50) {
        reasons.push(`Низкий score (${Math.round(score)})`);
      }
      if (r.utilization != null && r.utilization < 50) {
        reasons.push(`Низкая загрузка (${Math.round(r.utilization)}%)`);
      }
      if (r.llmConcerns && r.llmConcerns.length > 0) {
        reasons.push(...r.llmConcerns);
      }

      if (reasons.length > 0) {
        const existing = concernsByPerson.get(displayName) ?? [];
        existing.push(...reasons);
        concernsByPerson.set(displayName, existing);
      }
    }

    const concerns = [...concernsByPerson.entries()].map(([displayName, reasons]) => ({
      displayName,
      reasons: [...new Set(reasons)],
    }));

    // Achievements for team members in this period
    const achievementRecords = await this.em.find(Achievement, {
      subscription: { $in: subIds },
      youtrackLogin: { $in: logins },
      periodStart: lastPeriodStart,
    });

    const DEFINITIONS_MAP = await this.getAchievementDefinitionsMap();
    const teamAchievements = achievementRecords.map((a) => ({
      icon: DEFINITIONS_MAP.get(a.type) ?? '🏆',
      title: a.title,
      rarity: a.rarity,
      displayName: employeeNames.get(a.youtrackLogin)?.displayName ?? a.youtrackLogin,
    }));

    const data: TeamEmailData = {
      team: { name: team.name },
      period: {
        start: formatYTDate(lastPeriodStart),
        end: formatYTDate(latestReport.periodEnd),
      },
      avgScore: avgNullable(reports.map((r) => getEffectiveScore(r))),
      prevAvgScore,
      memberCount: members.length,
      members,
      concerns,
      achievements: teamAchievements,
    };

    const html = generateTeamEmailHtml(data);
    const subject = generateSubject('team', team.name, data.period.start, data.period.end);

    return { subject, html };
  }

  private async getAchievementDefinitionsMap(): Promise<Map<string, string>> {
    // Lazy import to avoid circular dependency
    const { ACHIEVEMENT_DEFINITIONS } = await import('../achievements/achievements.types');
    const map = new Map<string, string>();
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      map.set(def.type, def.icon);
    }
    return map;
  }
}
