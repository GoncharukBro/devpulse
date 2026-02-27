/**
 * Бизнес-логика команд: CRUD + агрегированные метрики.
 */

import { EntityManager } from '@mikro-orm/postgresql';
import { Team } from '../../entities/team.entity';
import { TeamMember } from '../../entities/team-member.entity';
import { Subscription } from '../../entities/subscription.entity';
import { SubscriptionEmployee } from '../../entities/subscription-employee.entity';
import { MetricReport } from '../../entities/metric-report.entity';
import { NotFoundError, ValidationError } from '../../common/errors';
import { formatYTDate } from '../../common/utils/week-utils';
import { ScoreTrend } from '../reports/reports.types';
import {
  TeamListItem,
  TeamDetailDTO,
  TeamMemberDetail,
  TeamWeekTrend,
} from './teams.types';

function getEffectiveScore(report: MetricReport): number | null {
  return report.llmScore ?? null;
}

function avgNullable(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 100) / 100;
}

function calcTrend(scores: Array<number | null>): ScoreTrend {
  const valid = scores.filter((s): s is number => s !== null);
  if (valid.length < 2) return null;
  const last = valid[valid.length - 1];
  const prev = valid[valid.length - 2];
  const diff = last - prev;
  if (diff > 5) return 'up';
  if (diff < -5) return 'down';
  return 'stable';
}

export class TeamsService {
  constructor(private em: EntityManager) {}

  // ─── List Teams ────────────────────────────────────────────────────

  async listTeams(ownerId: string): Promise<TeamListItem[]> {
    const teams = await this.em.find(
      Team,
      { ownerId },
      { populate: ['members'], orderBy: { createdAt: 'DESC' } },
    );

    const subIds = await this.getUserSubscriptionIds(ownerId);
    const result: TeamListItem[] = [];

    for (const team of teams) {
      const logins = team.members.getItems().map((m) => m.youtrackLogin);
      const { avgScore, scoreTrend } = await this.getTeamAggregates(logins, subIds);

      result.push({
        id: team.id,
        name: team.name,
        membersCount: logins.length,
        avgScore,
        scoreTrend,
        createdAt: team.createdAt.toISOString(),
      });
    }

    return result;
  }

  // ─── Get Team Detail ───────────────────────────────────────────────

  async getTeam(teamId: string, ownerId: string): Promise<TeamDetailDTO> {
    const team = await this.em.findOne(
      Team,
      { id: teamId, ownerId },
      { populate: ['members'] },
    );
    if (!team) throw new NotFoundError('Team not found');

    const subIds = await this.getUserSubscriptionIds(ownerId);
    const logins = team.members.getItems().map((m) => m.youtrackLogin);

    // Build member details
    const members: TeamMemberDetail[] = [];
    for (const login of logins) {
      members.push(await this.getMemberDetail(login, subIds));
    }

    const { avgScore, scoreTrend } = await this.getTeamAggregates(logins, subIds);
    const avgUtilization = avgNullable(
      members.map((m) => m.lastUtilization),
    );

    // Weekly trend (last 8 weeks)
    const weeklyTrend = await this.getTeamWeeklyTrend(logins, subIds, 8);

    return {
      id: team.id,
      name: team.name,
      members,
      avgScore,
      avgUtilization,
      scoreTrend,
      weeklyTrend,
    };
  }

  // ─── Create Team ───────────────────────────────────────────────────

  async createTeam(
    ownerId: string,
    name: string,
    memberLogins: string[],
  ): Promise<{ id: string; name: string }> {
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Team name is required');
    }
    if (!memberLogins || memberLogins.length === 0) {
      throw new ValidationError('At least one member is required');
    }

    const team = new Team();
    team.name = name.trim();
    team.ownerId = ownerId;
    team.createdAt = new Date();
    team.updatedAt = new Date();
    this.em.persist(team);
    await this.em.flush();

