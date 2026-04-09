/**
 * Прямой сбор метрик из YouTrack для произвольного периода.
 * Переиспользует MetricsCollector и KpiCalculator.
 */

import { EntityManager } from '@mikro-orm/postgresql';
import { Subscription } from '../../entities/subscription.entity';
import { Team } from '../../entities/team.entity';
import { AggregatedReport } from '../../entities/aggregated-report.entity';
import { MetricsCollector, RawMetrics, TaskSummary } from '../collection/metrics-collector';
import { KpiCalculator, CalculatedKpi } from '../collection/kpi-calculator';
import { getYouTrackService } from '../youtrack/youtrack.service';
import type {
  CollectedData,
  CollectedEmployeeData,
  CollectedTaskItem,
} from './aggregated-reports.types';
import { Logger } from '../../common/types/logger';

const RETRY_COUNT = 3;
const RETRY_BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface CollectionTarget {
  login: string;
  displayName: string;
  subscriptionId: string;
  projectShortName: string;
  projectName: string;
  youtrackInstanceId: string;
  fieldMapping: NonNullable<Subscription['fieldMapping']>;
}

export class ReportCollector {
  constructor(
    private em: EntityManager,
    private log: Logger,
  ) {}

  /**
   * Определить список сотрудников для сбора в зависимости от типа отчёта.
   */
  async resolveTargets(
    type: 'employee' | 'project' | 'team',
    targetId: string,
    userId: string,
  ): Promise<CollectionTarget[]> {
    if (type === 'project') {
      return this.resolveProjectTargets(targetId);
    }
    if (type === 'team') {
      return this.resolveTeamTargets(targetId, userId);
    }
    return this.resolveEmployeeTargets(targetId, userId);
  }

  /**
   * Собрать метрики из YouTrack для всех targets.
   * Обновляет progress в report после каждого сотрудника.
   */
  async collect(
    report: AggregatedReport,
    targets: CollectionTarget[],
    dateFrom: Date,
    dateTo: Date,
  ): Promise<CollectedData> {
    const employees: CollectedEmployeeData[] = [];
    const total = targets.length;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];

      report.progress = {
        phase: 'collecting',
        total,
        completed: i,
        currentStep: `Сбор: ${target.displayName} (${target.projectName})`,
      } as unknown as object;
      await this.em.flush();

