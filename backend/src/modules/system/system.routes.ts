/**
 * API-эндпоинты для информации о системе.
 */

import { FastifyInstance } from 'fastify';
import { getSystemStatus } from './system.service';

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/system/status
  app.get('/system/status', async (request) => {
    return getSystemStatus(request.orm);
  });
}
