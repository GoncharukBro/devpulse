export interface CreateEmployeeDto {
  youtrackLogin: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
}

export interface CreateFieldMappingDto {
  taskTypeMapping?: Record<string, string>;
  typeFieldName?: string;

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
  typeFieldName?: string;

  cycleTimeStartStatuses?: string[];
  cycleTimeEndStatuses?: string[];
  releaseStatuses?: string[];
}

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

export const VALID_TASK_CATEGORY_KEYS = TASK_CATEGORIES.map(c => c.key);

export function getCategoryLabelRu(key: string): string {
  return TASK_CATEGORIES.find(c => c.key === key)?.labelRu ?? key;
}

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
  typeFieldName: 'Type',
  cycleTimeStartStatuses: ['In Progress', 'В работе'],
  cycleTimeEndStatuses: ['Done', 'Verified', 'Fixed', 'Готово'],
  releaseStatuses: [],
};
