/**
 * Сервис ачивок: список, фильтрация, последние.
 */

import { EntityManager } from '@mikro-orm/postgresql';
import { Subscription } from '../../entities/subscription.entity';
import { SubscriptionEmployee } from '../../entities/subscription-employee.entity';
import { Achievement } from '../../entities/achievement.entity';
import { formatYTDate } from '../../common/utils/week-utils';
import {
  ACHIEVEMENT_DEFINITIONS,
  AchievementDTO,
  AchievementTypeInfo,
} from './achievements.types';

// Map type → definition for fast lookup
const DEFINITIONS_MAP = new Map(
  ACHIEVEMENT_DEFINITIONS.map((d) => [d.type, d]),
);

function toDTO(
  achievement: Achievement,
  displayName: string,
  projectName: string,
): AchievementDTO {
  const def = DEFINITIONS_MAP.get(achievement.type);
  return {
    id: achievement.id,
    youtrackLogin: achievement.youtrackLogin,
    displayName,
    subscriptionId: achievement.subscription?.id ?? '',
    projectName,
    type: achievement.type,
    title: achievement.title,
    description: achievement.description ?? '',
    periodStart: formatYTDate(achievement.periodStart),
    rarity: achievement.rarity,
    icon: def?.icon ?? 'Award',
    metadata: achievement.metadata,
    createdAt: achievement.createdAt.toISOString(),
  };
}

export class AchievementsService {
  constructor(private em: EntityManager) {}

  async list(params: {
    userId: string;
    youtrackLogin?: string;
    type?: string;
    subscriptionId?: string;
    rarity?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: AchievementDTO[]; total: number }> {
    const subscriptions = await this.getUserSubscriptions(params.userId, params.subscriptionId);
    if (subscriptions.length === 0) return { data: [], total: 0 };

    const subIds = subscriptions.map((s) => s.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      subscription: { $in: subIds },
    };
    if (params.youtrackLogin) where.youtrackLogin = params.youtrackLogin;
    if (params.type) where.type = params.type;
    if (params.rarity) where.rarity = params.rarity;

    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const offset = (page - 1) * limit;

    const [achievements, total] = await this.em.findAndCount(
      Achievement,
      where,
      {
        populate: ['subscription'],
        orderBy: { createdAt: 'DESC' },
        limit,
        offset,
      },
    );

    // Build employee display name map
    const employeeMap = await this.buildEmployeeMap(subscriptions);

    const data = achievements.map((a) => {
      const displayName = employeeMap.get(a.youtrackLogin) ?? a.youtrackLogin;
      const projectName = a.subscription?.projectName ?? '';
      return toDTO(a, displayName, projectName);
    });

    return { data, total };
  }

  async getByEmployee(youtrackLogin: string, userId: string): Promise<AchievementDTO[]> {
    const subscriptions = await this.getUserSubscriptions(userId);
    if (subscriptions.length === 0) return [];

    const subIds = subscriptions.map((s) => s.id);

    const achievements = await this.em.find(
      Achievement,
      {
        subscription: { $in: subIds },
        youtrackLogin,
      },
      {
        populate: ['subscription'],
        orderBy: { createdAt: 'DESC' },
      },
    );

    const employeeMap = await this.buildEmployeeMap(subscriptions);

    return achievements.map((a) => {
      const displayName = employeeMap.get(a.youtrackLogin) ?? a.youtrackLogin;
      const projectName = a.subscription?.projectName ?? '';
      return toDTO(a, displayName, projectName);
    });
  }

  async getRecent(userId: string, limit = 5): Promise<AchievementDTO[]> {
    const subscriptions = await this.getUserSubscriptions(userId);
    if (subscriptions.length === 0) return [];

    const subIds = subscriptions.map((s) => s.id);

    const achievements = await this.em.find(
      Achievement,
      { subscription: { $in: subIds } },
      {
        populate: ['subscription'],
        orderBy: { createdAt: 'DESC' },
        limit,
      },
    );

    const employeeMap = await this.buildEmployeeMap(subscriptions);

    return achievements.map((a) => {
      const displayName = employeeMap.get(a.youtrackLogin) ?? a.youtrackLogin;
      const projectName = a.subscription?.projectName ?? '';
      return toDTO(a, displayName, projectName);
    });
  }

  getTypes(): AchievementTypeInfo[] {
    return ACHIEVEMENT_DEFINITIONS.map((d) => ({
      type: d.type,
      title: d.title,
      icon: d.icon,
    }));
  }

  private async getUserSubscriptions(
    userId: string,
    subscriptionId?: string,
  ): Promise<Subscription[]> {
    if (subscriptionId) {
      const sub = await this.em.findOne(Subscription, {
        id: subscriptionId,
        ownerId: userId,
      });
      return sub ? [sub] : [];
    }
    return this.em.find(Subscription, { ownerId: userId });
  }

  private async buildEmployeeMap(
    subscriptions: Subscription[],
  ): Promise<Map<string, string>> {
    const employees = await this.em.find(SubscriptionEmployee, {
      subscription: { $in: subscriptions.map((s) => s.id) },
    });
    const map = new Map<string, string>();
    for (const e of employees) {
      if (!map.has(e.youtrackLogin)) {
        map.set(e.youtrackLogin, e.displayName);
      }
    }
    return map;
  }
}
