import type { ScoreTrend, MetricTrendDTO, ConcernItem } from './reports';

export interface Team {
  id: string;
  name: string;
  membersCount: number;
  avgScore: number | null;
  avgUtilization: number | null;
  avgEstimationAccuracy: number | null;
  scoreTrend: ScoreTrend;
  scoreHistory: number[];
  createdAt: string;
}

export interface TeamDetail {
  id: string;
  name: string;
  members: TeamMember[];
  avgScore: number | null;
  avgUtilization: number | null;
  avgEstimationAccuracy: number | null;
  avgCompletionRate: number | null;
  totalSpentHours: number | null;
  lastPeriodStart: string | null;
  lastPeriodEnd: string | null;
  scoreTrend: ScoreTrend;
  trends: {
    score: MetricTrendDTO;
    utilization: MetricTrendDTO;
    estimationAccuracy: MetricTrendDTO;
    completionRate: MetricTrendDTO;
    spentHours: MetricTrendDTO;
  };
  weeklyTrend: Array<{ periodStart: string; avgScore: number | null }>;
  concerns: ConcernItem[];
}

export interface TeamMember {
  youtrackLogin: string;
  displayName: string;
  lastScore: number | null;
  scoreTrend: ScoreTrend;
  lastUtilization: number | null;
  projects: string[];
}
