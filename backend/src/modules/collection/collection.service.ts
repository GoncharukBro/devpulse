/**
 * Сервис-оркестратор сбора метрик: логика API, очередь, backfill.
 */

import { EntityManager } from '@mikro-orm/postgresql';
import { Subscription } from '../../entities/subscription.entity';
import { CollectionLog, CollectionLogType } from '../../entities/collection-log.entity';
import { MetricReport } from '../../entities/metric-report.entity';
import { collectionState, CollectionProgress, WorkersHealth } from './collection.state';
import { getCurrentWeekRange, getWeeksBetween, formatYTDate } from '../../common/utils/week-utils';
import { ValidationError, NotFoundError, ConflictError } from '../../common/errors';
import { getCollectionWorker } from './collection.singletons';
import { SubscriptionEmployee } from '../../entities/subscription-employee.entity';
import { subscriptionEditorFilter } from '../subscriptions/subscription-access';

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
  llmQueueBySubscription: Record<string, { pending: number; processing: number; total: number }>;
  workersHealth: WorkersHealth;
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
    skippedEmployees: number;
    failedEmployees: number;
    reQueuedEmployees: number;
    llmTotal: number;
    llmCompleted: number;
    llmFailed: number;
    llmSkipped: number;
    overwrite: boolean;
    errors: Array<{ login: string; error: string; timestamp: string }>;
    error: string | null;
    startedAt: string;
    completedAt: string | null;
    duration: number;
  }>;
  total: number;
  page: number;
  limit: number;
}

function createCollectionLog(
  em: EntityManager,
  subscription: Subscription,
  userId: string,
  type: CollectionLogType,
  periodStart: Date,
  periodEnd: Date,
  overwrite: boolean,
): CollectionLog {
  const log = new CollectionLog();
  log.subscription = subscription;
  log.userId = userId;
  log.type = type;
  log.status = 'pending';
  log.periodStart = periodStart;
  log.periodEnd = periodEnd;
  log.totalEmployees = 0;
  log.processedEmployees = 0;
  log.skippedEmployees = 0;
  log.failedEmployees = 0;
  log.overwrite = overwrite;
  log.duration = 0;
  log.errors = [];
  log.startedAt = new Date();
  log.createdAt = new Date();
  log.updatedAt = new Date();
  em.persist(log);
  return log;
}

/** Инициализировать pending-прогресс для нового лога сбора */
function initPendingProgress(
  logId: string,
  subscriptionId: string,
  projectName: string,
  type: CollectionLogType,
  periodStart: Date,
  periodEnd: Date,
): void {
  collectionState.updateProgress(logId, {
    subscriptionId,
    projectName,
    status: 'pending',
    type,
    processedEmployees: 0,
    totalEmployees: 0,
    skippedEmployees: 0,
    failedEmployees: 0,
    reQueuedEmployees: 0,
    periodStart: formatYTDate(periodStart),
    periodEnd: formatYTDate(periodEnd),
    startedAt: new Date().toISOString(),
  });
}

export class CollectionService {
  constructor(private em: EntityManager) {}

  /**
   * Запустить сбор по конкретной подписке за период.
   * Каждый запуск — новая запись в CollectionLog (не перезапись!).
   */
  async triggerCollection(
    subscriptionId: string,
    ownerId: string,
    periodStart?: Date,
    periodEnd?: Date,
    type: CollectionLogType = 'manual',
    overwrite = false,
    userLogin?: string,
  ): Promise<string> {
    const filter = userLogin
      ? { id: subscriptionId, ...(subscriptionEditorFilter(ownerId, userLogin) as object) }
      : { id: subscriptionId, ownerId };
    const subscription = await this.em.findOne(Subscription, filter);
    if (!subscription) throw new NotFoundError('Subscription not found');

    // Manual trigger allowed even on inactive subscriptions (Scenario 13)
    // But cron should skip inactive — handled in triggerScheduledCollection

    // Clear any stale cancellation flags from a previous stop (Bug fix:
    // stop during LLM-only phase left the flag, poisoning the next run)
    collectionState.clearCancellation(subscriptionId);

    const period = this.resolvePeriod(periodStart, periodEnd);

    // Validate: no future periods (Scenario 17)
    this.validatePeriodNotFuture(period.start);

    // Check if already running/pending → 409 (Scenario 11)
    if (collectionState.isSubscriptionBusy(subscriptionId)) {
      throw new ConflictError('Сбор для этого проекта уже выполняется или находится в очереди');
    }

    // Each run = new log (spec requirement)
    const log = createCollectionLog(
      this.em,
      subscription,
      ownerId,
      type,
      period.start,
      period.end,
      overwrite,
    );
    await this.em.flush();

    collectionState.addToQueue({
      subscriptionId: subscription.id,
      logId: log.id,
      periodStart: period.start,
      periodEnd: period.end,
      type,
      overwrite,
    });

    initPendingProgress(log.id, subscription.id, subscription.projectName, type, period.start, period.end);

    getCollectionWorker()?.nudge();
    return log.id;
  }

