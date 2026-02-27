/**
 * Фоновый воркер LLM-очереди.
 * Обрабатывает метрик-отчёты асинхронно, не блокируя основной сбор.
 */

import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlDriver, EntityManager } from '@mikro-orm/postgresql';
import { MetricReport } from '../../entities/metric-report.entity';
import { CollectionLog } from '../../entities/collection-log.entity';
import { SubscriptionEmployee } from '../../entities/subscription-employee.entity';
import { Subscription } from '../../entities/subscription.entity';
import { collectionState } from '../collection/collection.state';
import { LlmClient } from './llm.client';
import { buildAnalysisPrompt } from './llm.prompt';
import { parseLlmResponse } from './llm.parser';
import { LlmTask, LlmWorkerState, PromptData } from './llm.types';
import { formatYTDate } from '../../common/utils/week-utils';
import { AchievementsGenerator } from '../achievements/achievements.generator';

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

const POLL_INTERVAL = 3000;

export class LlmWorker {
  private queue: LlmTask[] = [];
  private isRunning = false;
  private shouldStop = false;
  private processing: string | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private achievementsGenerator: AchievementsGenerator | null = null;

  constructor(
    private orm: MikroORM<PostgreSqlDriver>,
    private llmClient: LlmClient,
    private log: Logger,
  ) {}

  setAchievementsGenerator(generator: AchievementsGenerator): void {
    this.achievementsGenerator = generator;
  }

  enqueue(task: LlmTask): void {
    this.queue.push(task);
    collectionState.addToLlmQueue(task.reportId, 'pending', task.subscriptionId, task.employeeName);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.shouldStop = false;

    await this.recoverPending();

    this.log.info(`LLM worker started, queue size: ${this.queue.length}`);
    this.poll();
  }

  async stop(): Promise<void> {
    this.log.info('LLM worker stopping...');
    this.shouldStop = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    let waitCount = 0;
    while (this.processing && waitCount < 60) {
      await new Promise((r) => setTimeout(r, 1000));
      waitCount++;
    }
    this.isRunning = false;
    this.log.info('LLM worker stopped');
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getState(): LlmWorkerState {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
      isRunning: this.isRunning,
    };
  }

