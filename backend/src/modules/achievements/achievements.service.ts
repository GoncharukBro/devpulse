/**
 * Сервис ачивок: список, фильтрация, последние.
 */

import { EntityManager } from '@mikro-orm/postgresql';
import { Subscription } from '../../entities/subscription.entity';
import { SubscriptionEmployee } from '../../entities/subscription-employee.entity';
import { Achievement } from '../../entities/achievement.entity';
import { formatYTDate, getMonday } from '../../common/utils/week-utils';
import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_THRESHOLDS,
  ACHIEVEMENT_CATEGORIES,
  AchievementDTO,
  AchievementTypeInfo,
  AchievementRarity,
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
    currentStreak: achievement.currentStreak,
    bestStreak: achievement.bestStreak,
    isNew: achievement.isNew,
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
    newOnly?: boolean;
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
    if (params.newOnly) where.isNew = true;

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

  async getCatalog(userId: string) {
    const subscriptions = await this.getUserSubscriptions(userId);
    if (subscriptions.length === 0) {
      return {
        stats: { totalTypes: ACHIEVEMENT_DEFINITIONS.length, unlockedTypes: 0, totalEarned: 0, legendaryCount: 0, thisWeekCount: 0 },
        categories: ACHIEVEMENT_CATEGORIES.map((cat) => ({
          ...cat,
          unlockedCount: 0,
          totalCount: cat.types.length,
          achievements: cat.types.map((type) => this.buildCatalogEntry(type, [])),
        })),
      };
    }

    const subIds = subscriptions.map((s) => s.id);

    const achievements = await this.em.find(
      Achievement,
      { subscription: { $in: subIds } },
      { populate: ['subscription'], orderBy: { createdAt: 'DESC' } },
    );

    const employeeMap = await this.buildEmployeeMap(subscriptions);

    // Group achievements by type
    const byType = new Map<string, Achievement[]>();
    for (const a of achievements) {
      const arr = byType.get(a.type) ?? [];
      arr.push(a);
      byType.set(a.type, arr);
    }

    // This week boundary
    const thisWeekStart = getMonday(new Date());

    let unlockedTypes = 0;
    let totalEarned = 0;
    let legendaryCount = 0;
    let thisWeekCount = 0;

    const RARITY_ORDER: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

    const categories = ACHIEVEMENT_CATEGORIES.map((cat) => {
      let catUnlocked = 0;

      const catAchievements = cat.types.map((type) => {
        const typeAchievements = byType.get(type) ?? [];
        const entry = this.buildCatalogEntry(type, typeAchievements, employeeMap, RARITY_ORDER);

        if (entry.unlocked) {
          catUnlocked++;
          unlockedTypes++;
        }
        totalEarned += entry.earnedCount;
        legendaryCount += typeAchievements.filter((a) => a.rarity === 'legendary').length;
        thisWeekCount += typeAchievements.filter((a) => a.createdAt >= thisWeekStart).length;

        return entry;
      });

      return {
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        unlockedCount: catUnlocked,
        totalCount: cat.types.length,
        achievements: catAchievements,
      };
    });

    return {
      stats: {
        totalTypes: ACHIEVEMENT_DEFINITIONS.length,
        unlockedTypes,
        totalEarned,
        legendaryCount,
        thisWeekCount,
      },
      categories,
    };
  }

  private buildCatalogEntry(
    type: string,
    typeAchievements: Achievement[],
    employeeMap?: Map<string, string>,
    rarityOrder?: Record<string, number>,
  ) {
    const def = DEFINITIONS_MAP.get(type);
    const thresholds = ACHIEVEMENT_THRESHOLDS[type];
    const order = rarityOrder ?? { common: 0, rare: 1, epic: 2, legendary: 3 };

    const unlocked = typeAchievements.length > 0;
    let bestRarity: AchievementRarity | null = null;
    let bestValue: number | null = null;

    for (const a of typeAchievements) {
      const r = a.rarity as AchievementRarity;
      if (bestRarity === null || order[r] > order[bestRarity]) {
        bestRarity = r;
      }
      const mv = (a.metadata as Record<string, unknown>).metricValue;
      if (typeof mv === 'number') {
        if (bestValue === null || mv > bestValue) bestValue = mv;
      }
    }

    // Calculate progress to next level
    const rarityList: AchievementRarity[] = ['common', 'rare', 'epic', 'legendary'];
    let nextLevel: { rarity: AchievementRarity | null; label: string; value: number; progress: number } | null = null;

    if (bestRarity === 'legendary') {
      nextLevel = { rarity: null, label: 'Максимальный уровень', value: 0, progress: 100 };
    } else if (thresholds) {
      const currentIndex = bestRarity ? rarityList.indexOf(bestRarity) : -1;
      const nextRarity = rarityList[currentIndex + 1];
      const nextThreshold = thresholds.levels[nextRarity];
      if (nextThreshold) {
        let progress = 0;
        if (bestValue !== null && nextThreshold.value > 0) {
          // For inverse metrics (cycle time) where lower is better
          if (type === 'quick_closer') {
            progress = Math.min(100, Math.round(((nextThreshold.value) / Math.max(bestValue, 1)) * 100));
          } else {
            progress = Math.min(100, Math.round((bestValue / nextThreshold.value) * 100));
          }
        }
        nextLevel = { rarity: nextRarity, label: nextThreshold.label, value: nextThreshold.value, progress };
      }
    }

    // Build earnedBy list
    const earnedBy = typeAchievements.map((a) => ({
      youtrackLogin: a.youtrackLogin,
      displayName: employeeMap?.get(a.youtrackLogin) ?? a.youtrackLogin,
      projectName: a.subscription?.projectName ?? '',
      rarity: a.rarity as AchievementRarity,
      description: a.description ?? '',
      periodStart: formatYTDate(a.periodStart),
      currentStreak: a.currentStreak,
      bestStreak: a.bestStreak,
    }));

    // Max streak among all earners
    let maxStreak = 0;
    for (const a of typeAchievements) {
      if (a.bestStreak > maxStreak) maxStreak = a.bestStreak;
    }

    return {
      type,
      title: def?.title ?? type,
      icon: def?.icon ?? 'Award',
      description: thresholds?.description ?? def?.description ?? '',
      thresholds: thresholds?.levels ?? {},
      unlocked,
      bestRarity,
      bestValue,
      nextLevel,
      earnedCount: typeAchievements.length,
      earnedBy,
      maxStreak,
    };
  }

  async getPortfolio(youtrackLogin: string, userId: string) {
    const subscriptions = await this.getUserSubscriptions(userId);
    if (subscriptions.length === 0) {
      return {
        achievements: [],
        stats: {
          totalTypes: ACHIEVEMENT_DEFINITIONS.length,
          unlockedTypes: 0,
          totalLevels: 0,
          maxPossibleLevels: ACHIEVEMENT_DEFINITIONS.length * 4,
          activeSeries: 0,
          longestStreak: 0,
        },
      };
    }

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

    // Group by type
    const byType = new Map<string, Achievement[]>();
    for (const a of achievements) {
      const arr = byType.get(a.type) ?? [];
      arr.push(a);
      byType.set(a.type, arr);
    }

    const RARITY_ORD: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
    const rarityList: AchievementRarity[] = ['common', 'rare', 'epic', 'legendary'];

    let totalLevels = 0;
    let activeSeries = 0;
    let longestStreak = 0;

    const portfolioItems = [];

    for (const def of ACHIEVEMENT_DEFINITIONS) {
      const typeAchievements = byType.get(def.type);
      if (!typeAchievements || typeAchievements.length === 0) continue;

      // Find best rarity
      let bestRarity: AchievementRarity = 'common';
      let bestValue: number | null = null;
      let currentStreak = 0;
      let bestStreak = 0;

      for (const a of typeAchievements) {
        const r = a.rarity as AchievementRarity;
        if ((RARITY_ORD[r] ?? 0) > (RARITY_ORD[bestRarity] ?? 0)) {
          bestRarity = r;
        }
        const mv = (a.metadata as Record<string, unknown>).metricValue;
        if (typeof mv === 'number' && (bestValue === null || mv > bestValue)) {
          bestValue = mv;
        }
        if (a.currentStreak > currentStreak) currentStreak = a.currentStreak;
        if (a.bestStreak > bestStreak) bestStreak = a.bestStreak;
      }

      totalLevels += typeAchievements.length;
      if (currentStreak > 0) activeSeries++;
      if (bestStreak > longestStreak) longestStreak = bestStreak;

      // Build levels array
      const levels = typeAchievements
        .sort((a, b) => (RARITY_ORD[a.rarity] ?? 0) - (RARITY_ORD[b.rarity] ?? 0))
        .map((a) => ({
          rarity: a.rarity as AchievementRarity,
          earnedAt: formatYTDate(a.periodStart),
          description: a.description ?? '',
        }));

      // Calculate next level
      const thresholds = ACHIEVEMENT_THRESHOLDS[def.type];
      let nextLevel: { rarity: AchievementRarity; label: string; progress: number } | null = null;

      if (bestRarity !== 'legendary' && thresholds) {
        const currentIndex = rarityList.indexOf(bestRarity);
        const nextRarity = rarityList[currentIndex + 1];
        const nextThreshold = thresholds.levels[nextRarity];
        if (nextThreshold) {
          let progress = 0;
          if (bestValue !== null && nextThreshold.value > 0) {
            if (def.type === 'quick_closer') {
              progress = Math.min(100, Math.round((nextThreshold.value / Math.max(bestValue, 1)) * 100));
            } else {
              progress = Math.min(100, Math.round((bestValue / nextThreshold.value) * 100));
            }
          }
          nextLevel = { rarity: nextRarity, label: nextThreshold.label, progress };
        }
      }

      portfolioItems.push({
        type: def.type,
        title: def.title,
        icon: def.icon,
        bestRarity,
        bestValue,
        currentStreak,
        bestStreak,
        levels,
        nextLevel,
      });
    }

    return {
      achievements: portfolioItems,
      stats: {
        totalTypes: ACHIEVEMENT_DEFINITIONS.length,
        unlockedTypes: byType.size,
        totalLevels,
        maxPossibleLevels: ACHIEVEMENT_DEFINITIONS.length * 4,
        activeSeries,
        longestStreak,
      },
    };
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
