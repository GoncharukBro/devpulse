/**
 * Сервис-оркестратор сбора метрик: логика API, очередь, backfill.
 */

import { EntityManager } from '@mikro-orm/postgresql';
import { Subscription } from '../../entities/subscription.entity';
import { CollectionLog } from '../../entities/collection-log.entity';
import { MetricReport } from '../../entities/metric-report.entity';
import { collectionState, CollectionProgress } from './collection.state';
import { getCurrentWeekRange, getWeeksBetween, formatYTDate } from '../../common/utils/week-utils';
import { ValidationError, NotFoundError } from '../../common/errors';
import { getCollectionWorker } from './collection.singletons';

export interface CollectionStateResponse {
  activeCollections: Array<
    CollectionProgress & { id: string }
  >;
  queue: Array<{
    subscriptionId: string;
    projectName: string;
    periodStart: string;
    periodEnd: string;
    type: string;
  }>;
  cronEnabled: boolean;
  llmQueue: Array<{ reportId: string; status: string; subscriptionId: string }>;
  llmProcessed: Record<string, number>;
}

export interface PaginatedCollectionLogs {
  data: Array<{
    id: string;
    subscriptionId: string | null;
    projectName: string | null;
    type: string;
    status: string;
    periodStart: string | null;
    periodEnd: string | null;
    totalEmployees: number;
    processedEmployees: number;
    errors: Array<{ login: string; error: string; timestamp: string }>;
    startedAt: string;
    completedAt: string | null;
    duration: string | null;
  }>;
  total: number;
  page: number;
  limit: number;
}

function createCollectionLog(
  em: EntityManager,
  subscription: Subscription,
  type: string,
  status: string,
  periodStart: Date,
  periodEnd: Date,
): CollectionLog {
  const log = new CollectionLog();
  log.subscription = subscription;
  log.type = type;
  log.status = status;
  log.periodStart = periodStart;
  log.periodEnd = periodEnd;
  log.totalEmployees = 0;
  log.processedEmployees = 0;
  log.errors = [];
  log.startedAt = new Date();
  log.createdAt = new Date();
  em.persist(log);
  return log;
}

export class CollectionService {
  constructor(private em: EntityManager) {}

  /**
   * Запустить сбор по конкретной подписке за период.
   */
  async triggerCollection(
    subscriptionId: string,
    ownerId: string,
    periodStart?: Date,
    periodEnd?: Date,
    type: 'manual' | 'backfill' = 'manual',
  ): Promise<string> {
    const subscription = await this.em.findOne(Subscription, {
      id: subscriptionId,
      ownerId,
    });
    if (!subscription) throw new NotFoundError('Subscription not found');
    if (!subscription.isActive) throw new ValidationError('Subscription is not active');

    const period = this.resolvePeriod(periodStart, periodEnd);

    // Check if a collection log already exists for this subscription+period
    const existingLog = await this.em.findOne(CollectionLog, {
      subscription,
      periodStart: period.start,
      periodEnd: period.end,
    }, { orderBy: { createdAt: 'DESC' } });

    if (existingLog) {
      // If already in progress — just return existing id
      if (['queued', 'running', 'collecting'].includes(existingLog.status)) {
        return existingLog.id;
      }

      // If completed/partial/error — reset and reuse
      existingLog.type = type;
      existingLog.status = 'queued';
      existingLog.totalEmployees = 0;
      existingLog.processedEmployees = 0;
      existingLog.errors = [];
      existingLog.startedAt = new Date();
      existingLog.completedAt = undefined;
      await this.em.flush();

      collectionState.addToQueue({
        subscriptionId: subscription.id,
        logId: existingLog.id,
        periodStart: period.start,
        periodEnd: period.end,
        type,
      });

      collectionState.updateProgress(existingLog.id, {
        subscriptionId: subscription.id,
        projectName: subscription.projectName,
        status: 'queued',
        processedEmployees: 0,
        totalEmployees: 0,
        periodStart: formatYTDate(period.start),
        periodEnd: formatYTDate(period.end),
        startedAt: new Date().toISOString(),
      });

      getCollectionWorker()?.nudge();
      return existingLog.id;
    }

    // No existing log — create new
    const log = createCollectionLog(
      this.em,
      subscription,
      type,
      'queued',
      period.start,
      period.end,
    );
    await this.em.flush();

    collectionState.addToQueue({
      subscriptionId: subscription.id,
      logId: log.id,
      periodStart: period.start,
      periodEnd: period.end,
      type,
    });

    collectionState.updateProgress(log.id, {
      subscriptionId: subscription.id,
      projectName: subscription.projectName,
      status: 'queued',
      processedEmployees: 0,
      totalEmployees: 0,
      periodStart: formatYTDate(period.start),
      periodEnd: formatYTDate(period.end),
      startedAt: new Date().toISOString(),
    });

    getCollectionWorker()?.nudge();
    return log.id;
  }

