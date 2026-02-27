/**
 * In-memory состояние текущих процессов сбора метрик.
 * Позволяет фронту в любой момент узнать текущий прогресс.
 */

export type CollectionProgressStatus =
  | 'pending'    // в очереди (бывший queued)
  | 'running'    // идёт сбор
  | 'stopping'   // нажата "Остановить", ждём завершения текущего
  | 'completed'  // все обработаны успешно
  | 'partial'    // завершён, часть с ошибками
  | 'stopped'    // остановлен пользователем
  | 'cancelled'  // отменён из очереди (не начинал)
  | 'failed'     // полный сбой (0 обработано)
  | 'skipped';   // все пропущены (overwrite=false, данные есть)

export interface CollectionProgress {
  subscriptionId: string;
  projectName: string;
  status: CollectionProgressStatus;
  type?: 'manual' | 'cron';
  currentEmployee?: string;
  currentWeek?: number;
  totalWeeks?: number;
  processedEmployees: number;
  totalEmployees: number;
  skippedEmployees: number;
  failedEmployees: number;
  reQueuedEmployees: number;
  periodStart: string;
  periodEnd: string;
  startedAt: string;
  error?: string;
}

export interface QueueTask {
  subscriptionId: string;
  logId: string;
  periodStart: Date;
  periodEnd: Date;
  type: 'cron' | 'manual';
  overwrite: boolean;
}

export interface CollectionState {
  activeCollections: Map<string, CollectionProgress>;
  queue: QueueTask[];
  cronEnabled: boolean;
  llmQueue: Array<{ reportId: string; status: string; subscriptionId: string; employeeName?: string }>;
  /** Tracks how many LLM items have been processed per subscription (for progress calculation) */
  llmProcessed: Map<string, number>;
}

class CollectionStateManager {
  private static instance: CollectionStateManager;

  private state: CollectionState = {
    activeCollections: new Map(),
    queue: [],
    cronEnabled: false,
    llmQueue: [],
    llmProcessed: new Map(),
  };

  /** Subscription IDs that should be cancelled */
  private cancelledSubscriptions = new Set<string>();

  static getInstance(): CollectionStateManager {
    if (!CollectionStateManager.instance) {
      CollectionStateManager.instance = new CollectionStateManager();
    }
    return CollectionStateManager.instance;
  }

  getState(): CollectionState {
    return this.state;
  }

  updateProgress(logId: string, progress: Partial<CollectionProgress>): void {
    const existing = this.state.activeCollections.get(logId);
    if (existing) {
      Object.assign(existing, progress);
    } else {
      this.state.activeCollections.set(logId, {
        subscriptionId: '',
        projectName: '',
        status: 'pending',
        processedEmployees: 0,
        totalEmployees: 0,
        skippedEmployees: 0,
        failedEmployees: 0,
        reQueuedEmployees: 0,
        periodStart: '',
        periodEnd: '',
        startedAt: new Date().toISOString(),
        ...progress,
      } as CollectionProgress);
    }
  }

  removeProgress(logId: string): void {
    this.state.activeCollections.delete(logId);
  }

  addToQueue(task: QueueTask): void {
    this.state.queue.push(task);
  }

  removeFromQueue(subscriptionId: string, periodStart: Date): void {
    this.state.queue = this.state.queue.filter(
      (t) =>
        !(t.subscriptionId === subscriptionId && t.periodStart.getTime() === periodStart.getTime()),
    );
  }

  shiftQueue(): QueueTask | undefined {
    return this.state.queue.shift();
  }

  getQueueLength(): number {
    return this.state.queue.length;
  }

  /** Check if a subscription has a queued or active collection */
  isSubscriptionBusy(subscriptionId: string): boolean {
    // Check queue
    if (this.state.queue.some((t) => t.subscriptionId === subscriptionId)) {
      return true;
    }
    // Check active collections
    for (const [, progress] of this.state.activeCollections) {
      if (progress.subscriptionId === subscriptionId &&
          ['pending', 'running', 'stopping'].includes(progress.status)) {
        return true;
      }
    }
    return false;
  }

  /** Check if any collection is active (for cron conflict check) */
  isAnyCollectionActive(): boolean {
    return this.state.activeCollections.size > 0 || this.state.queue.length > 0;
  }

  setCronEnabled(enabled: boolean): void {
    this.state.cronEnabled = enabled;
  }

  addToLlmQueue(reportId: string, status: string, subscriptionId: string, employeeName?: string): void {
    const existing = this.state.llmQueue.find((item) => item.reportId === reportId);
    if (!existing) {
      this.state.llmQueue.push({ reportId, status, subscriptionId, employeeName });
    }
  }

  updateLlmQueueItem(reportId: string, status: string): void {
    const item = this.state.llmQueue.find((i) => i.reportId === reportId);
    if (item) {
      item.status = status;
    }
  }

