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
  periodStart: Date;
  periodEnd: Date;
  type: 'scheduled' | 'manual' | 'backfill';
}

export interface CollectionState {
  activeCollections: Map<string, CollectionProgress>;
  queue: QueueTask[];
  cronEnabled: boolean;
  llmQueue: Array<{ reportId: string; status: string }>;
}

class CollectionStateManager {
  private static instance: CollectionStateManager;

  private state: CollectionState = {
    activeCollections: new Map(),
    queue: [],
    cronEnabled: false,
    llmQueue: [],
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

  addToLlmQueue(reportId: string, status: string): void {
    const existing = this.state.llmQueue.find((item) => item.reportId === reportId);
    if (!existing) {
      this.state.llmQueue.push({ reportId, status });
    }
  }

  updateLlmQueueItem(reportId: string, status: string): void {
    const item = this.state.llmQueue.find((i) => i.reportId === reportId);
    if (item) {
      item.status = status;
    }
  }

  removeLlmQueueItem(reportId: string): void {
    this.state.llmQueue = this.state.llmQueue.filter((i) => i.reportId !== reportId);
  }

  clearCompletedLlmQueue(): void {
    this.state.llmQueue = this.state.llmQueue.filter(
      (i) => i.status !== 'completed' && i.status !== 'error',
    );
  }
}

export const collectionState = CollectionStateManager.getInstance();
