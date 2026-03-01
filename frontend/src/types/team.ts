import type { ScoreTrend } from './reports';

export interface Team {
  id: string;
  name: string;
  membersCount: number;
  avgScore: number | null;
  avgUtilization: number | null;
  avgEstimationAccuracy: number | null;
  scoreTrend: ScoreTrend;
  createdAt: string;
}

export interface TeamDetail {
  id: string;
  name: string;
  members: TeamMember[];
  avgScore: number | null;
  avgUtilization: number | null;
  scoreTrend: ScoreTrend;
  weeklyTrend: Array<{ periodStart: string; avgScore: number | null }>;
}

export interface TeamMember {
  youtrackLogin: string;
  displayName: string;
  lastScore: number | null;
  scoreTrend: ScoreTrend;
  lastUtilization: number | null;
  projects: string[];
}
