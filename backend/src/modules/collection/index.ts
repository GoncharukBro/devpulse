/**
 * Модуль сбора метрик — экспорт компонентов и управление синглтонами.
 */

import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { CollectionWorker } from './collection.worker';
import { CronManager } from './cron.manager';

export { collectionRoutes } from './collection.routes';
export { CollectionWorker } from './collection.worker';
export { CronManager } from './cron.manager';
export { CollectionService } from './collection.service';

let workerInstance: CollectionWorker | undefined;
let cronInstance: CronManager | undefined;

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export function initCollectionModule(
  orm: MikroORM<PostgreSqlDriver>,
  log: Logger,
): { worker: CollectionWorker; cron: CronManager } {
  workerInstance = new CollectionWorker(orm, log);
  cronInstance = new CronManager(orm, log);
  return { worker: workerInstance, cron: cronInstance };
}

export function getCollectionWorker(): CollectionWorker | undefined {
  return workerInstance;
}

export function getCronManager(): CronManager | undefined {
  return cronInstance;
}
