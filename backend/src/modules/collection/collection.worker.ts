/**
 * Фоновый воркер обработки очереди задач на сбор метрик.
 * Работает в том же процессе, но асинхронно через очередь.
 */

import { MikroORM, EntityManager } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Subscription } from '../../entities/subscription.entity';
import { MetricReport } from '../../entities/metric-report.entity';
import { CollectionLog } from '../../entities/collection-log.entity';
import { collectionState, QueueTask } from './collection.state';
import { MetricsCollector } from './metrics-collector';
import { KpiCalculator } from './kpi-calculator';
import { FormulaScorer } from './formula-scorer';
import { getYouTrackService } from '../youtrack/youtrack.service';
import { formatYTDate } from '../../common/utils/week-utils';
import { LlmService } from '../llm/llm.service';
import { AchievementsGenerator } from '../achievements/achievements.generator';

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

const POLL_INTERVAL = 2000;

function createMetricReport(
  em: EntityManager,
  subscription: Subscription,
  youtrackLogin: string,
  periodStart: Date,
  periodEnd: Date,
): MetricReport {
  const report = new MetricReport();
  report.subscription = subscription;
  report.youtrackLogin = youtrackLogin;
  report.periodStart = periodStart;
  report.periodEnd = periodEnd;
  report.totalIssues = 0;
  report.completedIssues = 0;
  report.inProgressIssues = 0;
  report.overdueIssues = 0;
  report.issuesByType = {};
  report.totalSpentMinutes = 0;
  report.spentByType = {};
  report.totalEstimationMinutes = 0;
  report.estimationByType = {};
  report.bugsAfterRelease = 0;
  report.bugsOnTest = 0;
  report.aiSavingMinutes = 0;
  report.issuesWithoutEstimation = 0;
  report.issuesOverEstimation = 0;
  report.status = 'pending';
  report.createdAt = new Date();
  report.updatedAt = new Date();
  em.persist(report);
  return report;
}

interface CollectedReport {
  reportId: string;
  subscriptionId: string;
  login: string;
  name: string;
  project: string;
  taskSummaries: Array<{ id: string; summary: string; type: string }>;
}

export class CollectionWorker {
  private isRunning = false;
  private shouldStop = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private llmService: LlmService | null = null;
  private achievementsGenerator: AchievementsGenerator | null = null;

  constructor(
    private orm: MikroORM<PostgreSqlDriver>,
    private log: Logger,
  ) {}

  setLlmService(service: LlmService): void {
    this.llmService = service;
  }

  setAchievementsGenerator(generator: AchievementsGenerator): void {
    this.achievementsGenerator = generator;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.shouldStop = false;
    this.log.info('Collection worker started');

    await this.recoverInterrupted();
    this.poll();
  }

  async stop(): Promise<void> {
    this.log.info('Collection worker stopping...');
    this.shouldStop = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    let waitCount = 0;
    while (this.isRunning && waitCount < 30) {
      await new Promise((r) => setTimeout(r, 1000));
      waitCount++;
    }
    this.isRunning = false;
    this.log.info('Collection worker stopped');
  }

  private poll(): void {
    if (this.shouldStop) {
      this.isRunning = false;
      return;
    }

    const task = collectionState.shiftQueue();
    if (task) {
      this.processTask(task)
        .catch((err) => {
          this.log.error(`Worker task failed: ${(err as Error).message}`);
        })
        .finally(() => {
          if (!this.shouldStop) {
            this.pollTimer = setTimeout(() => this.poll(), 100);
          } else {
            this.isRunning = false;
          }
        });
    } else {
      this.pollTimer = setTimeout(() => this.poll(), POLL_INTERVAL);
    }
  }

