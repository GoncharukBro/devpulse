/**
 * API-эндпоинты ачивок.
 */

import { FastifyInstance } from 'fastify';
import { AchievementsService } from './achievements.service';

interface AchievementsListQuery {
  youtrackLogin?: string;
  type?: string;
  subscriptionId?: string;
  rarity?: string;
  newOnly?: string;
  page?: string;
  limit?: string;
}

interface RecentQuery {
  limit?: string;
}

export async function achievementsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/achievements
  app.get<{ Querystring: AchievementsListQuery }>(
    '/achievements',
    async (request) => {
      const em = request.orm.em.fork();
      const service = new AchievementsService(em);
      return service.list({
        userId: request.user.id,
        youtrackLogin: request.query.youtrackLogin,
        type: request.query.type,
        subscriptionId: request.query.subscriptionId,
        rarity: request.query.rarity,
        newOnly: request.query.newOnly === 'true',
        page: request.query.page ? parseInt(request.query.page, 10) : undefined,
        limit: request.query.limit ? parseInt(request.query.limit, 10) : undefined,
      });
    },
  );

  // GET /api/achievements/catalog
  app.get('/achievements/catalog', async (request) => {
    const em = request.orm.em.fork();
    const service = new AchievementsService(em);
    return service.getCatalog(request.user.id);
  });

  // GET /api/achievements/recent
  app.get<{ Querystring: RecentQuery }>(
    '/achievements/recent',
    async (request) => {
      const em = request.orm.em.fork();
      const service = new AchievementsService(em);
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 5;
      return service.getRecent(request.user.id, limit);
    },
  );

  // GET /api/achievements/types
  app.get('/achievements/types', async (request) => {
    const em = request.orm.em.fork();
    const service = new AchievementsService(em);
    return service.getTypes();
  });

  // GET /api/achievements/employee/:login
  app.get<{ Params: { login: string } }>(
    '/achievements/employee/:login',
    async (request) => {
      const em = request.orm.em.fork();
      const service = new AchievementsService(em);
      return service.getByEmployee(request.params.login, request.user.id);
    },
  );

  // GET /api/achievements/portfolio/:login
  app.get<{ Params: { login: string } }>(
    '/achievements/portfolio/:login',
    async (request) => {
      const em = request.orm.em.fork();
      const service = new AchievementsService(em);
      return service.getPortfolio(request.params.login, request.user.id);
    },
  );
}
