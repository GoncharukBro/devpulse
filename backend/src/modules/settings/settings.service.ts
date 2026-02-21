/**
 * Сервис настроек — runtime-конфигурация LLM.
 */

import { LlmService } from '../llm/llm.service';

export interface LlmSettingsDTO {
  baseUrl: string;
  model: string;
  temperature: number;
  rateLimit: number;
}

export class SettingsService {
  constructor(private llmService: LlmService) {}

  getLlmSettings(): LlmSettingsDTO | null {
    const cfg = this.llmService.getLlmConfig();
    if (!cfg) return null;

    return {
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      temperature: cfg.temperature,
      rateLimit: cfg.rateLimit,
    };
  }

  updateLlmSettings(updates: Partial<LlmSettingsDTO>): void {
    this.llmService.updateLlmConfig(updates);
  }
}
