/**
 * API-эндпоинты для управления сбором метрик.
 */

import { FastifyInstance } from 'fastify';
import { CollectionService } from './collection.service';
import { getCronManager } from './collection.singletons';
import { ValidationError } from '../../common/errors';

function parseDate(value: string, fieldName: string): Date {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new ValidationError(`Invalid date format for ${fieldName}: ${value}`);
  }
  return date;
}

function clampInt(value: string | undefined, defaultVal: number, min: number, max: number): number {
  if (!value) return defaultVal;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultVal;
  return Math.max(min, Math.min(max, parsed));
}

interface TriggerBody {
  subscriptionId?: string;
  periodStart?: string;
  periodEnd?: string;
}

interface TriggerAllBody {
  periodStart?: string;
  periodEnd?: string;
}

interface BackfillBody {
  subscriptionId: string;
  from: string;
  to: string;
}

interface LogsQuery {
  subscriptionId?: string;
  page?: string;
  limit?: string;
}

export async function collectionRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/collection/trigger
  app.post<{ Body: TriggerBody }>('/collection/trigger', async (request, reply) => {
    const em = request.orm.em.fork();
    const service = new CollectionService(em);
    const { subscriptionId, periodStart, periodEnd } = request.body ?? {};

    if (!subscriptionId) {
      reply.status(400).send({ message: 'subscriptionId is required' });
      return;
    }

    const start = periodStart ? parseDate(periodStart, 'periodStart') : undefined;
    const end = periodEnd ? parseDate(periodEnd, 'periodEnd') : undefined;

    const logId = await service.triggerCollection(
      subscriptionId,
      request.user.id,
      start,
      end,
      'manual',
    );

    reply.status(202).send({
      message: 'Collection started',
      collectionLogIds: [logId],
    });
  });

  // POST /api/collection/trigger-all
  app.post<{ Body: TriggerAllBody }>('/collection/trigger-all', async (request, reply) => {
    const em = request.orm.em.fork();
    const service = new CollectionService(em);
    const { periodStart, periodEnd } = request.body ?? {};

    const start = periodStart ? parseDate(periodStart, 'periodStart') : undefined;
    const end = periodEnd ? parseDate(periodEnd, 'periodEnd') : undefined;

    const logIds = await service.triggerAllCollections(
      request.user.id,
      start,
      end,
    );

    reply.status(202).send({
      message: 'Collection started for all subscriptions',
      collectionLogIds: logIds,
    });
  });

  // POST /api/collection/backfill
  app.post<{ Body: BackfillBody }>('/collection/backfill', async (request, reply) => {
    const em = request.orm.em.fork();
    const service = new CollectionService(em);
    const { subscriptionId, from, to } = request.body ?? {};

    if (!subscriptionId || !from || !to) {
      reply.status(400).send({ message: 'subscriptionId, from, and to are required' });
      return;
    }

    const fromDate = parseDate(from, 'from');
    const toDate = parseDate(to, 'to');

    if (fromDate >= toDate) {
      throw new ValidationError('"from" must be before "to"');
    }

    const result = await service.backfill(
      subscriptionId,
      request.user.id,
      fromDate,
      toDate,
    );

    reply.status(202).send({
      message: 'Backfill started',
      weeksToProcess: result.weeksToProcess,
      collectionLogIds: result.collectionLogIds,
    });
  });

  // GET /api/collection/state
  app.get('/collection/state', async (request) => {
    const em = request.orm.em.fork();
    const service = new CollectionService(em);
    return service.getCollectionState();
  });

  // GET /api/collection/logs
  app.get<{ Querystring: LogsQuery }>('/collection/logs', async (request) => {
    const em = request.orm.em.fork();
    const service = new CollectionService(em);
    const { subscriptionId, page, limit } = request.query;

    return service.getCollectionLogs(
      request.user.id,
      subscriptionId,
      clampInt(page, 1, 1, 1000),
      clampInt(limit, 20, 1, 100),
    );
  });

  // POST /api/collection/cron/pause
  app.post('/collection/cron/pause', async (_request, reply) => {
    const cronManager = getCronManager();
    if (!cronManager) {
      reply.status(503).send({ message: 'Cron manager not initialized' });
      return;
    }
    cronManager.pause();
    reply.send({ message: 'Cron paused' });
  });

  // POST /api/collection/cron/resume
  app.post('/collection/cron/resume', async (_request, reply) => {
    const cronManager = getCronManager();
    if (!cronManager) {
      reply.status(503).send({ message: 'Cron manager not initialized' });
      return;
    }
    cronManager.resume();
    reply.send({ message: 'Cron resumed' });
  });

  // GET /api/collection/cron/state
  app.get('/collection/cron/state', async () => {
    const cronManager = getCronManager();
    if (!cronManager) {
      return { enabled: false, schedule: '', nextRun: null };
    }
    return {
      enabled: cronManager.isEnabled(),
      schedule: cronManager.getSchedule(),
      nextRun: cronManager.getNextRun()?.toISOString() ?? null,
    };
  });
}