  private poll(): void {
    if (this.shouldStop) {
      this.isRunning = false;
      return;
    }

    const task = this.queue.shift();
    if (task) {
      this.processTask(task)
        .catch((err) => {
          this.log.error(`LLM worker task failed: ${(err as Error).message}`);
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

  private async processTask(task: LlmTask): Promise<void> {
    const em = this.orm.em.fork();

    const report = await em.findOne(MetricReport, { id: task.reportId }, {
      populate: ['subscription'],
    });

    if (!report) {
      this.log.warn(`LLM: report ${task.reportId} not found, skipping`);
      collectionState.removeLlmQueueItem(task.reportId);
      return;
    }

    // Already processed by LLM
    if (report.llmProcessedAt) {
      this.log.info(`LLM: report ${task.reportId} already processed, skipping`);
      collectionState.removeLlmQueueItem(task.reportId);
      return;
    }

    // Cancelled by user (stop during LLM phase)
    if (report.llmStatus === 'skipped') {
      this.log.info(`LLM: report ${task.reportId} was cancelled, skipping`);
      this.processing = null;
      collectionState.removeLlmQueueItem(task.reportId);
      return;
    }

    // Нет данных → не отправлять в LLM
    if (report.totalIssues === 0) {
      report.llmScore = undefined;
      report.llmSummary = undefined;
      report.llmAchievements = undefined;
      report.llmConcerns = undefined;
      report.llmRecommendations = undefined;
      report.llmTaskClassification = undefined;
      report.llmStatus = 'skipped';
      await em.flush();
      await this.updateCollectionLogLlm(em, task.collectionLogId, 'llmSkipped');
      this.log.info(`Пропущен LLM — нет данных за период для ${task.youtrackLogin}`);
      this.processing = null;
      collectionState.removeLlmQueueItem(task.reportId);
      return;
    }

    this.processing = task.reportId;
    collectionState.updateLlmQueueItem(task.reportId, 'processing');

    const periodStr = `${formatYTDate(report.periodStart)}..${formatYTDate(report.periodEnd)}`;
    this.log.info(
      `LLM analyzing report for ${task.youtrackLogin} (${task.projectName}, ${periodStr})`,
    );

    // Build prompt data from report
    const promptData = this.buildPromptData(report, task);
    const messages = buildAnalysisPrompt(promptData);

    const llmStart = Date.now();
    const rawResponse = await this.llmClient.chatCompletion(messages);
    const llmElapsed = Math.round((Date.now() - llmStart) / 1000);

    if (!rawResponse) {
      this.log.warn(
        `LLM: нет ответа для ${task.youtrackLogin}, score = null`,
      );
      report.llmScore = undefined;
      report.status = 'analyzed';
      report.llmStatus = 'failed';
      await em.flush();
      await this.updateCollectionLogLlm(em, task.collectionLogId, 'llmFailed');
      this.processing = null;
      collectionState.removeLlmQueueItem(task.reportId);
      return;
    }

    const analysis = parseLlmResponse(rawResponse);

    if (!analysis) {
      this.log.warn(
        `LLM parse error: невалидный JSON для ${task.youtrackLogin}, score = null`,
      );
      report.llmScore = undefined;
      report.status = 'analyzed';
      report.llmStatus = 'failed';
      await em.flush();
      await this.updateCollectionLogLlm(em, task.collectionLogId, 'llmFailed');
      this.processing = null;
      collectionState.removeLlmQueueItem(task.reportId);
      return;
    }

    // Write LLM results to report
    report.llmScore = analysis.score;
    report.llmSummary = analysis.summary;
    report.llmAchievements = analysis.achievements;
    report.llmConcerns = analysis.concerns;
    report.llmRecommendations = analysis.recommendations;
    report.llmTaskClassification = {
      businessCritical: analysis.taskClassification.businessCritical,
      technicallySignificant: analysis.taskClassification.technicallySignificant,
    };
    report.llmProcessedAt = new Date();
    report.status = 'analyzed';
    report.llmStatus = 'completed';

    await em.flush();

    await this.updateCollectionLogLlm(em, task.collectionLogId, 'llmCompleted');

    this.log.info(
      `LLM response for ${task.youtrackLogin}: ${llmElapsed}s, score=${analysis.score}`,
    );

    // Regenerate achievements with updated LLM score
    if (this.achievementsGenerator) {
      try {
        await this.achievementsGenerator.generateForReport(task.reportId);
      } catch (achErr) {
        this.log.error(
          `Achievement regeneration error for ${task.youtrackLogin}: ${(achErr as Error).message}`,
        );
      }
    }

    this.processing = null;
    collectionState.removeLlmQueueItem(task.reportId);
  }

  private async updateCollectionLogLlm(
    em: EntityManager,
    collectionLogId: string | undefined,
    field: 'llmCompleted' | 'llmFailed' | 'llmSkipped',
  ): Promise<void> {
    if (!collectionLogId) return;
    try {
      const log = await em.findOne(CollectionLog, { id: collectionLogId });
      if (log) {
        log[field]++;

        // Check if all LLM tasks are done → record llmDuration
        const done = log.llmCompleted + log.llmFailed + log.llmSkipped;
        if (log.llmTotal > 0 && done >= log.llmTotal && log.llmDuration === 0) {
          if (log.completedAt) {
            log.llmDuration = Math.round(
              (Date.now() - log.completedAt.getTime()) / 1000,
            );
          }
        }

        await em.flush();
      }
    } catch (err) {
      this.log.warn(`Failed to update CollectionLog LLM counter: ${(err as Error).message}`);
    }
  }

  private buildPromptData(report: MetricReport, task: LlmTask): PromptData {
    return {
      employeeName: task.employeeName,
      projectName: task.projectName,
      periodStart: formatYTDate(report.periodStart),
      periodEnd: formatYTDate(report.periodEnd),
      totalIssues: report.totalIssues,
      completedIssues: report.completedIssues,
      overdueIssues: report.overdueIssues,
      issuesByType: report.issuesByType,
      totalSpentHours: Math.round((report.totalSpentMinutes / 60) * 100) / 100,
      estimationHours: Math.round((report.totalEstimationMinutes / 60) * 100) / 100,
      utilization: report.utilization ?? null,
      estimationAccuracy: report.estimationAccuracy ?? null,
      focus: report.focus ?? null,
      completionRate: report.completionRate ?? null,
      avgCycleTimeHours: report.avgCycleTimeHours ?? null,
      bugsAfterRelease: report.bugsAfterRelease,
      bugsOnTest: report.bugsOnTest,
      aiSavingHours: Math.round((report.aiSavingMinutes / 60) * 100) / 100,
      taskSummaries: task.taskSummaries,
    };
  }

  private async recoverPending(): Promise<void> {
    const em = this.orm.em.fork();

    // Найти отчёты с llmStatus 'pending' или 'processing'
    // processing → прервался при рестарте, нужно повторить
    // Сортировка по createdAt ASC сохраняет исходный порядок очереди
    const pendingReports = await em.find(
      MetricReport,
      {
        llmStatus: { $in: ['pending', 'processing'] },
        totalIssues: { $gt: 0 },
      },
      { populate: ['subscription'], orderBy: { createdAt: 'ASC' } },
    );

    if (pendingReports.length === 0) return;

    // Сбросить processing → pending
    let resetCount = 0;
    for (const report of pendingReports) {
      if (report.llmStatus === 'processing') {
        report.llmStatus = 'pending';
        resetCount++;
      }
    }
    if (resetCount > 0) {
      await em.flush();
    }

    this.log.info(
      `LLM worker: recovering ${pendingReports.length} reports (${resetCount} reset from processing)`,
    );

    // Маппинг collectionLogId → subscriptionId для восстановления счётчиков
    const logIdToSubId = new Map<string, string>();

    for (const report of pendingReports) {
      const employee = await em.findOne(SubscriptionEmployee, {
        subscription: report.subscription,
        youtrackLogin: report.youtrackLogin,
      });

      const sub = await em.findOne(Subscription, { id: report.subscription.id });

      // Найти collectionLogId для привязки LLM-счётчиков
      // Range query: CollectionLog покрывает весь backfill-диапазон,
      // а MetricReport.periodStart — конкретная неделя внутри него
      const relatedLog = await em.findOne(
        CollectionLog,
        {
          subscription: report.subscription,
          periodStart: { $lte: report.periodStart },
          periodEnd: { $gte: report.periodEnd },
          status: { $nin: ['cancelled', 'failed'] },
        },
        { orderBy: { createdAt: 'DESC' } },
      );

      if (relatedLog) {
        logIdToSubId.set(relatedLog.id, report.subscription.id);
      }

      this.enqueue({
        reportId: report.id,
        subscriptionId: report.subscription.id,
        collectionLogId: relatedLog?.id,
        youtrackLogin: report.youtrackLogin,
        employeeName: employee?.displayName ?? report.youtrackLogin,
        projectName: sub?.projectName ?? 'Unknown',
        taskSummaries: [],
      });
    }

    // Восстановить счётчики уже обработанных отчётов из CollectionLog
    // Без этого UI показывает 0/13 вместо 2/15 после рестарта
    for (const [logId, subId] of logIdToSubId) {
      const log = await em.findOne(CollectionLog, { id: logId });
      if (log) {
        const processedCount = log.llmCompleted + log.llmFailed + log.llmSkipped;
        if (processedCount > 0) {
          collectionState.setLlmProcessed(subId, processedCount);
          this.log.info(
            `LLM recovery: restored ${processedCount} processed count for subscription (log ${logId})`,
          );
        }
      }
    }
  }
}
