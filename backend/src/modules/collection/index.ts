/**
 * Модуль сбора метрик — экспорт компонентов и управление синглтонами.
 */

import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { CollectionWorker } from './collection.worker';
import { CronManager } from './cron.manager';
import { setCollectionWorker, setCronManager } from './collection.singletons';

export { collectionRoutes } from './collection.routes';
export { CollectionWorker } from './collection.worker';
export { CronManager } from './cron.manager';
export { CollectionService } from './collection.service';
export { getCollectionWorker, getCronManager } from './collection.singletons';
import { Logger } from '../../common/types/logger';

export function initCollectionModule(
  orm: MikroORM<PostgreSqlDriver>,
  log: Logger,
): { worker: CollectionWorker; cron: CronManager } {
  const worker = new CollectionWorker(orm, log);
  const cron = new CronManager(orm, log);
  setCollectionWorker(worker);
  setCronManager(cron);
  return { worker, cron };
}