  /**
   * Запустить сбор по всем активным подпискам пользователя.
   */
  async triggerAllCollections(
    ownerId: string,
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<string[]> {
    const subscriptions = await this.em.find(Subscription, {
      ownerId,
      isActive: true,
    });

    if (subscriptions.length === 0) {
      throw new ValidationError('No active subscriptions found');
    }

    const logIds: string[] = [];

    for (const sub of subscriptions) {
      const logId = await this.triggerCollection(
        sub.id,
        ownerId,
        periodStart,
        periodEnd,
        'manual',
      );
      logIds.push(logId);
    }

    return logIds;
  }

  /**
   * Backfill — найти пропущенные недели и запустить сбор.
   */
  async backfill(
    subscriptionId: string,
    ownerId: string,
    from: Date,
    to: Date,
  ): Promise<{ weeksToProcess: number; collectionLogIds: string[] }> {
    const subscription = await this.em.findOne(Subscription, {
      id: subscriptionId,
      ownerId,
    });
    if (!subscription) throw new NotFoundError('Subscription not found');
    if (!subscription.isActive) throw new ValidationError('Subscription is not active');

    const allWeeks = getWeeksBetween(from, to);

    const existingReports = await this.em.find(MetricReport, {
      subscription,
      periodStart: { $gte: from, $lte: to },
    });

    const existingStarts = new Set(
      existingReports.map((r) => formatYTDate(r.periodStart)),
    );

    const missingWeeks = allWeeks.filter(
      (w) => !existingStarts.has(formatYTDate(w.start)),
    );

    const logIds: string[] = [];

    for (const week of missingWeeks) {
      const logId = await this.triggerCollection(
        subscriptionId,
        ownerId,
        week.start,
        week.end,
        'backfill',
      );
      logIds.push(logId);
    }

    return {
      weeksToProcess: missingWeeks.length,
      collectionLogIds: logIds,
    };
  }

  /**
   * Backfill all active subscriptions — найти пропущенные недели для всех активных подписок.
   */
  async backfillAll(
    ownerId: string,
    from: Date,
    to: Date,
  ): Promise<{ weeksToProcess: number; collectionLogIds: string[] }> {
    const subscriptions = await this.em.find(Subscription, {
      ownerId,
      isActive: true,
    });

    if (subscriptions.length === 0) {
      throw new ValidationError('No active subscriptions found');
    }

    let totalWeeks = 0;
    const allLogIds: string[] = [];

    for (const subscription of subscriptions) {
      const result = await this.backfill(subscription.id, ownerId, from, to);
      totalWeeks += result.weeksToProcess;
      allLogIds.push(...result.collectionLogIds);
    }

    return {
      weeksToProcess: totalWeeks,
      collectionLogIds: allLogIds,
    };
  }

  /**
   * Запуск сбора по расписанию (вызывается из CronManager).
   */
  async triggerScheduledCollection(periodStart: Date, periodEnd: Date): Promise<void> {
    const subscriptions = await this.em.find(Subscription, { isActive: true });

    for (const sub of subscriptions) {
      // Check if a log already exists for this subscription+period
      const existingLog = await this.em.findOne(CollectionLog, {
        subscription: sub,
        periodStart,
        periodEnd,
      }, { orderBy: { createdAt: 'DESC' } });

      let log: CollectionLog;

      if (existingLog) {
        // If already in progress — skip
        if (['queued', 'running', 'collecting'].includes(existingLog.status)) {
          continue;
        }

        // Reset and reuse existing log
        existingLog.type = 'scheduled';
        existingLog.status = 'queued';
        existingLog.totalEmployees = 0;
        existingLog.processedEmployees = 0;
        existingLog.errors = [];
        existingLog.startedAt = new Date();
        existingLog.completedAt = undefined;
        log = existingLog;
      } else {
        log = createCollectionLog(
          this.em,
          sub,
          'scheduled',
          'queued',
          periodStart,
          periodEnd,
        );
      }

      await this.em.flush();

      collectionState.addToQueue({
        subscriptionId: sub.id,
        logId: log.id,
        periodStart,
        periodEnd,
        type: 'scheduled',
      });

      collectionState.updateProgress(log.id, {
        subscriptionId: sub.id,
        projectName: sub.projectName,
        status: 'queued',
        processedEmployees: 0,
        totalEmployees: 0,
        periodStart: formatYTDate(periodStart),
        periodEnd: formatYTDate(periodEnd),
        startedAt: new Date().toISOString(),
      });
    }

    getCollectionWorker()?.nudge();
  }

  /**
   * Получить текущее состояние сбора (для фронта).
   */
  getCollectionState(): CollectionStateResponse {
    const state = collectionState.getState();

    const activeCollections: Array<CollectionProgress & { id: string }> = [];
    for (const [id, progress] of state.activeCollections) {
      activeCollections.push({ id, ...progress });
    }

    const queue = state.queue.map((t) => ({
      subscriptionId: t.subscriptionId,
      projectName: '',
      periodStart: formatYTDate(t.periodStart),
      periodEnd: formatYTDate(t.periodEnd),
      type: t.type,
    }));

    // Convert llmProcessed Map to plain object for JSON serialization
    const llmProcessed: Record<string, number> = {};
    for (const [subId, count] of state.llmProcessed) {
      llmProcessed[subId] = count;
    }

    return {
      activeCollections,
      queue,
      cronEnabled: state.cronEnabled,
      llmQueue: state.llmQueue,
      llmProcessed,
    };
  }

  /**
   * Логи сборов с пагинацией.
   */
  async getCollectionLogs(
    ownerId: string,
    subscriptionId?: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedCollectionLogs> {
    const where: Record<string, unknown> = {};

    if (subscriptionId) {
      const sub = await this.em.findOne(Subscription, { id: subscriptionId, ownerId });
      if (!sub) throw new NotFoundError('Subscription not found');
      where.subscription = sub;
    } else {
      const subs = await this.em.find(Subscription, { ownerId });
      if (subs.length > 0) {
        where.subscription = { $in: subs.map((s) => s.id) };
      } else {
        return { data: [], total: 0, page, limit };
      }
    }

    const offset = (page - 1) * limit;

    const [logs, total] = await this.em.findAndCount(
      CollectionLog,
      where,
      {
        populate: ['subscription'],
        orderBy: { startedAt: 'DESC' },
        limit,
        offset,
      },
    );

    const data = logs.map((log) => {
      const duration = log.completedAt
        ? formatDuration(log.completedAt.getTime() - log.startedAt.getTime())
        : null;

      return {
        id: log.id,
        subscriptionId: log.subscription?.id ?? null,
        projectName: log.subscription?.projectName ?? null,
        type: log.type,
        status: log.status,
        periodStart: log.periodStart ? formatYTDate(log.periodStart) : null,
        periodEnd: log.periodEnd ? formatYTDate(log.periodEnd) : null,
        totalEmployees: log.totalEmployees,
        processedEmployees: log.processedEmployees,
        errors: log.errors,
        startedAt: log.startedAt.toISOString(),
        completedAt: log.completedAt?.toISOString() ?? null,
        duration,
      };
    });

    return { data, total, page, limit };
  }

  /**
   * Отменить сбор для конкретных подписок.
   * Удаляет из очереди, останавливает текущий процесс, обновляет логи в БД.
   */
  async cancelCollections(subscriptionIds: string[], ownerId: string): Promise<string[]> {
    // Verify ownership
    const subscriptions = await this.em.find(Subscription, {
      id: { $in: subscriptionIds },
      ownerId,
    });
    const validIds = subscriptions.map((s) => s.id);

    if (validIds.length === 0) {
      throw new ValidationError('No valid subscriptions to cancel');
    }

    // Cancel in state (removes from queue + marks for worker)
    const cancelledLogIds = collectionState.cancelBySubscriptionIds(validIds);

    // Update cancelled logs in DB
    if (cancelledLogIds.length > 0) {
      const logs = await this.em.find(CollectionLog, {
        id: { $in: cancelledLogIds },
        status: { $in: ['queued', 'running', 'collecting'] },
      });

      for (const log of logs) {
        log.status = 'error';
        log.completedAt = new Date();
        log.errors = [...log.errors, {
          login: '',
          error: 'Сбор отменён пользователем',
          timestamp: new Date().toISOString(),
        }];
      }

      await this.em.flush();
    }

    return cancelledLogIds;
  }

  /**
   * Отменить сбор по всем активным подпискам пользователя.
   */
  async cancelAllCollections(ownerId: string): Promise<string[]> {
    const subscriptions = await this.em.find(Subscription, {
      ownerId,
      isActive: true,
    });

    if (subscriptions.length === 0) {
      return [];
    }

    return this.cancelCollections(subscriptions.map((s) => s.id), ownerId);
  }

  private resolvePeriod(
    periodStart?: Date,
    periodEnd?: Date,
  ): { start: Date; end: Date } {
    if (periodStart && periodEnd) {
      return { start: periodStart, end: periodEnd };
    }
    return getCurrentWeekRange();
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}
