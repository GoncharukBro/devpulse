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

// ─── New types for arbitrary-period reports ─────────────────

export interface ReportProgress {
  phase: 'collecting' | 'analyzing';
  total: number;
  completed: number;
  currentStep?: string;
}

export interface CollectedEmployeeMetrics {
  totalIssues: number;
  completedIssues: number;
  overdueIssues: number;
  totalSpentMinutes: number;
  totalEstimationMinutes: number;
  issuesByType: Record<string, number>;
  issuesWithoutEstimation: number;
  issuesOverEstimation: number;
  inProgressIssues: number;
  bugsAfterRelease: number;
  bugsOnTest: number;
}

export interface CollectedEmployeeKpi {
  utilization: number | null;
  estimationAccuracy: number | null;
  focus: number | null;
  completionRate: number | null;
  avgCycleTimeHours: number | null;
}

export interface CollectedTaskItem {
  id: string;
  summary: string;
  type: string;
  spentMinutes: number;
  estimationMinutes: number;
  overdueDays?: number;
  created: number;
  resolved: number | null;
}

export interface CollectedEmployeeData {
  login: string;
  displayName: string;
  subscriptionId: string;
  projectShortName: string;
  projectName: string;
  metrics: CollectedEmployeeMetrics;
  kpi: CollectedEmployeeKpi;
  topTasks: CollectedTaskItem[];
  /** Все задачи с датами (для построения динамики) */
  allTasks: CollectedTaskItem[];
  /** Списания по дням: ISO-дата → минуты */
  spentByDay: Record<string, number>;
  /** Списания по типам по дням: тип → ISO-дата → минуты */
  spentByDayByType: Record<string, Record<string, number>>;
}

export interface CollectedData {
  employees: CollectedEmployeeData[];
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
  status: 'collecting' | 'generating' | 'ready';
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
  scoreTrend: ScoreTrend;
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

  status: string;
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: string;
  progress: ReportProgress | null;
  collectedData: CollectedData | null;
}
