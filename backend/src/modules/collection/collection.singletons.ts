/**
 * Синглтон-хранилище для экземпляров воркера и cron-менеджера.
 * Вынесено в отдельный файл, чтобы избежать циклических зависимостей.
 */

import type { CollectionWorker } from './collection.worker';
import type { CronManager } from './cron.manager';

let workerInstance: CollectionWorker | undefined;
let cronInstance: CronManager | undefined;

export function setCollectionWorker(worker: CollectionWorker): void {
  workerInstance = worker;
}

export function getCollectionWorker(): CollectionWorker | undefined {
  return workerInstance;
}

export function setCronManager(cron: CronManager): void {
  cronInstance = cron;
}

export function getCronManager(): CronManager | undefined {
  return cronInstance;
}
