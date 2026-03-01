/**
 * Генератор ачивок на основе метрик.
 * Вызывается после сохранения MetricReport.
 *
 * Новая логика:
 * - Ачивка выдаётся один раз за уровень (max 4 на тип: common/rare/epic/legendary)
 * - Серии (streaks) — сколько недель подряд условие выполнено
 * - isNew = true только для первого получения или повышения уровня
 */

import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { MetricReport } from '../../entities/metric-report.entity';
import { Achievement } from '../../entities/achievement.entity';
import {
  ACHIEVEMENT_DEFINITIONS,
  AchievementRarity,
  isHigherRarity,
} from './achievements.types';
import { Logger } from '../../common/types/logger';

const RARITY_ORDER: Record<AchievementRarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

export class AchievementsGenerator {
  constructor(
    private orm: MikroORM<PostgreSqlDriver>,
    private log: Logger,
  ) {}

  /**
   * Generate achievements for a single MetricReport.
   * Called after metrics collection or LLM score update.
   */
  async generateForReport(reportId: string): Promise<Achievement[]> {
    const em = this.orm.em.fork();

    const report = await em.findOne(MetricReport, { id: reportId }, {
      populate: ['subscription'],
    });

    if (!report) {
      this.log.warn(`AchievementsGenerator: report ${reportId} not found`);
      return [];
    }

    const subscription = report.subscription;

    // Fetch history: previous reports for the same employee + subscription, ordered DESC by periodStart
    // Без limit — нужна полная история для корректного расчёта streak
    const history = await em.find(
      MetricReport,
      {
        subscription,
        youtrackLogin: report.youtrackLogin,
        periodStart: { $lt: report.periodStart },
      },
      {
        orderBy: { periodStart: 'DESC' },
      },
    );

    const generated: Achievement[] = [];

    for (const definition of ACHIEVEMENT_DEFINITIONS) {
      try {
        const checkResult = definition.check(report, history);

        // Find all existing achievements of this type for this employee+subscription
        const existing = await em.find(Achievement, {
          youtrackLogin: report.youtrackLogin,
          type: definition.type,
          subscription,
        }, { orderBy: { createdAt: 'DESC' } });

        // Find the best existing rarity
        const bestExisting = this.getBestRarityAchievement(existing);

        if (checkResult) {
          // Condition met — пересчитываем streak с нуля по истории
          const achievedRarity = checkResult.rarity;
          const streak = this.calculateStreak(definition, history);

          if (!bestExisting) {
            // First time earning this achievement type — create new
            const achievement = new Achievement();
            achievement.youtrackLogin = report.youtrackLogin;
            achievement.subscription = subscription;
            achievement.type = definition.type;
            achievement.title = definition.title;
            achievement.description = checkResult.description;
            achievement.periodStart = report.periodStart;
            achievement.rarity = achievedRarity;
            achievement.metadata = {
              metricValue: checkResult.metricValue,
              reportId: report.id,
            };
            achievement.currentStreak = streak;
            achievement.bestStreak = streak;
            achievement.lastConfirmedAt = new Date();
            achievement.isNew = true;
            achievement.createdAt = new Date();

            em.persist(achievement);
            generated.push(achievement);

            this.log.info(
              `Achievement created: ${definition.type} (${achievedRarity}) for ${report.youtrackLogin} streak=${streak}`,
            );
          } else if (isHigherRarity(achievedRarity as AchievementRarity, bestExisting.rarity as AchievementRarity)) {
            // Level up — create new achievement at higher rarity
            const achievement = new Achievement();
            achievement.youtrackLogin = report.youtrackLogin;
            achievement.subscription = subscription;
            achievement.type = definition.type;
            achievement.title = definition.title;
            achievement.description = checkResult.description;
            achievement.periodStart = report.periodStart;
            achievement.rarity = achievedRarity;
            achievement.metadata = {
              metricValue: checkResult.metricValue,
              reportId: report.id,
            };
            achievement.currentStreak = streak;
            achievement.bestStreak = Math.max(streak, bestExisting.bestStreak);
            achievement.lastConfirmedAt = new Date();
            achievement.isNew = true;
            achievement.createdAt = new Date();

            em.persist(achievement);
            generated.push(achievement);

            // Update the old best's streak to 0 (streak continues on new one)
            bestExisting.currentStreak = 0;

            this.log.info(
              `Achievement upgraded: ${definition.type} for ${report.youtrackLogin} → ${achievedRarity} (streak ${streak})`,
            );
          } else {
            // Same or lower rarity — update streak silently (no new achievement)
            bestExisting.currentStreak = streak;
            bestExisting.bestStreak = Math.max(bestExisting.bestStreak, streak);
            bestExisting.lastConfirmedAt = new Date();
            // Update best value if higher
            const existingValue = (bestExisting.metadata as Record<string, unknown>).metricValue;
            if (typeof existingValue === 'number' && checkResult.metricValue > existingValue) {
              bestExisting.metadata = {
                ...bestExisting.metadata,
                metricValue: checkResult.metricValue,
              };
              bestExisting.description = checkResult.description;
            }
            // Do NOT set isNew = true — silent update

            this.log.info(
              `Achievement streak updated: ${definition.type} for ${report.youtrackLogin} streak=${streak}`,
            );
          }
        } else {
          // Condition NOT met — reset streak
          if (bestExisting && bestExisting.currentStreak > 0) {
            bestExisting.currentStreak = 0;
            bestExisting.lastConfirmedAt = new Date();

            this.log.info(
              `Achievement streak reset: ${definition.type} for ${report.youtrackLogin}`,
            );
          }
        }
      } catch (err) {
        this.log.error(
          `Achievement check error for ${definition.type}: ${(err as Error).message}`,
        );
      }
    }

    await em.flush();

    return generated;
  }

  /**
   * Пересчитать streak с нуля: 1 (текущая неделя) + количество
   * последовательных предыдущих недель где условие было выполнено.
   * Идемпотентно — при пересборке даёт один и тот же результат.
   */
  private calculateStreak(
    definition: typeof ACHIEVEMENT_DEFINITIONS[number],
    history: MetricReport[],
  ): number {
    let streak = 1; // текущая неделя (условие уже проверено)
    for (const prevReport of history) {
      const prevResult = definition.check(prevReport, []);
      if (prevResult) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  /**
   * Find the achievement with the highest rarity from a list.
   */
  private getBestRarityAchievement(achievements: Achievement[]): Achievement | null {
    if (achievements.length === 0) return null;

    let best = achievements[0];
    for (const a of achievements) {
      if ((RARITY_ORDER[a.rarity as AchievementRarity] ?? 0) > (RARITY_ORDER[best.rarity as AchievementRarity] ?? 0)) {
        best = a;
      }
    }
    return best;
  }
}