  removeLlmQueueItem(reportId: string): void {
    const item = this.state.llmQueue.find((i) => i.reportId === reportId);
    if (item) {
      // Increment processed counter for this subscription
      const prev = this.state.llmProcessed.get(item.subscriptionId) ?? 0;
      this.state.llmProcessed.set(item.subscriptionId, prev + 1);
    }
    this.state.llmQueue = this.state.llmQueue.filter((i) => i.reportId !== reportId);

    // Clean up processed counters for subscriptions with no remaining items
    if (item) {
      const hasRemaining = this.state.llmQueue.some((i) => i.subscriptionId === item.subscriptionId);
      if (!hasRemaining) {
        this.state.llmProcessed.delete(item.subscriptionId);
      }
    }
  }

  /** Mark LLM items as skipped for given subscriptions (when project is stopped).
   *  Returns the reportIds of skipped items (for DB update). */
  skipLlmItemsForSubscriptions(subscriptionIds: string[]): string[] {
    const skippedReportIds: string[] = [];
    for (const item of this.state.llmQueue) {
      if (subscriptionIds.includes(item.subscriptionId)) {
        item.status = 'skipped';
        skippedReportIds.push(item.reportId);
      }
    }
    // Remove them
    this.state.llmQueue = this.state.llmQueue.filter(
      (i) => !subscriptionIds.includes(i.subscriptionId),
    );
    // Clean up processed counters
    for (const subId of subscriptionIds) {
      this.state.llmProcessed.delete(subId);
    }
    return skippedReportIds;
  }

  clearCompletedLlmQueue(): void {
    this.state.llmQueue = this.state.llmQueue.filter(
      (i) => i.status !== 'completed' && i.status !== 'failed',
    );
  }

  /**
   * Mark subscription(s) as cancelled — removes from queue and flags active collections.
   * Returns cancelled/stopped logIds and skipped LLM reportIds.
   *
   * Only adds to `cancelledSubscriptions` for subs that have an active
   * YouTrack collection (status='running'). Subs in LLM-only phase get
   * their LLM items skipped without planting a flag that would poison
   * the next trigger.
   */
  cancelBySubscriptionIds(subscriptionIds: string[]): {
    logResults: Array<{ logId: string; action: 'cancelled' | 'stopped' }>;
    skippedLlmReportIds: string[];
  } {
    const logResults: Array<{ logId: string; action: 'cancelled' | 'stopped' }> = [];

    // Remove queued tasks → these get 'cancelled' status
    const removedTasks = this.state.queue.filter((t) =>
      subscriptionIds.includes(t.subscriptionId),
    );
    for (const task of removedTasks) {
      logResults.push({ logId: task.logId, action: 'cancelled' });
      // Also remove from activeCollections (the pending entry)
      this.state.activeCollections.delete(task.logId);
    }
    this.state.queue = this.state.queue.filter(
      (t) => !subscriptionIds.includes(t.subscriptionId),
    );

    // Mark active running collections as 'stopping' → worker will transition to 'stopped'
    // Only flag subs that have an active YouTrack collection
    for (const [logId, progress] of this.state.activeCollections) {
      if (subscriptionIds.includes(progress.subscriptionId) && progress.status === 'running') {
        progress.status = 'stopping';
        logResults.push({ logId, action: 'stopped' });
        this.cancelledSubscriptions.add(progress.subscriptionId);
      }
    }

    // Skip LLM items for these subscriptions
    const skippedLlmReportIds = this.skipLlmItemsForSubscriptions(subscriptionIds);

    return { logResults, skippedLlmReportIds };
  }

  /**
   * Check if a subscription is cancelled (used by worker).
   */
  isCancelled(subscriptionId: string): boolean {
    return this.cancelledSubscriptions.has(subscriptionId);
  }

  /**
   * Also check by looking at the progress status.
   */
  isStopping(logId: string): boolean {
    const progress = this.state.activeCollections.get(logId);
    return progress?.status === 'stopping' || false;
  }

  /**
   * Clear cancellation flag for a subscription (after worker acknowledges it).
   */
  clearCancellation(subscriptionId: string): void {
    this.cancelledSubscriptions.delete(subscriptionId);
  }

  /**
   * Get LLM queue breakdown by subscription for the API response.
   */
  getLlmQueueBySubscription(): Record<string, { pending: number; processing: number; total: number }> {
    const result: Record<string, { pending: number; processing: number; total: number }> = {};

    for (const item of this.state.llmQueue) {
      if (!result[item.subscriptionId]) {
        result[item.subscriptionId] = { pending: 0, processing: 0, total: 0 };
      }
      const entry = result[item.subscriptionId];
      entry.total++;
      if (item.status === 'processing') {
        entry.processing++;
      } else {
        entry.pending++;
      }
    }

    // Add processed counts to totals
    for (const [subId, processedCount] of this.state.llmProcessed) {
      if (!result[subId]) {
        result[subId] = { pending: 0, processing: 0, total: 0 };
      }
      result[subId].total += processedCount;
    }

    return result;
  }
}

export const collectionState = CollectionStateManager.getInstance();
