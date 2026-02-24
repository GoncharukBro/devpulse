/**
 * Фоновый воркер LLM-очереди.
 * Обрабатывает метрик-отчёты асинхронно, не блокируя основной сбор.
 */

import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { MetricReport } from '../../entities/metric-report.entity';
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
    collectionState.addToLlmQueue(task.reportId, 'queued', task.subscriptionId);
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

    this.processing = task.reportId;
    collectionState.updateLlmQueueItem(task.reportId, 'processing');

    const periodStr = `${formatYTDate(report.periodStart)}..${formatYTDate(report.periodEnd)}`;
    this.log.info(
      `LLM analyzing report for ${task.youtrackLogin} (${task.projectName}, ${periodStr})`,
    );

    // Build prompt data from report
    const promptData = this.buildPromptData(report, task);
    const messages = buildAnalysisPrompt(promptData);

    const rawResponse = await this.llmClient.chatCompletion(messages);

    if (!rawResponse) {
      this.log.warn(
        `LLM: no response for ${task.youtrackLogin}, falling back to formula score`,
      );
      report.status = 'completed';
      await em.flush();
      this.processing = null;
      collectionState.removeLlmQueueItem(task.reportId);
      return;
    }

    const analysis = parseLlmResponse(rawResponse);

    if (!analysis) {
      this.log.warn(
        `LLM parse error: invalid JSON for ${task.youtrackLogin}, falling back to formula score`,
      );
      report.status = 'completed';
      await em.flush();
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
    report.status = 'completed';

    await em.flush();

    this.log.info(
      `LLM score for ${task.youtrackLogin}: ${analysis.score} (formula was ${report.formulaScore ?? 'n/a'})`,
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

    // Find reports that were collected but not LLM-processed
    const pendingReports = await em.find(
      MetricReport,
      { status: 'collected', llmProcessedAt: null },
      { populate: ['subscription'] },
    );

    if (pendingReports.length === 0) return;

    this.log.info(
      `LLM worker: recovering ${pendingReports.length} pending reports`,
    );

    for (const report of pendingReports) {
      // Resolve employee name
      const employee = await em.findOne(SubscriptionEmployee, {
        subscription: report.subscription,
        youtrackLogin: report.youtrackLogin,
      });

      const sub = await em.findOne(Subscription, { id: report.subscription.id });

      this.enqueue({
        reportId: report.id,
        subscriptionId: report.subscription.id,
        youtrackLogin: report.youtrackLogin,
        employeeName: employee?.displayName ?? report.youtrackLogin,
        projectName: sub?.projectName ?? 'Unknown',
        taskSummaries: [], // Not available after recovery
      });
    }
  }
}
