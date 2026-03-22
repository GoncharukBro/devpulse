/**
 * API-эндпоинты для агрегированных отчётов.
 */

import { FastifyInstance } from 'fastify';
import { LlmService } from '../llm/llm.service';
import { AggregatedReportsService } from './aggregated-reports.service';
import { PreviewRequest, ListQuery } from './aggregated-reports.types';

let llmServiceRef: LlmService | null = null;

export function setAggregatedReportsLlmRef(service: LlmService): void {
  llmServiceRef = service;
}

export function getLlmServiceRef(): LlmService | null {
  return llmServiceRef;
}

export async function aggregatedReportsRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/aggregated-reports/preview
  app.post<{ Body: PreviewRequest }>(
    '/aggregated-reports/preview',
    async (request, reply) => {
      const { type, targetId, dateFrom, dateTo } = request.body;

      if (!type || !targetId || !dateFrom || !dateTo) {
        reply.status(400).send({ message: 'type, targetId, dateFrom, dateTo are required' });
        return;
      }

      if (!['employee', 'project', 'team'].includes(type)) {
        reply.status(400).send({ message: 'type must be employee, project, or team' });
        return;
      }

      const em = request.orm.em.fork();
      const service = new AggregatedReportsService(em, llmServiceRef, request.orm);
      return service.preview({ type, targetId, dateFrom, dateTo, userId: request.user.id });
    },
  );

  // POST /api/aggregated-reports
  app.post<{ Body: PreviewRequest }>(
    '/aggregated-reports',
    async (request, reply) => {
      const { type, targetId, dateFrom, dateTo } = request.body;

      if (!type || !targetId || !dateFrom || !dateTo) {
        reply.status(400).send({ message: 'type, targetId, dateFrom, dateTo are required' });
        return;
      }

      if (!['employee', 'project', 'team'].includes(type)) {
        reply.status(400).send({ message: 'type must be employee, project, or team' });
        return;
      }

      const em = request.orm.em.fork();
      const service = new AggregatedReportsService(em, llmServiceRef, request.orm);
      return service.create({ type, targetId, dateFrom, dateTo, userId: request.user.id });
    },
  );

  // GET /api/aggregated-reports
  app.get<{ Querystring: ListQuery }>(
    '/aggregated-reports',
    async (request) => {
      const { type, page, limit } = request.query;

      const em = request.orm.em.fork();
      const service = new AggregatedReportsService(em, llmServiceRef, request.orm);
      return service.list({
        type,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        userId: request.user.id,
      });
    },
  );

  // GET /api/aggregated-reports/:id
  app.get<{ Params: { id: string } }>(
    '/aggregated-reports/:id',
    async (request, reply) => {
      const em = request.orm.em.fork();
      const service = new AggregatedReportsService(em, llmServiceRef, request.orm);
      const result = await service.getById(request.params.id, request.user.id);
      if (!result) {
        reply.status(404).send({ message: 'Report not found' });
        return;
      }
      return result;
    },
  );

  // DELETE /api/aggregated-reports/:id
  app.delete<{ Params: { id: string } }>(
    '/aggregated-reports/:id',
    async (request, reply) => {
      const em = request.orm.em.fork();
      const service = new AggregatedReportsService(em, llmServiceRef, request.orm);
      await service.delete(request.params.id, request.user.id);
      reply.status(204).send();
    },
  );
}
