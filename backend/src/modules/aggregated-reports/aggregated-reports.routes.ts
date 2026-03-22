/**
 * API-эндпоинты для агрегированных отчётов.
 * Stub — полная реализация в Task 6.
 */

import { FastifyInstance } from 'fastify';
import { LlmService } from '../llm/llm.service';

let llmServiceRef: LlmService | null = null;

export function setAggregatedReportsLlmRef(service: LlmService): void {
  llmServiceRef = service;
}

export function getLlmServiceRef(): LlmService | null {
  return llmServiceRef;
}

export async function aggregatedReportsRoutes(_app: FastifyInstance): Promise<void> {
  // TODO: implement in Task 6
}
