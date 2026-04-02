/**
 * DTO-типы агрегированных отчётов (зеркало backend).
 */

import type { ScoreTrend, MetricTrendDTO } from '@/types/reports';

export interface AggregatedMetricsDTO {
  totalIssues: number;
  completedIssues: number;
  overdueIssues: number;
  totalSpentHours: number;
  totalEstimationHours: number;
  avgUtilization: number | null;
  avgEstimationAccuracy: number | null;
  avgFocus: number | null;
  avgCompletionRate: number | null;
  avgCycleTimeHours: number | null;
  avgScore: number | null;
}

export interface WeeklyDataItem {
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
  overdueIssues: number;
}

export interface WeeklyTrendItem {
  periodStart: string;
  score: MetricTrendDTO;
  utilization: MetricTrendDTO;
  estimationAccuracy: MetricTrendDTO;
  focus: MetricTrendDTO;
  completionRate: MetricTrendDTO;
}

export interface OverallTrend {
  score: MetricTrendDTO;
  utilization: MetricTrendDTO;
  estimationAccuracy: MetricTrendDTO;
  focus: MetricTrendDTO;
  completionRate: MetricTrendDTO;
  spentHours: MetricTrendDTO;
}

export interface WeeklyLlmItem {
  periodStart: string;
  score: number | null;
  summary: string | null;
  concerns: string[] | null;
  recommendations: string[] | null;
}

export interface EmployeeAggItem {
  youtrackLogin: string;
  displayName: string;
  avgScore: number | null;
  avgUtilization: number | null;
  avgCompletionRate: number | null;
  completedIssues: number;
  totalIssues: number;
  scoreTrend: ScoreTrend;
}

export interface ReportProgress {
  phase: 'collecting' | 'analyzing';
  total: number;
  completed: number;
  currentStep?: string;
}

export interface PeriodBreakdownItem {
  label: string;
  totalIssues: number;
  completedIssues: number;
  overdueIssues: number;
  totalSpentHours: number;
  utilization: number | null;
  estimationAccuracy: number | null;
  completionRate: number | null;
  issuesByType: Record<string, number>;
}

export interface EmployeeAggItemV2 extends EmployeeAggItem {
  projectName?: string;
  llmScore: number | null;
  llmSummary: string | null;
  llmConcerns: string[] | null;
  llmRecommendations: string[] | null;
  periodBreakdown: PeriodBreakdownItem[] | null;
}

export interface CreateRequest {
  type: 'employee' | 'project' | 'team';
  targetId: string;
  dateFrom: string;
  dateTo: string;
}

export interface CreateResponse {
  id: string;
  status: string;
}

export interface AggregatedReportListItem {
  id: string;
  type: 'employee' | 'project' | 'team';
  targetName: string;
  periodStart: string;
  periodEnd: string;
  weeksCount: number;
  avgScore: number | null;
  status: string;
  createdAt: string;
}

export interface ListResponse {
  data: AggregatedReportListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface AggregatedReportDTO {
  id: string;
  type: 'employee' | 'project' | 'team';
  targetName: string;
  periodStart: string;
  periodEnd: string;
  weeksCount: number;

  aggregatedMetrics: AggregatedMetricsDTO;
  weeklyData: WeeklyDataItem[];
  weeklyTrends: WeeklyTrendItem[];
  overallTrend: OverallTrend;
  weeklyLlmSummaries: WeeklyLlmItem[];

  llmPeriodScore: number | null;
  llmPeriodSummary: string | null;
  llmPeriodConcerns: string[] | null;
  llmPeriodRecommendations: string[] | null;

  employeesData: EmployeeAggItem[] | null;

  progress: ReportProgress | null;
  collectedData: unknown | null;

  status: string;
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: string;
}
