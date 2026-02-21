/**
 * Генератор ачивок на основе метрик.
 * Вызывается после сохранения MetricReport.
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

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

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
    const history = await em.find(
      MetricReport,
      {
        subscription,
        youtrackLogin: report.youtrackLogin,
        periodStart: { $lt: report.periodStart },
      },
      {
        orderBy: { periodStart: 'DESC' },
        limit: 5,
      },
    );

    const generated: Achievement[] = [];

    for (const definition of ACHIEVEMENT_DEFINITIONS) {
      try {
        const checkResult = definition.check(report, history);
        if (!checkResult) continue;

        // Check if achievement already exists for this employee/type/period/subscription
        const existing = await em.findOne(Achievement, {
          youtrackLogin: report.youtrackLogin,
          type: definition.type,
          periodStart: report.periodStart,
          subscription,
        });

        if (existing) {
          // Upgrade rarity if new one is higher
          if (isHigherRarity(checkResult.rarity, existing.rarity as AchievementRarity)) {
            existing.rarity = checkResult.rarity;
            existing.description = checkResult.description;
            existing.metadata = {
              ...existing.metadata,
              metricValue: checkResult.metricValue,
              upgradedAt: new Date().toISOString(),
            };
            this.log.info(
              `Achievement upgraded: ${definition.type} for ${report.youtrackLogin} → ${checkResult.rarity}`,
            );
            generated.push(existing);
          }
          continue;
        }

        // Create new achievement
        const achievement = new Achievement();
        achievement.youtrackLogin = report.youtrackLogin;
        achievement.subscription = subscription;
        achievement.type = definition.type;
        achievement.title = definition.title;
        achievement.description = checkResult.description;
        achievement.periodStart = report.periodStart;
        achievement.rarity = checkResult.rarity;
        achievement.metadata = {
          metricValue: checkResult.metricValue,
          reportId: report.id,
        };
        achievement.createdAt = new Date();

        em.persist(achievement);
        generated.push(achievement);

        this.log.info(
          `Achievement created: ${definition.type} (${checkResult.rarity}) for ${report.youtrackLogin}`,
        );
      } catch (err) {
        this.log.error(
          `Achievement check error for ${definition.type}: ${(err as Error).message}`,
        );
      }
    }

    if (generated.length > 0) {
      await em.flush();
    }

    return generated;
  }
}
