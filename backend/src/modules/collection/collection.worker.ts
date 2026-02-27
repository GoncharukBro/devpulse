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
import { getYouTrackService } from '../youtrack/youtrack.service';
import { formatYTDate, getWeeksBetween } from '../../common/utils/week-utils';
import { LlmService } from '../llm/llm.service';
import { AchievementsGenerator } from '../achievements/achievements.generator';

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

const POLL_INTERVAL = 2000;
const RETRY_COUNT = 3;
const RETRY_BASE_DELAY_MS = 1000;

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
  report.status = 'collected';
  report.llmStatus = 'pending';
  report.createdAt = new Date();
  report.updatedAt = new Date();
  em.persist(report);
  return report;
}

interface CollectedReport {
  reportId: string;
  subscriptionId: string;
  collectionLogId: string;
  login: string;
  name: string;
  project: string;
  taskSummaries: Array<{ id: string; summary: string; type: string }>;
}

/** Sleep utility for exponential backoff */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class CollectionWorker {
  private isRunning = false;
  private shouldStop = false;
  private processing = false;
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

  /** Wake up the worker immediately to process queued tasks */
  nudge(): void {
    if (!this.isRunning || this.processing) return;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.poll();
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
      this.processing = true;
      // Transition from 'pending' to 'running'
      collectionState.updateProgress(task.logId, { status: 'running' });
      this.processTask(task)
        .catch((err) => {
          this.log.error(`Worker task failed: ${(err as Error).message}`);
        })
        .finally(() => {
          this.processing = false;
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

    // Reuse the existing CollectionLog
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
      status: 'running',
      type: task.type,
      processedEmployees: 0,
      totalEmployees: 0,
      skippedEmployees: 0,
      failedEmployees: 0,
      reQueuedEmployees: 0,
      periodStart: startStr,
      periodEnd: endStr,
      startedAt: new Date().toISOString(),
    });

    await this.collectForSubscription(subscription, task.periodStart, task.periodEnd, logId, em, task.overwrite);
  }

  private async collectForSubscription(
    subscription: Subscription,
    periodStart: Date,
    periodEnd: Date,
    logId: string,
    em: EntityManager,
    overwrite = false,
  ): Promise<void> {
    const activeEmployees = subscription.employees
      .getItems()
      .filter((e) => e.isActive);

    // Determine weeks to process (multi-week support, Scenario 7)
    const weeks = getWeeksBetween(periodStart, periodEnd);
    const totalWeeks = weeks.length;

    // Total processing units = employees × weeks
    const totalUnits = activeEmployees.length * totalWeeks;

    const collectionLog = await em.findOneOrFail(CollectionLog, { id: logId });
    collectionLog.totalEmployees = activeEmployees.length;
    await em.flush();

    collectionState.updateProgress(logId, {
      totalEmployees: totalUnits > activeEmployees.length ? totalUnits : activeEmployees.length,
      totalWeeks: totalWeeks > 1 ? totalWeeks : undefined,
    });

    const ytService = getYouTrackService(this.log);
    const ytClient = ytService.getClient(subscription.youtrackInstanceId);

    const fieldMapping = subscription.fieldMapping;
    if (!fieldMapping) {
      this.log.error(`No field mapping for subscription ${subscription.id}`);
      collectionLog.status = 'failed';
      collectionLog.completedAt = new Date();
      collectionLog.duration = Math.round((collectionLog.completedAt.getTime() - collectionLog.startedAt.getTime()) / 1000);
      collectionLog.error = 'No field mapping configured';
      await em.flush();
      collectionState.updateProgress(logId, { status: 'failed', error: 'No field mapping' });
      setTimeout(() => collectionState.removeProgress(logId), 3000);
      return;
    }

    const errors: Array<{ login: string; error: string; timestamp: string }> = [];
    const collectedReports: CollectedReport[] = [];
    let processedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let reQueuedCount = 0;

    for (let weekIdx = 0; weekIdx < weeks.length; weekIdx++) {
      const week = weeks[weekIdx];

      for (const employee of activeEmployees) {
        if (this.shouldStop) {
          this.log.info('Worker stopping (SIGTERM), saving progress...');
          break;
        }

        // Check if this subscription was cancelled / stopping
        if (collectionState.isCancelled(subscription.id) || collectionState.isStopping(logId)) {
          this.log.info(`Collection stopped for ${subscription.projectName}`);
          collectionState.clearCancellation(subscription.id);
          collectionLog.status = 'stopped';
          collectionLog.completedAt = new Date();
          collectionLog.duration = Math.round((collectionLog.completedAt.getTime() - collectionLog.startedAt.getTime()) / 1000);
          collectionLog.processedEmployees = processedCount;
          collectionLog.skippedEmployees = skippedCount;
          collectionLog.failedEmployees = failedCount;
          collectionLog.reQueuedEmployees = reQueuedCount;
          collectionLog.errors = errors;
          await em.flush();
          collectionState.removeProgress(logId);
          return;
        }

        const totalProgress = processedCount + skippedCount + failedCount + reQueuedCount;

        this.log.info(
          `Collecting metrics for ${employee.youtrackLogin} ` +
          (totalWeeks > 1
            ? `(week ${weekIdx + 1}/${totalWeeks}, ${totalProgress + 1}/${totalUnits})`
            : `(${totalProgress + 1}/${activeEmployees.length})`),
        );

        collectionState.updateProgress(logId, {
          currentEmployee: employee.displayName || employee.youtrackLogin,
          processedEmployees: totalProgress,
          currentWeek: totalWeeks > 1 ? weekIdx + 1 : undefined,
        });

        try {
          // Skip if report already exists and overwrite is false
          if (!overwrite) {
            const existingReport = await em.findOne(MetricReport, {
              subscription,
              youtrackLogin: employee.youtrackLogin,
              periodStart: week.start,
            });
            if (existingReport) {
              if (existingReport.llmStatus === 'completed') {
                // Full report — skip entirely
                this.log.info(
                  `Skipping ${employee.youtrackLogin}: report complete (overwrite=false)`,
                );
                skippedCount++;
                collectionState.updateProgress(logId, {
                  processedEmployees: processedCount + skippedCount + failedCount + reQueuedCount,
                  skippedEmployees: skippedCount,
                });
                continue;
              } else {
                // Incomplete report — re-queue for LLM without re-collecting YouTrack
                this.log.info(
                  `Re-queuing LLM for ${employee.youtrackLogin}: llmStatus=${existingReport.llmStatus}`,
                );
                existingReport.llmStatus = 'pending';
                await em.flush();

                collectedReports.push({
                  reportId: existingReport.id,
                  subscriptionId: subscription.id,
                  collectionLogId: logId,
                  login: employee.youtrackLogin,
                  name: employee.displayName,
                  project: subscription.projectName,
                  taskSummaries: [],
                });

                reQueuedCount++;
                collectionState.updateProgress(logId, {
                  processedEmployees: processedCount + skippedCount + failedCount + reQueuedCount,
                  reQueuedEmployees: reQueuedCount,
                });
                continue;
              }
            }
          }

          // Collect with retry + exponential backoff (Scenario 8)
          const rawMetrics = await this.collectWithRetry(
            ytClient,
            fieldMapping,
            subscription.projectShortName,
            employee.youtrackLogin,
            week.start,
            week.end,
          );

          const kpi = KpiCalculator.calculate(rawMetrics);

          this.log.info(
            `KPI calculated: utilization=${kpi.utilization ?? 'n/a'}%, accuracy=${kpi.estimationAccuracy ?? 'n/a'}%`,
          );

          // Upsert MetricReport
          let report = await em.findOne(MetricReport, {
            subscription,
            youtrackLogin: employee.youtrackLogin,
            periodStart: week.start,
          });

          if (!report) {
            report = createMetricReport(em, subscription, employee.youtrackLogin, week.start, week.end);
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
          report.utilization = kpi.utilization ?? undefined;
          report.estimationAccuracy = kpi.estimationAccuracy ?? undefined;
          report.focus = kpi.focus ?? undefined;
          report.avgComplexityHours = kpi.avgComplexityHours ?? undefined;
          report.completionRate = kpi.completionRate ?? undefined;

          // Нет данных → не ставить в LLM-очередь
          const hasNoData = rawMetrics.totalIssues === 0;

          // Status
          report.status = 'collected';
          report.llmStatus = hasNoData ? 'skipped' : 'pending';
          report.collectedAt = new Date();
          report.errorMessage = undefined;
          report.llmProcessedAt = undefined;

          await em.flush();

          if (hasNoData) {
            this.log.info(
              `Нет данных за период для ${employee.youtrackLogin} — LLM-анализ пропущен`,
            );
          } else {
            // Track for LLM enqueue (only if there's data)
            collectedReports.push({
              reportId: report.id,
              subscriptionId: subscription.id,
              collectionLogId: logId,
              login: employee.youtrackLogin,
              name: employee.displayName,
              project: subscription.projectName,
              taskSummaries: rawMetrics.taskSummaries.map((t) => ({
                id: t.id,
                summary: t.summary,
                type: t.type,
              })),
            });
          }

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
        } catch (err) {
          const errorMsg = (err as Error).message;
          this.log.error(
            `Collection error for ${employee.youtrackLogin} after ${RETRY_COUNT} retries: ${errorMsg}`,
          );

          failedCount++;
          errors.push({
            login: employee.youtrackLogin,
            error: errorMsg,
            timestamp: new Date().toISOString(),
          });
        }

        // Update log in DB
        collectionLog.processedEmployees = processedCount;
        collectionLog.skippedEmployees = skippedCount;
        collectionLog.failedEmployees = failedCount;
        collectionLog.reQueuedEmployees = reQueuedCount;
        collectionLog.errors = [...errors];
        await em.flush();

        collectionState.updateProgress(logId, {
          processedEmployees: processedCount + skippedCount + failedCount + reQueuedCount,
          skippedEmployees: skippedCount,
          failedEmployees: failedCount,
          reQueuedEmployees: reQueuedCount,
        });
      }

      // Check for worker stop between weeks
      if (this.shouldStop) break;
    }

    // YouTrack phase duration: from startedAt to now (before LLM enqueue)
    collectionLog.youtrackDuration = Math.round(
      (Date.now() - collectionLog.startedAt.getTime()) / 1000,
    );

    // Finalize
    collectionLog.completedAt = new Date();
    collectionLog.duration = Math.round((collectionLog.completedAt.getTime() - collectionLog.startedAt.getTime()) / 1000);
    collectionLog.processedEmployees = processedCount;
    collectionLog.skippedEmployees = skippedCount;
    collectionLog.failedEmployees = failedCount;
    collectionLog.reQueuedEmployees = reQueuedCount;
    collectionLog.llmTotal = collectedReports.length;
    collectionLog.errors = errors;

    // Determine final status
    const totalAttempted = processedCount + failedCount;
    const totalAll = processedCount + skippedCount + failedCount + reQueuedCount;
    const totalExpected = activeEmployees.length * weeks.length;

    if (failedCount === totalAttempted && totalAttempted > 0) {
      // All that we tried failed
      collectionLog.status = 'failed';
      collectionLog.error = `Все сотрудники завершились с ошибкой (${failedCount})`;
    } else if (failedCount > 0) {
      collectionLog.status = 'partial';
      collectionLog.error = `${failedCount} ошибок при обработке`;
    } else if (this.shouldStop && processedCount < totalExpected) {
      // Worker stopping due to SIGTERM
      collectionLog.status = 'stopped';
    } else if (processedCount > 0 || reQueuedCount > 0) {
      // Work was done (new collections or LLM re-queues)
      collectionLog.status = 'completed';
    } else if (totalAll === 0 && totalExpected > 0) {
      collectionLog.status = 'skipped';
    } else if (skippedCount === totalExpected) {
      collectionLog.status = 'skipped';
    } else {
      collectionLog.status = 'completed';
    }

    await em.flush();

    const finalStatus = collectionLog.status;
    collectionState.removeProgress(logId);

    this.log.info(
      `Collection ${finalStatus}: ${subscription.projectName}, processed=${processedCount}, skipped=${skippedCount}, reQueued=${reQueuedCount}, failed=${failedCount}, duration=${collectionLog.duration}s`,
    );

    // Enqueue collected reports for LLM analysis
    if (this.llmService && collectedReports.length > 0) {
      this.llmService.enqueueReports(collectedReports);
    }
  }

  /**
   * Collect metrics with retry and exponential backoff (Scenario 8).
   */
  private async collectWithRetry(
    ytClient: ReturnType<ReturnType<typeof getYouTrackService>['getClient']>,
    fieldMapping: NonNullable<Subscription['fieldMapping']>,
    projectShortName: string,
    youtrackLogin: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<ReturnType<MetricsCollector['collectForEmployee']> extends Promise<infer R> ? R : never> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
      try {
        const collector = new MetricsCollector(ytClient, fieldMapping, this.log);
        return await collector.collectForEmployee(
          projectShortName,
          youtrackLogin,
          periodStart,
          periodEnd,
        );
      } catch (err) {
        lastError = err as Error;
        if (attempt < RETRY_COUNT) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          this.log.warn(
            `Retry ${attempt}/${RETRY_COUNT} for ${youtrackLogin}: ${lastError.message}, waiting ${delay}ms`,
          );
          await sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  private async recoverInterrupted(): Promise<void> {
    const em = this.orm.em.fork();

    const interrupted = await em.find(CollectionLog, { status: 'running' }, {
      populate: ['subscription'],
    });

    for (const log of interrupted) {
      if (!log.subscription || !log.periodStart || !log.periodEnd) {
        log.status = 'failed';
        log.error = 'Interrupted during processing (recovery)';
        log.completedAt = new Date();
        log.duration = Math.round((log.completedAt.getTime() - log.startedAt.getTime()) / 1000);
        await em.flush();
        continue;
      }

      this.log.info(
        `Recovering interrupted collection: ${log.subscription.projectName}, period ${formatYTDate(log.periodStart)}..${formatYTDate(log.periodEnd)}`,
      );

      // Create a new log for recovery instead of reusing the old one
      // Mark the old one as failed
      log.status = 'failed';
      log.error = 'Прервано перезапуском сервера';
      log.completedAt = new Date();
      log.duration = Math.round((log.completedAt.getTime() - log.startedAt.getTime()) / 1000);

      const newLog = new CollectionLog();
      newLog.subscription = log.subscription;
      newLog.userId = log.userId;
      newLog.type = log.type;
      newLog.status = 'pending';
      newLog.periodStart = log.periodStart;
      newLog.periodEnd = log.periodEnd;
      newLog.totalEmployees = 0;
      newLog.processedEmployees = 0;
      newLog.skippedEmployees = 0;
      newLog.failedEmployees = 0;
      newLog.overwrite = true; // Recovered tasks should overwrite since they were interrupted
      newLog.errors = [];
      newLog.startedAt = new Date();
      newLog.createdAt = new Date();
      newLog.updatedAt = new Date();
      em.persist(newLog);
      await em.flush();

      collectionState.addToQueue({
        subscriptionId: log.subscription.id,
        logId: newLog.id,
        periodStart: log.periodStart,
        periodEnd: log.periodEnd,
        type: log.type as 'cron' | 'manual',
        overwrite: true,
      });

      collectionState.updateProgress(newLog.id, {
        subscriptionId: log.subscription.id,
        projectName: log.subscription.projectName,
        status: 'pending',
        type: log.type as 'manual' | 'cron',
        processedEmployees: 0,
        totalEmployees: 0,
        skippedEmployees: 0,
        failedEmployees: 0,
        reQueuedEmployees: 0,
        periodStart: formatYTDate(log.periodStart),
        periodEnd: formatYTDate(log.periodEnd),
        startedAt: new Date().toISOString(),
      });
    }

    await em.flush();
  }
}
