/**
 * DTO и типы для модуля команд.
 */

import { ScoreTrend } from '../reports/reports.types';

export interface CreateTeamDto {
  name: string;
  members: string[];
}

export interface UpdateTeamDto {
  name?: string;
}

export interface AddMembersDto {
  members: string[];
}

export interface TeamListItem {
  id: string;
  name: string;
  membersCount: number;
  avgScore: number | null;
  avgUtilization: number | null;
  scoreTrend: ScoreTrend;
  scoreHistory: number[];
  createdAt: string;
}

export interface TeamMemberDetail {
  youtrackLogin: string;
  displayName: string;
  lastScore: number | null;
  scoreTrend: ScoreTrend;
  lastUtilization: number | null;
  projects: string[];
}

export interface TeamWeekTrend {
  periodStart: string;
  avgScore: number | null;
}

export interface TeamDetailDTO {
  id: string;
  name: string;
  members: TeamMemberDetail[];
  avgScore: number | null;
  avgUtilization: number | null;
  scoreTrend: ScoreTrend;
  weeklyTrend: TeamWeekTrend[];
}
