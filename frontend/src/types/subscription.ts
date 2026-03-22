export interface CurrentPeriodStatus {
  periodStart: string;
  totalEmployees: number;
  dataCollected: number;
  llmCompleted: number;
  llmPending: number;
  llmProcessing: number;
  llmFailed: number;
  llmSkipped: number;
  llmNoData: number;
}

export interface Subscription {
  id: string;
  youtrackInstanceId: string;
  youtrackInstanceName: string;
  projectId: string;
  projectShortName: string;
  projectName: string;
  isActive: boolean;
  employeeCount: number;
  lastCollection: {
    status: string;
    completedAt: string | null;
    processedEmployees: number;
    totalEmployees: number;
    skippedEmployees: number;
    failedEmployees: number;
    reQueuedEmployees: number;
    llmTotal: number;
    llmCompleted: number;
    llmFailed: number;
    llmSkipped: number;
  } | null;
  currentPeriodStatus: CurrentPeriodStatus | null;
  createdAt: string;
  isOwner: boolean;
}

export interface SubscriptionDetail extends Subscription {
  employees: SubscriptionEmployee[];
  fieldMapping: FieldMapping | null;
  updatedAt: string;
}

export interface SubscriptionEmployee {
  id: string;
  youtrackLogin: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  isActive: boolean;
}

export interface FieldMapping {
  taskTypeMapping: Record<string, string>;
  typeFieldName: string;
  cycleTimeStartStatuses: string[];
  cycleTimeEndStatuses: string[];
  releaseStatuses: string[];
}

export interface CreateEmployeeDto {
  youtrackLogin: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
}

export interface CreateSubscriptionDto {
  youtrackInstanceId: string;
  projectId: string;
  projectShortName: string;
  projectName: string;
  employees: CreateEmployeeDto[];
  fieldMapping?: CreateFieldMappingDto;
}

export interface CreateFieldMappingDto {
  taskTypeMapping?: Record<string, string>;
  typeFieldName?: string;
  cycleTimeStartStatuses?: string[];
  cycleTimeEndStatuses?: string[];
  releaseStatuses?: string[];
}

export interface UpdateSubscriptionDto {
  isActive?: boolean;
}

export interface UpdateFieldMappingDto {
  taskTypeMapping?: Record<string, string>;
  typeFieldName?: string;
  cycleTimeStartStatuses?: string[];
  cycleTimeEndStatuses?: string[];
  releaseStatuses?: string[];
}

/**
 * Категории задач — зеркало backend/src/modules/subscriptions/subscriptions.types.ts.
 * При добавлении/изменении категорий обновлять оба файла.
 */
export interface TaskCategoryDefinition {
  key: string;
  labelRu: string;
  labelEn: string;
  color: string;
}

export const TASK_CATEGORIES: TaskCategoryDefinition[] = [
  { key: 'feature',       labelRu: 'Фичи',         labelEn: 'Feature',       color: '#6366f1' },
  { key: 'bugfix',        labelRu: 'Баги',          labelEn: 'Bugfix',        color: '#ef4444' },
  { key: 'techDebt',      labelRu: 'Техдолг',       labelEn: 'Tech Debt',     color: '#f59e0b' },
  { key: 'support',       labelRu: 'Поддержка',     labelEn: 'Support',       color: '#06b6d4' },
  { key: 'documentation', labelRu: 'Документация',  labelEn: 'Documentation', color: '#10b981' },
  { key: 'codeReview',    labelRu: 'Code Review',   labelEn: 'Code Review',   color: '#8b5cf6' },
  { key: 'other',         labelRu: 'Прочее',        labelEn: 'Other',         color: '#6b7280' },
];

export interface SubscriptionShare {
  id: number;
  sharedWithLogin: string;
  sharedBy: string;
  createdAt: string;
}

export interface SharesListResponse {
  items: SubscriptionShare[];
  total: number;
}
