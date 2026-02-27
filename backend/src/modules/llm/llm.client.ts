/**
 * OpenAI-совместимый HTTP-клиент для Ollama (или любого LLM-провайдера).
 */

import { RateLimiter } from '../../common/utils/rate-limiter';
import { KeycloakTokenService } from './keycloak-token.service';
import { ChatMessage, LlmConfig } from './llm.types';

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}

const RETRY_BACKOFF = [5000, 15000, 30000];

export class LlmClient {
  constructor(
    private config: LlmConfig,
    private tokenService: KeycloakTokenService,
    private rateLimiter: RateLimiter,
    private log: Logger,
  ) {}

  updateConfig(updates: Partial<LlmConfig>): void {
    Object.assign(this.config, updates);
  }

  getConfig(): LlmConfig {
    return { ...this.config };
  }

  async chatCompletion(messages: ChatMessage[]): Promise<string | null> {
    await this.rateLimiter.acquire();

    const promptSize = messages.reduce((s, m) => s + m.content.length, 0);
    this.log.info(
      `LLM request: ${promptSize} chars prompt, model: ${this.config.model}`,
    );

    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const body = JSON.stringify({
      model: this.config.model,
      messages,
      temperature: this.config.temperature,
      max_tokens: 2000,
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const start = Date.now();

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        // Attach Keycloak token if available
        const token = await this.tokenService.getToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const elapsed = Date.now() - start;

        if (response.ok) {
          const data = (await response.json()) as ChatCompletionResponse;
          const content = data.choices?.[0]?.message?.content ?? '';
          this.log.info(`LLM response: ${content.length} chars, ${(elapsed / 1000).toFixed(1)}s`);
          return content;
        }

        // Handle 401 — refresh Keycloak token and retry once
        if (response.status === 401 && attempt === 0) {
          this.log.warn('LLM returned 401, refreshing Keycloak token');
          this.tokenService.invalidate();
          continue;
        }

        // Retry on 5xx
        if (response.status >= 500 && attempt < this.config.maxRetries) {
          const backoff = RETRY_BACKOFF[attempt] ?? 15000;
          this.log.error(
            `LLM request failed: ${response.status} (${elapsed}ms), retry ${attempt + 1}/${this.config.maxRetries}`,
          );
          await new Promise((r) => setTimeout(r, backoff));
          lastError = new Error(`LLM responded with ${response.status}`);
          continue;
        }

        const errorBody = await response.text();
        this.log.error(
          `LLM request failed: ${response.status} (${elapsed}ms): ${errorBody.slice(0, 200)}`,
        );
        return null;
      } catch (err) {
        const elapsed = Date.now() - start;
        const error = err as Error;

        if (error.name === 'AbortError') {
          this.log.error(
            `LLM request failed: timeout after ${this.config.requestTimeoutMs / 1000}s, retry ${attempt + 1}/${this.config.maxRetries}`,
          );
        } else {
          this.log.error(
            `LLM request failed: ${error.message} (${elapsed}ms), retry ${attempt + 1}/${this.config.maxRetries}`,
          );
        }

        if (attempt < this.config.maxRetries) {
          const backoff = RETRY_BACKOFF[attempt] ?? 15000;
          await new Promise((r) => setTimeout(r, backoff));
          lastError = error;
          continue;
        }

        lastError = error;
      }
    }

    this.log.error(`LLM unavailable: ${lastError?.message}`);
    return null;
  }
}
