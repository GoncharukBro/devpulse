/**
 * API-эндпоинты для управления настройками.
 */

import { FastifyInstance } from 'fastify';
import { SettingsService } from './settings.service';
import { LlmService } from '../llm/llm.service';

let llmServiceRef: LlmService | null = null;

export function setLlmServiceRef(service: LlmService): void {
  llmServiceRef = service;
}

interface UpdateLlmBody {
  model?: string;
  temperature?: number;
  rateLimit?: number;
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/settings/llm
  app.get('/settings/llm', async (_request, reply) => {
    if (!llmServiceRef) {
      reply.status(503).send({ message: 'LLM service not initialized' });
      return;
    }

    const service = new SettingsService(llmServiceRef);
    const settings = service.getLlmSettings();

    if (!settings) {
      reply.status(503).send({ message: 'LLM not configured' });
      return;
    }

    return settings;
  });

  // PUT /api/settings/llm
  app.put<{ Body: UpdateLlmBody }>('/settings/llm', async (request, reply) => {
    if (!llmServiceRef) {
      reply.status(503).send({ message: 'LLM service not initialized' });
      return;
    }

    const { model, temperature, rateLimit } = request.body;

    const updates: Record<string, unknown> = {};
    if (model !== undefined) updates.model = model;
    if (temperature !== undefined) updates.temperature = temperature;
    if (rateLimit !== undefined) updates.rateLimit = rateLimit;

    const service = new SettingsService(llmServiceRef);
    service.updateLlmSettings(updates);

    return service.getLlmSettings();
  });
}