  private async processTask(task: QueueTask): Promise<void> {
    const em = this.orm.em.fork();
    const startStr = formatYTDate(task.periodStart);
    const endStr = formatYTDate(task.periodEnd);

    const subscription = await em.findOne(
      Subscription,
      { id: task.subscriptionId },
      { populate: ['employees', 'fieldMapping'] },
    );

    if (!subscription) {
      this.log.warn(`Subscription ${task.subscriptionId} not found, skipping task`);
      collectionState.removeProgress(task.logId);
      return;
    }

    // Reuse the existing CollectionLog created by triggerCollection/triggerScheduledCollection
    const log = await em.findOne(CollectionLog, { id: task.logId });
    if (!log) {
      this.log.warn(`CollectionLog ${task.logId} not found, skipping task`);
      collectionState.removeProgress(task.logId);
      return;
    }

    log.status = 'running';
    await em.flush();

    const logId = task.logId;

    this.log.info(
      `Collection started: ${subscription.projectName}, period ${startStr}..${endStr}`,
    );

    collectionState.updateProgress(logId, {
      subscriptionId: subscription.id,
      projectName: subscription.projectName,
      status: 'collecting',
      processedEmployees: 0,
      totalEmployees: 0,
      periodStart: startStr,
      periodEnd: endStr,
      startedAt: new Date().toISOString(),
    });

    await this.collectForSubscription(subscription, task.periodStart, task.periodEnd, logId, em);
  }

  private async collectForSubscription(
    subscription: Subscription,
    periodStart: Date,
    periodEnd: Date,
    logId: string,
    em: EntityManager,
  ): Promise<void> {
    const activeEmployees = subscription.employees
      .getItems()
      .filter((e) => e.isActive);

    const collectionLog = await em.findOneOrFail(CollectionLog, { id: logId });
    collectionLog.totalEmployees = activeEmployees.length;
    await em.flush();

    collectionState.updateProgress(logId, {
      totalEmployees: activeEmployees.length,
    });

    const ytService = getYouTrackService(this.log);
    const ytClient = ytService.getClient(subscription.youtrackInstanceId);

    const fieldMapping = subscription.fieldMapping;
    if (!fieldMapping) {
      this.log.error(`No field mapping for subscription ${subscription.id}`);
      collectionLog.status = 'error';
      collectionLog.completedAt = new Date();
      await em.flush();
      collectionState.updateProgress(logId, { status: 'error', error: 'No field mapping' });
      return;
    }

    const errors: Array<{ login: string; error: string; timestamp: string }> = [];
    const collectedReports: CollectedReport[] = [];
    let processedCount = 0;

    for (const employee of activeEmployees) {
      if (this.shouldStop) {
        this.log.info('Worker stopping, saving progress...');
        break;
      }

      const employeeIndex = processedCount + 1;
      this.log.info(
        `Collecting metrics for ${employee.youtrackLogin} (${employeeIndex}/${activeEmployees.length})`,
      );

      collectionState.updateProgress(logId, {
        currentEmployee: employee.youtrackLogin,
      });

      try {
        const collector = new MetricsCollector(ytClient, fieldMapping, this.log);
        const rawMetrics = await collector.collectForEmployee(
          subscription.projectShortName,
          employee.youtrackLogin,
          periodStart,
          periodEnd,
        );

        const kpi = KpiCalculator.calculate(rawMetrics);
        const formulaScore = FormulaScorer.calculate(kpi, rawMetrics);

        this.log.info(
          `KPI calculated: utilization=${kpi.utilization ?? 'n/a'}%, accuracy=${kpi.estimationAccuracy ?? 'n/a'}%, score=${formulaScore}`,
        );

        // Upsert MetricReport
        let report = await em.findOne(MetricReport, {
          subscription,
          youtrackLogin: employee.youtrackLogin,
          periodStart,
        });

        if (!report) {
          report = createMetricReport(em, subscription, employee.youtrackLogin, periodStart, periodEnd);
        }

        // Raw metrics
        report.totalIssues = rawMetrics.totalIssues;
        report.completedIssues = rawMetrics.completedIssues;
        report.inProgressIssues = rawMetrics.inProgressIssues;
        report.overdueIssues = rawMetrics.overdueIssues;
        report.issuesByType = rawMetrics.issuesByType;
        report.issuesWithoutEstimation = rawMetrics.issuesWithoutEstimation;
        report.issuesOverEstimation = rawMetrics.issuesOverEstimation;

        // Time
        report.totalSpentMinutes = rawMetrics.totalSpentMinutes;
        report.spentByType = rawMetrics.spentByType;
        report.totalEstimationMinutes = rawMetrics.totalEstimationMinutes;
        report.estimationByType = rawMetrics.estimationByType;

        // Process
        report.avgCycleTimeHours = kpi.avgCycleTimeHours ?? undefined;
        report.bugsAfterRelease = rawMetrics.bugsAfterRelease;
        report.bugsOnTest = rawMetrics.bugsOnTest;
        report.aiSavingMinutes = rawMetrics.aiSavingMinutes;

        // KPI
        report.utilization = kpi.utilization;
        report.estimationAccuracy = kpi.estimationAccuracy ?? undefined;
        report.focus = kpi.focus ?? undefined;
        report.avgComplexityHours = kpi.avgComplexityHours ?? undefined;
        report.completionRate = kpi.completionRate ?? undefined;

        // Formula score
        report.formulaScore = formulaScore ?? undefined;

        // Status
        report.status = 'collected';
        report.collectedAt = new Date();
        report.errorMessage = undefined;

        await em.flush();

        // Track for LLM enqueue
        collectedReports.push({
          reportId: report.id,
          subscriptionId: subscription.id,
          login: employee.youtrackLogin,
          name: employee.displayName,
          project: subscription.projectName,
          taskSummaries: rawMetrics.taskSummaries.map((t) => ({
            id: t.id,
            summary: t.summary,
            type: t.type,
          })),
        });

        // Generate achievements based on collected metrics
        if (this.achievementsGenerator) {
          try {
            await this.achievementsGenerator.generateForReport(report.id);
          } catch (achErr) {
            this.log.error(
              `Achievement generation error for ${employee.youtrackLogin}: ${(achErr as Error).message}`,
            );
          }
        }

        processedCount++;

        collectionLog.processedEmployees = processedCount;
        await em.flush();

        collectionState.updateProgress(logId, {
          processedEmployees: processedCount,
        });
      } catch (err) {
        const errorMsg = (err as Error).message;
        this.log.error(
          `Collection error for ${employee.youtrackLogin}: ${errorMsg}`,
        );

        errors.push({
          login: employee.youtrackLogin,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });

        processedCount++;
        collectionLog.processedEmployees = processedCount;
        collectionLog.errors = [...collectionLog.errors, ...errors.slice(-1)];
        await em.flush();

        collectionState.updateProgress(logId, {
          processedEmployees: processedCount,
        });
      }
    }

    // Finalize
    const startTime = collectionLog.startedAt.getTime();
    const duration = Date.now() - startTime;
    const durationStr = formatDuration(duration);

    const hasErrors = errors.length > 0;
    const allFailed = errors.length === activeEmployees.length;

    collectionLog.status = allFailed ? 'error' : hasErrors ? 'partial' : 'completed';
    collectionLog.completedAt = new Date();
    collectionLog.errors = errors;
    await em.flush();

    const finalStatus = collectionLog.status;

    collectionState.removeProgress(logId);

    this.log.info(
      `Collection ${finalStatus}: ${subscription.projectName}, ${processedCount}/${activeEmployees.length} employees, ${durationStr}`,
    );

    // Enqueue collected reports for LLM analysis
    if (this.llmService && collectedReports.length > 0) {
      this.llmService.enqueueReports(collectedReports);
    }
  }

