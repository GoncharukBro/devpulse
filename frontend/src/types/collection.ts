export type CollectionProgressStatus =
  | 'pending'
  | 'running'
  | 'stopping'
  | 'completed'
  | 'partial'
  | 'stopped'
  | 'cancelled'
  | 'failed'
  | 'skipped';

export interface CollectionProgress {
  id: string;
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
  subscriptionId: string;
  employeeName?: string;
}

export interface LlmSubscriptionStatus {
  pending: number;
  processing: number;
  total: number;
}

export interface CollectionState {
  activeCollections: CollectionProgress[];
  queue: QueueItem[];
  cronEnabled: boolean;
  llmQueue: LlmQueueItem[];
  llmProcessed: Record<string, number>;
  llmQueueBySubscription: Record<string, LlmSubscriptionStatus>;
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
  skippedEmployees: number;
  failedEmployees: number;
  reQueuedEmployees: number;
  llmTotal: number;
  llmCompleted: number;
  llmFailed: number;
  llmSkipped: number;
  overwrite: boolean;
  errors: CollectionError[];
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  duration: number;
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

export interface StopResponse {
  message: string;
  cancelledLogIds: string[];
}

export interface EmployeeDetail {
  login: string;
  displayName: string;
  dataStatus: 'collected' | 'failed' | 'stopped' | 'skipped';
  llmStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  error: string | null;
}

export interface LogDetails {
  logId: string;
  startedAt: string;
  completedAt: string | null;
  overwrite: boolean;
  youtrackDuration: number;
  llmDuration: number;
  employees: EmployeeDetail[];
}

export type LogGroupBy = 'date' | 'period';
