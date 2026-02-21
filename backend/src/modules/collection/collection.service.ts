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
  llmQueue: Array<{ reportId: string; status: string }>;
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
   * Запуск сбора по расписанию (вызывается из CronManager).
   */
  async triggerScheduledCollection(periodStart: Date, periodEnd: Date): Promise<void> {
    const subscriptions = await this.em.find(Subscription, { isActive: true });

    for (const sub of subscriptions) {
      const log = createCollectionLog(
        this.em,
        sub,
        'scheduled',
        'queued',
        periodStart,
        periodEnd,
      );
      await this.em.flush();

      collectionState.addToQueue({
        subscriptionId: sub.id,
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

    return {
      activeCollections,
      queue,
      cronEnabled: state.cronEnabled,
      llmQueue: state.llmQueue,
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