    for (const login of memberLogins) {
      const member = new TeamMember();
      member.team = team;
      member.youtrackLogin = login;
      member.createdAt = new Date();
      this.em.persist(member);
    }
    await this.em.flush();

    return { id: team.id, name: team.name };
  }

  // ─── Update Team ───────────────────────────────────────────────────

  async updateTeam(
    teamId: string,
    ownerId: string,
    name: string,
  ): Promise<{ id: string; name: string }> {
    const team = await this.em.findOne(Team, { id: teamId, ownerId });
    if (!team) throw new NotFoundError('Team not found');

    if (!name || name.trim().length === 0) {
      throw new ValidationError('Team name is required');
    }

    team.name = name.trim();
    await this.em.flush();

    return { id: team.id, name: team.name };
  }

  // ─── Delete Team ───────────────────────────────────────────────────

  async deleteTeam(teamId: string, ownerId: string): Promise<void> {
    const team = await this.em.findOne(Team, { id: teamId, ownerId });
    if (!team) throw new NotFoundError('Team not found');
    await this.em.removeAndFlush(team);
  }

  // ─── Add Members ───────────────────────────────────────────────────

  async addMembers(
    teamId: string,
    ownerId: string,
    logins: string[],
  ): Promise<{ added: number }> {
    const team = await this.em.findOne(
      Team,
      { id: teamId, ownerId },
      { populate: ['members'] },
    );
    if (!team) throw new NotFoundError('Team not found');

    const existing = new Set(team.members.getItems().map((m) => m.youtrackLogin));
    let added = 0;

    for (const login of logins) {
      if (existing.has(login)) continue;
      const member = new TeamMember();
      member.team = team;
      member.youtrackLogin = login;
      member.createdAt = new Date();
      this.em.persist(member);
      added++;
    }

    await this.em.flush();
    return { added };
  }

  // ─── Remove Member ─────────────────────────────────────────────────

  async removeMember(
    teamId: string,
    ownerId: string,
    login: string,
  ): Promise<void> {
    const team = await this.em.findOne(Team, { id: teamId, ownerId });
    if (!team) throw new NotFoundError('Team not found');

    const member = await this.em.findOne(TeamMember, {
      team,
      youtrackLogin: login,
    });
    if (!member) throw new NotFoundError('Team member not found');

    await this.em.removeAndFlush(member);
  }

  // ─── Private Helpers ───────────────────────────────────────────────

  private async getUserSubscriptionIds(ownerId: string): Promise<string[]> {
    const subs = await this.em.find(Subscription, { ownerId });
    return subs.map((s) => s.id);
  }

  private async getMemberDetail(
    login: string,
    subIds: string[],
  ): Promise<TeamMemberDetail> {
    // Find employee info
    const emp = await this.em.findOne(SubscriptionEmployee, {
      subscription: { $in: subIds },
      youtrackLogin: login,
    }, { populate: ['subscription'] });

    // All reports for this login
    const reports = await this.em.find(
      MetricReport,
      {
        subscription: { $in: subIds },
        youtrackLogin: login,
      },
      {
        populate: ['subscription'],
        orderBy: { periodStart: 'DESC' },
        limit: 4,
      },
    );

    const lastScore = reports.length > 0 ? getEffectiveScore(reports[0]) : null;
    const lastUtilization = reports.length > 0 ? (reports[0].utilization ?? null) : null;
    const scores = reports.map((r) => getEffectiveScore(r));
    const scoreTrend = calcTrend(scores);

    // Projects
    const projectNames = new Set<string>();
    for (const r of reports) {
      projectNames.add(r.subscription.projectName);
    }

    return {
      youtrackLogin: login,
      displayName: emp?.displayName ?? login,
      lastScore,
      scoreTrend,
      lastUtilization,
      projects: [...projectNames],
    };
  }

  private async getTeamAggregates(
    logins: string[],
    subIds: string[],
  ): Promise<{ avgScore: number | null; scoreTrend: ScoreTrend }> {
    if (logins.length === 0 || subIds.length === 0) {
      return { avgScore: null, scoreTrend: null };
    }

    // Get latest period
    const latestReport = await this.em.findOne(
      MetricReport,
      {
        subscription: { $in: subIds },
        youtrackLogin: { $in: logins },
      },
      { orderBy: { periodStart: 'DESC' } },
    );

    if (!latestReport) return { avgScore: null, scoreTrend: null };

    const lastPeriod = latestReport.periodStart;

    // Get all reports for latest period
    const currentReports = await this.em.find(MetricReport, {
      subscription: { $in: subIds },
      youtrackLogin: { $in: logins },
      periodStart: lastPeriod,
    });

    // Deduplicate by login (average across projects)
    const byLogin = new Map<string, MetricReport[]>();
    for (const r of currentReports) {
      if (!byLogin.has(r.youtrackLogin)) byLogin.set(r.youtrackLogin, []);
      byLogin.get(r.youtrackLogin)!.push(r);
    }

    const empScores: Array<number | null> = [];
    for (const reps of byLogin.values()) {
      empScores.push(avgNullable(reps.map((r) => getEffectiveScore(r))));
    }

    const avgScore = avgNullable(empScores);

    // Previous period
    const prevReport = await this.em.findOne(
      MetricReport,
      {
        subscription: { $in: subIds },
        youtrackLogin: { $in: logins },
        periodStart: { $lt: lastPeriod },
      },
      { orderBy: { periodStart: 'DESC' } },
    );

    if (!prevReport) return { avgScore, scoreTrend: null };

    const prevReports = await this.em.find(MetricReport, {
      subscription: { $in: subIds },
      youtrackLogin: { $in: logins },
      periodStart: prevReport.periodStart,
    });

    const prevByLogin = new Map<string, MetricReport[]>();
    for (const r of prevReports) {
      if (!prevByLogin.has(r.youtrackLogin)) prevByLogin.set(r.youtrackLogin, []);
      prevByLogin.get(r.youtrackLogin)!.push(r);
    }

    const prevEmpScores: Array<number | null> = [];
    for (const reps of prevByLogin.values()) {
      prevEmpScores.push(avgNullable(reps.map((r) => getEffectiveScore(r))));
    }
    const prevAvgScore = avgNullable(prevEmpScores);

    const scoreTrend = calcTrend([prevAvgScore, avgScore]);

    return { avgScore, scoreTrend };
  }

  private async getTeamWeeklyTrend(
    logins: string[],
    subIds: string[],
    weeksCount: number,
  ): Promise<TeamWeekTrend[]> {
    if (logins.length === 0 || subIds.length === 0) return [];

    const reports = await this.em.find(
      MetricReport,
      {
        subscription: { $in: subIds },
        youtrackLogin: { $in: logins },
      },
      { orderBy: { periodStart: 'ASC' } },
    );

    // Group by period
    const byPeriod = new Map<string, MetricReport[]>();
    for (const r of reports) {
      const key = formatYTDate(r.periodStart);
      if (!byPeriod.has(key)) byPeriod.set(key, []);
      byPeriod.get(key)!.push(r);
    }

    const sortedPeriods = [...byPeriod.keys()].sort().slice(-weeksCount);

    return sortedPeriods.map((periodKey) => {
      const periodReports = byPeriod.get(periodKey)!;
      // Deduplicate by login
      const empReports = new Map<string, MetricReport[]>();
      for (const r of periodReports) {
        if (!empReports.has(r.youtrackLogin)) empReports.set(r.youtrackLogin, []);
        empReports.get(r.youtrackLogin)!.push(r);
      }
      const empScores: Array<number | null> = [];
      for (const reps of empReports.values()) {
        empScores.push(avgNullable(reps.map((r) => getEffectiveScore(r))));
      }

      return {
        periodStart: periodKey,
        avgScore: avgNullable(empScores),
      };
    });
  }
}
