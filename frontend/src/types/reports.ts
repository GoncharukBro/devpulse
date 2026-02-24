/**
 * DTO-типы отчётов (зеркало backend/src/modules/reports/reports.types.ts).
 */

import type { Achievement } from '@/types/achievement';

export type ScoreTrend = 'up' | 'down' | 'stable' | null;

export interface LlmTaskClassification {
  businessCritical: string[];
  technicallySignificant: string[];
}

export interface EmployeeReportDTO {
  youtrackLogin: string;
  displayName: string;
  email?: string;
  subscriptionId: string;
  projectName: string;
  periodStart: string;
  periodEnd: string;

  score: number | null;
  scoreSource: 'llm' | 'formula' | null;

  totalIssues: number;
  completedIssues: number;
  inProgressIssues: number;
  overdueIssues: number;
  issuesByType: Record<string, number>;
  issuesWithoutEstimation: number;
  issuesOverEstimation: number;

  totalSpentHours: number;
  spentByType: Record<string, number>;
  totalEstimationHours: number;
  aiSavingHours: number;

  utilization: number | null;
  estimationAccuracy: number | null;
  focus: number | null;
  avgComplexityHours: number | null;
  completionRate: number | null;
  avgCycleTimeHours: number | null;

  llmSummary: string | null;
  llmAchievements: string[] | null;
  llmConcerns: string[] | null;
  llmRecommendations: string[] | null;
  llmTaskClassification: LlmTaskClassification | null;

  status: string;
  llmProcessedAt: string | null;

  bugsAfterRelease: number;
  bugsOnTest: number;
}

export interface EmployeeWeekData {
  [key: string]: string | number | null | undefined;
  periodStart: string;
  periodEnd: string;
  score: number | null;
  utilization: number | null;
  estimationAccuracy: number | null;
  focus: number | null;
  completionRate: number | null;
  avgCycleTimeHours: number | null;
  totalSpentHours: number;
  completedIssues: number;
  totalIssues: number;
}

export interface EmployeeHistoryDTO {
  youtrackLogin: string;
  displayName: string;
  weeks: EmployeeWeekData[];
  scoreTrend: ScoreTrend;
  avgScore: number | null;
}

export interface EmployeeSummaryDTO {
  youtrackLogin: string;
  displayName: string;
  email?: string;
  projects: Array<{
    subscriptionId: string;
    projectName: string;
    projectShortName: string;
    lastScore: number | null;
    scoreTrend: ScoreTrend;
  }>;
  avgScore: number | null;
  avgUtilization: number | null;
  avgEstimationAccuracy: number | null;
  avgFocus: number | null;
  totalCompletedIssues: number;
  scoreTrend: ScoreTrend;
  lastLlmSummary: string | null;
  lastLlmConcerns: string[] | null;
  achievements?: Achievement[];
}

export interface ConcernItem {
  youtrackLogin: string;
  displayName: string;
  reason: string;
  severity: 'warning' | 'danger';
}

export interface ProjectConcernItem extends ConcernItem {
  projectName?: never;
}

export interface OverviewConcernItem extends ConcernItem {
  projectName: string;
}

export interface ProjectEmployeeRow {
  youtrackLogin: string;
  displayName: string;
  score: number | null;
  utilization: number | null;
  estimationAccuracy: number | null;
  completionRate: number | null;
  completedIssues: number;
  totalIssues: number;
  scoreTrend: ScoreTrend;
  llmConcerns: string[] | null;
}

export interface ProjectSummaryDTO {
  subscriptionId: string;
  projectName: string;
  projectShortName: string;
  isActive: boolean;

  lastPeriodStart: string | null;
  lastPeriodEnd: string | null;

  avgScore: number | null;
  avgUtilization: number | null;
  avgEstimationAccuracy: number | null;
  avgCompletionRate: number | null;
  avgCycleTimeHours: number | null;
  totalEmployees: number;

  scoreTrend: ScoreTrend;

  employees: ProjectEmployeeRow[];
  concerns: ProjectConcernItem[];
  aggregatedRecommendations: string[];
}

export interface ProjectWeekData {
  [key: string]: string | number | null | undefined;
  periodStart: string;
  avgScore: number | null;
  avgUtilization: number | null;
  avgEstimationAccuracy: number | null;
  avgCompletionRate: number | null;
  totalCompletedIssues: number;
  totalIssues: number;
  employeesCount: number;
}

export interface ProjectHistoryDTO {
  weeks: ProjectWeekData[];
}

export interface OverviewDTO {
  totalEmployees: number;
  avgScore: number | null;
  avgUtilization: number | null;
  scoreTrend: ScoreTrend;
  concerns: OverviewConcernItem[];
  recentAchievements: Achievement[];
  weeklyTrend: Array<{
    periodStart: string;
    avgScore: number | null;
    avgUtilization: number | null;
    totalEmployees: number;
  }>;
}

export interface EmployeeListItem {
  youtrackLogin: string;
  displayName: string;
  email?: string;
  projects: string[];
  lastScore: number | null;
  scoreTrend: ScoreTrend;
}

export interface EmployeeReportListItem {
  periodStart: string;
  periodEnd: string;
  score: number | null;
  scoreSource: 'llm' | 'formula' | null;
  utilization: number | null;
  completedIssues: number;
  totalIssues: number;
  status: string;
  subscriptionId: string;
  projectName: string;
}

export interface PaginatedEmployeeReports {
  data: EmployeeReportListItem[];
  total: number;
  page: number;
  limit: number;
}