  /**
   * Запустить сбор по всем активным подпискам пользователя.
   * Пропускает подписки, которые уже running/pending.
   */
  async triggerAllCollections(
    ownerId: string,
    periodStart?: Date,
    periodEnd?: Date,
    overwrite = false,
    subscriptionIds?: string[],
    userLogin?: string,
  ): Promise<string[]> {
    const filter = userLogin
      ? { ...(subscriptionEditorFilter(ownerId, userLogin) as object), isActive: true }
      : { ownerId, isActive: true };
    let subscriptions = await this.em.find(Subscription, filter);

    // If specific IDs provided (from modal checkboxes), filter to those
    if (subscriptionIds && subscriptionIds.length > 0) {
      const idSet = new Set(subscriptionIds);
      subscriptions = subscriptions.filter((s) => idSet.has(s.id));
    }

    if (subscriptions.length === 0) {
      throw new ValidationError('No active subscriptions found');
    }

    const logIds: string[] = [];

    for (const sub of subscriptions) {
      // Skip already busy subscriptions (don't throw 409, just skip)
      if (collectionState.isSubscriptionBusy(sub.id)) {
        continue;
      }

      const logId = await this.triggerCollection(
        sub.id,
        ownerId,
        periodStart,
        periodEnd,
        'manual',
        overwrite,
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
      try {
        const logId = await this.triggerCollection(
          subscriptionId,
          ownerId,
          week.start,
          week.end,
          'manual',
        );
        logIds.push(logId);
      } catch {
        // Skip if conflict (already running)
      }
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
    // If manual collection is already running → skip (Scenario 10)
    if (collectionState.isAnyCollectionActive()) {
      return; // CronManager already logs this
    }

    const subscriptions = await this.em.find(Subscription, { isActive: true });

    for (const sub of subscriptions) {
      // Skip if already busy
      if (collectionState.isSubscriptionBusy(sub.id)) {
        continue;
      }

      const log = createCollectionLog(
        this.em,
        sub,
        'system', // cron has no user
        'cron',
        periodStart,
        periodEnd,
        false, // cron never overwrites
      );
      await this.em.flush();

      collectionState.addToQueue({
        subscriptionId: sub.id,
        logId: log.id,
        periodStart,
        periodEnd,
        type: 'cron',
        overwrite: false,
      });

      initPendingProgress(log.id, sub.id, sub.projectName, 'cron', periodStart, periodEnd);
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

    // Resolve project names for queue items
    const queue = state.queue.map((t) => {
      let projectName = '';
      for (const [, progress] of state.activeCollections) {
        if (progress.subscriptionId === t.subscriptionId) {
          projectName = progress.projectName;
          break;
        }
      }
      return {
        subscriptionId: t.subscriptionId,
        projectName,
        periodStart: formatYTDate(t.periodStart),
        periodEnd: formatYTDate(t.periodEnd),
        type: t.type,
      };
    });

    // Convert llmProcessed Map to plain object for JSON serialization
    const llmProcessed: Record<string, number> = {};
    for (const [subId, count] of state.llmProcessed) {
      llmProcessed[subId] = count;
    }

    // Map llmQueue to API shape (exclude internal task data like taskSummaries)
    const llmQueue = state.llmQueue.map((item) => ({
      reportId: item.reportId,
      status: item.status,
      subscriptionId: item.subscriptionId,
      employeeName: item.employeeName,
    }));

    return {
      activeCollections,
      queue,
      cronEnabled: state.cronEnabled,
      llmQueue,
      llmProcessed,
      llmQueueBySubscription: collectionState.getLlmQueueBySubscription(),
      workersHealth: collectionState.getWorkersHealth(),
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
    status?: string,
    type?: string,
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

    if (status) {
      where.status = status;
    }
    if (type) {
      where.type = type;
    }

    const offset = (page - 1) * limit;

    const [logs, total] = await this.em.findAndCount(
      CollectionLog,
      where,
      {
        populate: ['subscription'],
        orderBy: { createdAt: 'DESC' },
        limit,
        offset,
      },
    );

    const data = logs.map((log) => {
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
        skippedEmployees: log.skippedEmployees,
        failedEmployees: log.failedEmployees,
        reQueuedEmployees: log.reQueuedEmployees,
        llmTotal: log.llmTotal,
        llmCompleted: log.llmCompleted,
        llmFailed: log.llmFailed,
        llmSkipped: log.llmSkipped,
        overwrite: log.overwrite,
        errors: log.errors,
        error: log.error ?? null,
        startedAt: log.startedAt.toISOString(),
        completedAt: log.completedAt?.toISOString() ?? null,
        duration: log.duration,
      };
    });

    return { data, total, page, limit };
  }

  /**
   * Отменить сбор для конкретных подписок.
   * Queued items → 'cancelled', running items → 'stopped'.
   */
  async cancelCollections(subscriptionIds: string[], ownerId: string, userLogin?: string): Promise<string[]> {
    // Verify ownership or editor access
    const filter = userLogin
      ? { id: { $in: subscriptionIds }, ...(subscriptionEditorFilter(ownerId, userLogin) as object) }
      : { id: { $in: subscriptionIds }, ownerId };
    const subscriptions = await this.em.find(Subscription, filter);
    const validIds = subscriptions.map((s) => s.id);

    if (validIds.length === 0) {
      // Idempotent: if nothing to cancel, return empty (not error)
      return [];
    }

    // Cancel in state — returns actions per logId + skipped LLM reportIds
    const { logResults, skippedLlmReportIds } = collectionState.cancelBySubscriptionIds(validIds);
    const cancelledLogIds = logResults.map((r) => r.logId);

    if (cancelledLogIds.length > 0) {
      const logs = await this.em.find(CollectionLog, {
        id: { $in: cancelledLogIds },
      });

      for (const log of logs) {
        const result = logResults.find((r) => r.logId === log.id);
        if (!result) continue;

        if (result.action === 'cancelled') {
          // Was in queue, never started
          log.status = 'cancelled';
          log.completedAt = new Date();
          log.duration = Math.round((log.completedAt.getTime() - log.startedAt.getTime()) / 1000);
        } else if (result.action === 'stopped' && log.status !== 'stopped') {
          // Currently running — mark as stopping, worker will finalize to 'stopped'
          log.status = 'stopping';
        }
      }

      await this.em.flush();
    }

    // Mark skipped LLM reports in DB so the LLM worker won't process them
    if (skippedLlmReportIds.length > 0) {
      // Count skipped per subscription to update CollectionLog LLM counters
      const skippedReports = await this.em.find(MetricReport, {
        id: { $in: skippedLlmReportIds },
      }, { populate: ['subscription'] });

      const skippedPerSub = new Map<string, number>();
      for (const r of skippedReports) {
        const subId = r.subscription.id;
        skippedPerSub.set(subId, (skippedPerSub.get(subId) ?? 0) + 1);
      }

      await this.em.nativeUpdate(
        MetricReport,
        { id: { $in: skippedLlmReportIds } },
        { llmStatus: 'skipped' },
      );

      // Update CollectionLog.llmSkipped for each affected subscription
      for (const [subId, count] of skippedPerSub) {
        const latestLog = await this.em.findOne(
          CollectionLog,
          { subscription: subId, llmTotal: { $gt: 0 } },
          { orderBy: { createdAt: 'DESC' } },
        );
        if (latestLog) {
          latestLog.llmSkipped += count;
        }
      }
      await this.em.flush();
    }

    // Also mark MetricReports that are pending in DB but NOT yet in LLM queue
    // (created during YouTrack collection before Stop, never enqueued)
    const pendingInDb = await this.em.find(MetricReport, {
      subscription: { $in: validIds },
      llmStatus: 'pending',
      id: { $nin: skippedLlmReportIds },
    });

    if (pendingInDb.length > 0) {
      for (const report of pendingInDb) {
        report.llmStatus = 'skipped';
      }
      await this.em.flush();
    }

    return cancelledLogIds;
  }

  /**
   * Отменить сбор по всем активным подпискам пользователя.
   */
  async cancelAllCollections(ownerId: string, userLogin?: string): Promise<string[]> {
    const filter = userLogin
      ? (subscriptionEditorFilter(ownerId, userLogin) as object)
      : { ownerId };
    const subscriptions = await this.em.find(Subscription, filter);

    if (subscriptions.length === 0) {
      return [];
    }

    return this.cancelCollections(subscriptions.map((s) => s.id), ownerId, userLogin);
  }

  /**
   * Детали лога для развёрнутого вида: информация по каждому сотруднику.
   */
  async getLogDetails(
    logId: string,
    ownerId: string,
  ): Promise<{
    logId: string;
    startedAt: string;
    completedAt: string | null;
    overwrite: boolean;
    youtrackDuration: number;
    llmDuration: number;
    employees: Array<{
      login: string;
      displayName: string;
      dataStatus: 'collected' | 'failed' | 'stopped' | 'skipped';
      llmStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | 'no_data';
      error: string | null;
    }>;
  }> {
    const log = await this.em.findOne(
      CollectionLog,
      { id: logId },
      { populate: ['subscription'] },
    );
    if (!log || !log.subscription) {
      throw new NotFoundError('Collection log not found');
    }

    // Verify ownership
    const sub = await this.em.findOne(Subscription, {
      id: log.subscription.id,
      ownerId,
    });
    if (!sub) throw new NotFoundError('Collection log not found');

    // Get active employees for this subscription
    const employees = await this.em.find(
      SubscriptionEmployee,
      { subscription: sub, isActive: true },
      { orderBy: { displayName: 'ASC' } },
    );

    // Get ALL MetricReports for the log's period range (not just this run).
    // week-utils.ts теперь использует UTC, миграция исправила старые даты.
    const reports = log.periodStart
      ? await this.em.find(MetricReport, {
          subscription: sub,
          periodStart: log.periodEnd
            ? { $gte: log.periodStart, $lte: log.periodEnd }
            : log.periodStart,
        })
      : [];

    const reportByLogin = new Map<string, MetricReport>();
    for (const r of reports) {
      reportByLogin.set(r.youtrackLogin, r);
    }

    // Build error map from log.errors
    const errorByLogin = new Map<string, string>();
    for (const err of log.errors) {
      errorByLogin.set(err.login, err.error);
    }

    const isStopped = log.status === 'stopped';
    const isSkipped = log.status === 'skipped';

    const employeeDetails = employees.map((emp) => {
      const report = reportByLogin.get(emp.youtrackLogin);
      const error = errorByLogin.get(emp.youtrackLogin) ?? null;

      let dataStatus: 'collected' | 'failed' | 'stopped' | 'skipped';
      if (error) {
        dataStatus = 'failed';
      } else if (report) {
        dataStatus = 'collected';
      } else if (isStopped) {
        dataStatus = 'stopped';
      } else if (isSkipped) {
        dataStatus = 'skipped';
      } else {
        dataStatus = 'skipped';
      }

      let llmStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | 'no_data';
      if (report) {
        llmStatus = report.llmStatus as typeof llmStatus;
      } else if (isStopped) {
        llmStatus = 'skipped';
      } else {
        llmStatus = 'skipped';
      }

      return {
        login: emp.youtrackLogin,
        displayName: emp.displayName,
        dataStatus,
        llmStatus,
        error,
      };
    });

    return {
      logId: log.id,
      startedAt: log.startedAt.toISOString(),
      completedAt: log.completedAt?.toISOString() ?? null,
      overwrite: log.overwrite,
      youtrackDuration: log.youtrackDuration,
      llmDuration: log.llmDuration,
      employees: employeeDetails,
    };
  }

  /**
   * Удалить один лог сбора (hard delete).
   */
  async deleteLog(logId: string, ownerId: string): Promise<void> {
    const log = await this.em.findOne(
      CollectionLog,
      { id: logId },
      { populate: ['subscription'] },
    );
    if (!log) throw new NotFoundError('Collection log not found');

    // Verify ownership
    if (log.subscription) {
      const sub = await this.em.findOne(Subscription, {
        id: log.subscription.id,
        ownerId,
      });
      if (!sub) throw new NotFoundError('Collection log not found');
    } else if (log.userId !== ownerId) {
      throw new NotFoundError('Collection log not found');
    }

    await this.em.removeAndFlush(log);
  }

  /**
   * Удалить все логи пользователя (опционально по subscriptionId).
   */
  async deleteLogs(
    ownerId: string,
    subscriptionId?: string,
  ): Promise<number> {
    const where: Record<string, unknown> = {};

    if (subscriptionId) {
      const sub = await this.em.findOne(Subscription, { id: subscriptionId, ownerId });
      if (!sub) throw new NotFoundError('Subscription not found');
      where.subscription = sub;
    } else {
      const subs = await this.em.find(Subscription, { ownerId });
      if (subs.length === 0) return 0;
      where.subscription = { $in: subs.map((s) => s.id) };
    }

    const deleted = await this.em.nativeDelete(CollectionLog, where);
    return deleted;
  }

  /**
   * Validate that period doesn't extend into the future.
   */
  private validatePeriodNotFuture(periodStart: Date): void {
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    if (periodStart > today) {
      throw new ValidationError('Нельзя собрать данные за будущий период');
    }
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
