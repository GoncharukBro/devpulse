/**
 * In-memory состояние текущих процессов сбора метрик.
 * Позволяет фронту в любой момент узнать текущий прогресс.
 */

export interface CollectionProgress {
  subscriptionId: string;
  projectName: string;
  status: 'queued' | 'collecting' | 'completed' | 'error';
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
}

export const collectionState = CollectionStateManager.getInstance();
