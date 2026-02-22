/**
 * API-эндпоинты для управления сбором метрик.
 */

import { FastifyInstance } from 'fastify';
import { CollectionService } from './collection.service';
import { getCronManager } from './index';

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

    const start = periodStart ? new Date(periodStart) : undefined;
    const end = periodEnd ? new Date(periodEnd) : undefined;

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

    const start = periodStart ? new Date(periodStart) : undefined;
    const end = periodEnd ? new Date(periodEnd) : undefined;

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

    const result = await service.backfill(
      subscriptionId,
      request.user.id,
      new Date(from),
      new Date(to),
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
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
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
