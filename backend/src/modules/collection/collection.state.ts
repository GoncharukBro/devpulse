/**
 * In-memory состояние текущих процессов сбора метрик.
 * Позволяет фронту в любой момент узнать текущий прогресс.
 */

export interface CollectionProgress {
  subscriptionId: string;
  projectName: string;
  status: 'pending' | 'queued' | 'running' | 'collecting' | 'completed' | 'partial' | 'stopped' | 'failed' | 'error';
  currentEmployee?: string;
  processedEmployees: number;
  totalEmployees: number;
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
  type: 'scheduled' | 'manual' | 'backfill';
  overwrite: boolean;
}

export interface CollectionState {
  activeCollections: Map<string, CollectionProgress>;
  queue: QueueTask[];
  cronEnabled: boolean;
  llmQueue: Array<{ reportId: string; status: string; subscriptionId: string }>;
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
      this.state.activeCollections.set(logId, progress as CollectionProgress);
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

  setCronEnabled(enabled: boolean): void {
    this.state.cronEnabled = enabled;
  }

  addToLlmQueue(reportId: string, status: string, subscriptionId: string): void {
    const existing = this.state.llmQueue.find((item) => item.reportId === reportId);
    if (!existing) {
      this.state.llmQueue.push({ reportId, status, subscriptionId });
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

  clearCompletedLlmQueue(): void {
    this.state.llmQueue = this.state.llmQueue.filter(
      (i) => i.status !== 'completed' && i.status !== 'error',
    );
  }

  /**
   * Mark subscription(s) as cancelled — removes from queue and active collections.
   */
  cancelBySubscriptionIds(subscriptionIds: string[]): string[] {
    const cancelledLogIds: string[] = [];

    for (const subId of subscriptionIds) {
      this.cancelledSubscriptions.add(subId);
    }

    // Remove queued tasks for these subscriptions
    const removedTasks = this.state.queue.filter((t) =>
      subscriptionIds.includes(t.subscriptionId),
    );
    for (const task of removedTasks) {
      cancelledLogIds.push(task.logId);
    }
    this.state.queue = this.state.queue.filter(
      (t) => !subscriptionIds.includes(t.subscriptionId),
    );

    // Remove active collections for these subscriptions
    for (const [logId, progress] of this.state.activeCollections) {
      if (subscriptionIds.includes(progress.subscriptionId)) {
        cancelledLogIds.push(logId);
        this.state.activeCollections.delete(logId);
      }
    }

    // Remove LLM queue items for these subscriptions
    this.state.llmQueue = this.state.llmQueue.filter(
      (i) => !subscriptionIds.includes(i.subscriptionId),
    );

    // Clean up processed counters
    for (const subId of subscriptionIds) {
      this.state.llmProcessed.delete(subId);
    }

    return cancelledLogIds;
  }

  /**
   * Check if a subscription is cancelled (used by worker).
   */
  isCancelled(subscriptionId: string): boolean {
    return this.cancelledSubscriptions.has(subscriptionId);
  }

  /**
   * Clear cancellation flag for a subscription (after worker acknowledges it).
   */
  clearCancellation(subscriptionId: string): void {
    this.cancelledSubscriptions.delete(subscriptionId);
  }
}

export const collectionState = CollectionStateManager.getInstance();
