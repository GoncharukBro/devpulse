export interface CreateEmployeeDto {
  youtrackLogin: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
}

export interface CreateFieldMappingDto {
  taskTypeMapping?: Record<string, string>;
  aiSavingWorkType?: string | null;
  cycleTimeStartStatuses?: string[];
  cycleTimeEndStatuses?: string[];
  releaseStatuses?: string[];
}

export interface CreateSubscriptionDto {
  youtrackInstanceId: string;
  projectId: string;
  projectShortName: string;
  projectName: string;
  employees: CreateEmployeeDto[];
  fieldMapping?: CreateFieldMappingDto;
}

export interface UpdateSubscriptionDto {
  isActive?: boolean;
}

export interface UpdateEmployeeDto {
  isActive?: boolean;
}

export interface UpdateFieldMappingDto {
  taskTypeMapping?: Record<string, string>;
  aiSavingWorkType?: string | null;
  cycleTimeStartStatuses?: string[];
  cycleTimeEndStatuses?: string[];
  releaseStatuses?: string[];
}

export const VALID_TASK_CATEGORIES = [
  'feature',
  'bugfix',
  'techDebt',
  'support',
  'documentation',
  'codeReview',
  'other',
] as const;

export const DEFAULT_FIELD_MAPPING: Required<CreateFieldMappingDto> = {
  taskTypeMapping: {
    Feature: 'feature',
    Bug: 'bugfix',
    Task: 'feature',
    Epic: 'feature',
    'User Story': 'feature',
    'Tech Debt': 'techDebt',
    Documentation: 'documentation',
    'Code Review': 'codeReview',
  },
  aiSavingWorkType: null,
  cycleTimeStartStatuses: ['In Progress', 'В работе'],
  cycleTimeEndStatuses: ['Done', 'Verified', 'Fixed', 'Готово'],
  releaseStatuses: [],
};
