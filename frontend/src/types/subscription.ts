export interface CurrentPeriodStatus {
  periodStart: string;
  totalEmployees: number;
  dataCollected: number;
  llmCompleted: number;
  llmPending: number;
  llmProcessing: number;
  llmFailed: number;
  llmSkipped: number;
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
  aiSavingWorkType: string | null;
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
  aiSavingWorkType?: string | null;
  cycleTimeStartStatuses?: string[];
  cycleTimeEndStatuses?: string[];
  releaseStatuses?: string[];
}

export interface UpdateSubscriptionDto {
  isActive?: boolean;
}

export interface UpdateFieldMappingDto {
  taskTypeMapping?: Record<string, string>;
  aiSavingWorkType?: string | null;
  cycleTimeStartStatuses?: string[];
  cycleTimeEndStatuses?: string[];
  releaseStatuses?: string[];
}

export const TASK_CATEGORIES = [
  'feature',
  'bugfix',
  'techDebt',
  'support',
  'documentation',
  'codeReview',
  'other',
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  feature: 'Feature',
  bugfix: 'Bugfix',
  techDebt: 'Tech Debt',
  support: 'Support',
  documentation: 'Documentation',
  codeReview: 'Code Review',
  other: 'Other',
};
