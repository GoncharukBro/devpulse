export interface CollectionProgress {
  id: string;
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

export interface QueueItem {
  subscriptionId: string;
  projectName: string;
  periodStart: string;
  periodEnd: string;
  type: string;
}

export interface LlmQueueItem {
  reportId: string;
  status: string;
}

export interface CollectionState {
  activeCollections: CollectionProgress[];
  queue: QueueItem[];
  cronEnabled: boolean;
  llmQueue: LlmQueueItem[];
}

export interface CronState {
  enabled: boolean;
  schedule: string;
  nextRun: string | null;
}

export interface CollectionLogEntry {
  id: string;
  subscriptionId: string | null;
  projectName: string | null;
  type: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalEmployees: number;
  processedEmployees: number;
  errors: CollectionError[];
  startedAt: string;
  completedAt: string | null;
  duration: string | null;
}

export interface CollectionError {
  login: string;
  error: string;
  timestamp: string;
}

export interface PaginatedCollectionLogs {
  data: CollectionLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface TriggerResponse {
  message: string;
  collectionLogIds: string[];
}

export interface BackfillResponse {
  message: string;
  weeksToProcess: number;
  collectionLogIds: string[];
}
