/**
 * Управление cron-планировщиком для еженедельного автосбора метрик.
 */

import cron from 'node-cron';
import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { CollectionService } from './collection.service';
import { collectionState } from './collection.state';
import { getWeekRange } from '../../common/utils/week-utils';
import { config } from '../../config';

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export class CronManager {
  private task: cron.ScheduledTask | null = null;
  private schedule: string;
  private enabled: boolean;

  constructor(
    private orm: MikroORM<PostgreSqlDriver>,
    private log: Logger,
  ) {
    this.schedule = config.cron.schedule;
    this.enabled = config.cron.enabled;
  }

  start(): void {
    if (!this.enabled) {
      this.log.info('Cron is disabled by config');
      collectionState.setCronEnabled(false);
      return;
    }

    if (!cron.validate(this.schedule)) {
      this.log.error(`Invalid cron schedule: ${this.schedule}`);
      return;
    }

    this.task = cron.schedule(this.schedule, () => {
      this.onTick().catch((err) => {
        this.log.error(`Cron tick error: ${(err as Error).message}`);
      });
    });

    collectionState.setCronEnabled(true);
    this.log.info(`Cron started with schedule: ${this.schedule}`);
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
    collectionState.setCronEnabled(false);
    this.log.info('Cron stopped');
  }

  pause(): void {
    if (this.task) {
      this.task.stop();
    }
    collectionState.setCronEnabled(false);
    this.log.info('Cron paused');
  }

  resume(): void {
    if (this.task) {
      this.task.start();
      collectionState.setCronEnabled(true);
      this.log.info('Cron resumed');
    } else {
      // Если task не был создан, запускаем заново
      this.enabled = true;
      this.start();
    }
  }

  isEnabled(): boolean {
    return collectionState.getState().cronEnabled;
  }

  getSchedule(): string {
    return this.schedule;
  }

  getNextRun(): Date | null {
    if (!this.isEnabled()) return null;

    // Парсим cron schedule для определения следующего запуска
    // Для простоты: следующий понедельник 00:00
    const now = new Date();
    const next = new Date(now);
    const dayOfWeek = next.getDay(); // 0=Sun
    const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 7 : 8 - dayOfWeek;
    next.setDate(next.getDate() + daysUntilMonday);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private async onTick(): Promise<void> {
    this.log.info('Cron triggered: starting scheduled collection');

    // Собираем за прошлую неделю
    const lastWeekDate = new Date();
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    const { start, end } = getWeekRange(lastWeekDate);

    const em = this.orm.em.fork();
    const service = new CollectionService(em);

    await service.triggerScheduledCollection(start, end);
  }
}