      try {
        const { rawMetrics, kpi } = await this.collectWithRetry(target, dateFrom, dateTo);

        const topTasks = this.selectTopTasks(rawMetrics.taskSummaries);

        // Все задачи с датами для построения динамики
        const allTasks: CollectedTaskItem[] = rawMetrics.taskSummaries.map((t) => ({
          id: t.id,
          summary: t.summary,
          type: t.type,
          spentMinutes: t.spent,
          estimationMinutes: t.estimation,
          created: t.created,
          resolved: t.resolved,
        }));

        employees.push({
          login: target.login,
          displayName: target.displayName,
          subscriptionId: target.subscriptionId,
          projectShortName: target.projectShortName,
          projectName: target.projectName,
          metrics: {
            totalIssues: rawMetrics.totalIssues,
            completedIssues: rawMetrics.completedIssues,
            overdueIssues: rawMetrics.overdueIssues,
            totalSpentMinutes: rawMetrics.totalSpentMinutes,
            totalEstimationMinutes: rawMetrics.totalEstimationMinutes,
            issuesByType: rawMetrics.issuesByType,
            issuesWithoutEstimation: rawMetrics.issuesWithoutEstimation,
            issuesOverEstimation: rawMetrics.issuesOverEstimation,
            inProgressIssues: rawMetrics.inProgressIssues,
            bugsAfterRelease: rawMetrics.bugsAfterRelease,
            bugsOnTest: rawMetrics.bugsOnTest,
          },
          kpi: {
            utilization: kpi.utilization,
            estimationAccuracy: kpi.estimationAccuracy,
            focus: kpi.focus,
            completionRate: kpi.completionRate,
            avgCycleTimeHours: kpi.avgCycleTimeHours,
          },
          topTasks,
          allTasks,
          spentByDay: rawMetrics.spentByDay,
          spentByDayByType: rawMetrics.spentByDayByType,
        });

        this.log.info(
          `Collected ${target.login} @ ${target.projectName}: ${rawMetrics.totalIssues} issues, ${rawMetrics.totalSpentMinutes}min`,
        );
      } catch (err) {
        this.log.error(
          `Failed to collect ${target.login} @ ${target.projectName}: ${(err as Error).message}`,
        );
        // Пропускаем сотрудника, продолжаем остальных
      }
    }

    report.progress = {
      phase: 'collecting',
      total,
      completed: total,
      currentStep: 'Сбор завершён',
    } as unknown as object;
    await this.em.flush();

    return { employees };
  }

  /**
   * Гибридная выборка топ-20 задач:
   * - Топ-10 по spentTime
   * - Топ-5 бизнес-критичных (type содержит 'feature' или 'business') по spentTime
   * - Остальные слоты заполняются следующими по spent
   * С дедупликацией.
   */
  private selectTopTasks(taskSummaries: TaskSummary[]): CollectedTaskItem[] {
    const seen = new Set<string>();
    const result: CollectedTaskItem[] = [];

    const toItem = (t: TaskSummary): CollectedTaskItem => ({
      id: t.id,
      summary: t.summary,
      type: t.type,
      spentMinutes: t.spent,
      estimationMinutes: t.estimation,
      created: t.created,
      resolved: t.resolved,
    });

    const bySpent = [...taskSummaries].sort((a, b) => b.spent - a.spent);

    // Топ-10 по spent time
    for (const t of bySpent.slice(0, 10)) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      result.push(toItem(t));
    }

    // Топ-5 бизнес-критичных
    const businessCritical = bySpent.filter(
      (t) => t.type === 'feature' || t.type === 'business' || t.type === 'businessCritical',
    );
    let bcCount = 0;
    for (const t of businessCritical) {
      if (bcCount >= 5 || result.length >= 20) break;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      result.push(toItem(t));
      bcCount++;
    }

    // Остальные слоты — заполняем следующими по spent
    for (const t of bySpent) {
      if (result.length >= 20) break;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      result.push(toItem(t));
    }

    return result;
  }

  private async collectWithRetry(
    target: CollectionTarget,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<{ rawMetrics: RawMetrics; kpi: CalculatedKpi }> {
    const ytService = getYouTrackService(this.log);
    const ytClient = ytService.getClient(target.youtrackInstanceId);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
      try {
        const collector = new MetricsCollector(ytClient, target.fieldMapping, this.log);
        const rawMetrics = await collector.collectForEmployee(
          target.projectShortName,
          target.login,
          dateFrom,
          dateTo,
        );
        const kpi = KpiCalculator.calculate(rawMetrics);

        // KpiCalculator считает utilization на основе 40ч/неделю (2400 мин).
        // Для произвольных периодов (>1 недели) пересчитываем по рабочим дням.
        const periodDays = (dateTo.getTime() - dateFrom.getTime()) / 86400000;
        if (periodDays > 8 && kpi.utilization !== null && rawMetrics.totalSpentMinutes > 0) {
          const workingDays = this.countWorkingDays(dateFrom, dateTo);
          const expectedMinutes = workingDays * 8 * 60;
          kpi.utilization = expectedMinutes > 0
            ? Math.round((rawMetrics.totalSpentMinutes / expectedMinutes) * 100 * 10) / 10
            : null;
        }

        return { rawMetrics, kpi };
      } catch (err) {
        lastError = err as Error;
        if (attempt < RETRY_COUNT) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          this.log.warn(
            `Retry ${attempt}/${RETRY_COUNT} for ${target.login}: ${lastError.message}, waiting ${delay}ms`,
          );
          await sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  private countWorkingDays(from: Date, to: Date): number {
    let count = 0;
    const cursor = new Date(from);
    while (cursor <= to) {
      const dow = cursor.getUTCDay();
      if (dow !== 0 && dow !== 6) count++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return count;
  }

  private async resolveProjectTargets(subscriptionId: string): Promise<CollectionTarget[]> {
    const sub = await this.em.findOne(
      Subscription,
      { id: subscriptionId },
      { populate: ['employees', 'fieldMapping'] },
    );
    if (!sub) throw new Error('Subscription not found');
    if (!sub.fieldMapping) throw new Error('No field mapping configured');

    return sub.employees
      .getItems()
      .filter((e) => e.isActive)
      .map((e) => ({
        login: e.youtrackLogin,
        displayName: e.displayName,
        subscriptionId: sub.id,
        projectShortName: sub.projectShortName,
        projectName: sub.projectName,
        youtrackInstanceId: sub.youtrackInstanceId,
        fieldMapping: sub.fieldMapping!,
      }));
  }

  private async resolveTeamTargets(teamId: string, userId: string): Promise<CollectionTarget[]> {
    const team = await this.em.findOne(Team, { id: teamId }, { populate: ['members'] });
    if (!team) throw new Error('Team not found');

    const logins = team.members.getItems().map((m) => m.youtrackLogin);
    if (logins.length === 0) return [];

    const subs = await this.em.find(
      Subscription,
      { ownerId: userId, isActive: true },
      { populate: ['employees', 'fieldMapping'] },
    );

    const targets: CollectionTarget[] = [];

    for (const sub of subs) {
      if (!sub.fieldMapping) continue;
      for (const emp of sub.employees.getItems()) {
        if (!emp.isActive || !logins.includes(emp.youtrackLogin)) continue;
        targets.push({
          login: emp.youtrackLogin,
          displayName: emp.displayName,
          subscriptionId: sub.id,
          projectShortName: sub.projectShortName,
          projectName: sub.projectName,
          youtrackInstanceId: sub.youtrackInstanceId,
          fieldMapping: sub.fieldMapping!,
        });
      }
    }

    return targets;
  }

  private async resolveEmployeeTargets(login: string, userId: string): Promise<CollectionTarget[]> {
    const subs = await this.em.find(
      Subscription,
      { ownerId: userId },
      { populate: ['employees', 'fieldMapping'] },
    );

    const targets: CollectionTarget[] = [];

    for (const sub of subs) {
      if (!sub.fieldMapping) continue;
      const emp = sub.employees.getItems().find(
        (e) => e.youtrackLogin === login && e.isActive,
      );
      if (!emp) continue;
      targets.push({
        login: emp.youtrackLogin,
        displayName: emp.displayName,
        subscriptionId: sub.id,
        projectShortName: sub.projectShortName,
        projectName: sub.projectName,
        youtrackInstanceId: sub.youtrackInstanceId,
        fieldMapping: sub.fieldMapping!,
      });
    }

    return targets;
  }
}
