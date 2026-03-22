/**
 * DTO-типы для агрегированных отчётов.
 */

import { ScoreTrend, MetricTrendDTO } from '../../common/utils/metrics-utils';

export type { ScoreTrend, MetricTrendDTO };

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
  score: { direction: ScoreTrend; delta: number | null };
  utilization: { direction: ScoreTrend; delta: number | null };
  estimationAccuracy: { direction: ScoreTrend; delta: number | null };
  focus: { direction: ScoreTrend; delta: number | null };
  completionRate: { direction: ScoreTrend; delta: number | null };
}

export interface OverallTrend {
  score: { direction: ScoreTrend; delta: number | null };
  utilization: { direction: ScoreTrend; delta: number | null };
  estimationAccuracy: { direction: ScoreTrend; delta: number | null };
  focus: { direction: ScoreTrend; delta: number | null };
  completionRate: { direction: ScoreTrend; delta: number | null };
  spentHours: { direction: ScoreTrend; delta: number | null };
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

export interface PreviewRequest {
  type: 'employee' | 'project' | 'team';
  targetId: string;
  dateFrom: string;  // YYYY-MM-DD
  dateTo: string;    // YYYY-MM-DD
}

export interface PreviewResponse {
  periodStart: string;
  periodEnd: string;
  weeksCount: number;
  targetName: string;
  availableWeeks: number;
  aggregatedMetrics: AggregatedMetricsDTO;
  weeklyData: WeeklyDataItem[];
}

export interface CreateRequest extends PreviewRequest {}

export interface CreateResponse {
  id: string;
  status: 'generating' | 'ready';
}

export interface ListQuery {
  type?: string;
  page?: string;
  limit?: string;
}

export interface AggregatedReportListItem {
  id: string;
  type: 'employee' | 'project' | 'team';
  targetName: string;
  periodStart: string;
  periodEnd: string;
  weeksCount: number;
  avgScore: number | null;
  status: 'generating' | 'ready' | 'failed';
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

  status: string;
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: string;
}