  private async recoverInterrupted(): Promise<void> {
    const em = this.orm.em.fork();

    const interrupted = await em.find(CollectionLog, { status: 'running' }, {
      populate: ['subscription'],
    });

    for (const log of interrupted) {
      if (!log.subscription || !log.periodStart || !log.periodEnd) {
        log.status = 'error';
        await em.flush();
        continue;
      }

      this.log.info(
        `Recovering interrupted collection: ${log.subscription.projectName}, period ${formatYTDate(log.periodStart)}..${formatYTDate(log.periodEnd)}`,
      );

      // Reset the same log to queued instead of creating a new one
      log.status = 'queued';
      log.processedEmployees = 0;
      log.errors = [];
      log.startedAt = new Date();
      log.completedAt = undefined;
      await em.flush();

      collectionState.addToQueue({
        subscriptionId: log.subscription.id,
        logId: log.id,
        periodStart: log.periodStart,
        periodEnd: log.periodEnd,
        type: log.type as 'scheduled' | 'manual' | 'backfill',
      });

      collectionState.updateProgress(log.id, {
        subscriptionId: log.subscription.id,
        projectName: log.subscription.projectName,
        status: 'queued',
        processedEmployees: 0,
        totalEmployees: 0,
        periodStart: formatYTDate(log.periodStart),
        periodEnd: formatYTDate(log.periodEnd),
        startedAt: new Date().toISOString(),
      });
    }

    await em.flush();
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}
