/**
 * Оркестрация LLM-анализа: инициализация, очередь, состояние.
 */

import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { RateLimiter } from '../../common/utils/rate-limiter';
import { config } from '../../config';
import { KeycloakTokenService } from './keycloak-token.service';
import { LlmClient } from './llm.client';
import { LlmWorker } from './llm.worker';
import { LlmConfig, LlmWorkerState } from './llm.types';
import { AchievementsGenerator } from '../achievements/achievements.generator';

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export class LlmService {
  private worker: LlmWorker | null = null;
  private client: LlmClient | null = null;
  private tokenService: KeycloakTokenService | null = null;

  constructor(
    private orm: MikroORM<PostgreSqlDriver>,
    private log: Logger,
  ) {}

  async initialize(): Promise<void> {
    const llmConfig: LlmConfig = {
      baseUrl: config.llm.baseUrl,
      model: config.llm.model,
      temperature: config.llm.temperature,
      rateLimit: config.llm.rateLimit,
      requestTimeoutMs: config.llm.requestTimeoutMs,
      maxRetries: config.llm.maxRetries,
    };

    // Rate limit: requests per minute → interval in ms
    const intervalMs = Math.ceil(60_000 / llmConfig.rateLimit);
    const rateLimiter = new RateLimiter(intervalMs);

    this.tokenService = new KeycloakTokenService(
      {
        url: config.keycloak.url,
        realm: config.keycloak.internal.realm,
        clientId: config.keycloak.internal.clientId,
        clientSecret: config.keycloak.internal.clientSecret,
      },
      this.log,
    );

    this.client = new LlmClient(llmConfig, this.tokenService, rateLimiter, this.log);
    this.worker = new LlmWorker(this.orm, this.client, this.log);

    await this.worker.start();
    this.log.info('LLM service initialized');
  }

  enqueueReports(
    reports: Array<{
      reportId: string;
      subscriptionId: string;
      collectionLogId?: string;
      login: string;
      name: string;
      project: string;
      taskSummaries: Array<{ id: string; summary: string; type: string }>;
    }>,
  ): void {
    if (!this.worker) {
      this.log.warn('LLM service not initialized, skipping enqueue');
      return;
    }

    for (const r of reports) {
      this.worker.enqueue({
        reportId: r.reportId,
        subscriptionId: r.subscriptionId,
        collectionLogId: r.collectionLogId,
        youtrackLogin: r.login,
        employeeName: r.name,
        projectName: r.project,
        taskSummaries: r.taskSummaries,
      });
    }

    this.log.info(`LLM: enqueued ${reports.length} reports for analysis`);
  }

  setAchievementsGenerator(generator: AchievementsGenerator): void {
    if (this.worker) {
      this.worker.setAchievementsGenerator(generator);
    }
  }

  getState(): LlmWorkerState {
    if (!this.worker) {
      return { queueSize: 0, processing: null, isRunning: false };
    }
    return this.worker.getState();
  }

  getLlmConfig(): LlmConfig | null {
    return this.client?.getConfig() ?? null;
  }

  updateLlmConfig(updates: Partial<LlmConfig>): void {
    if (this.client) {
      this.client.updateConfig(updates);
      this.log.info(
        `LLM config updated: ${Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(', ')}`,
      );
    }
  }

  async shutdown(): Promise<void> {
    if (this.worker) {
      await this.worker.stop();
    }
    this.log.info('LLM service shut down');
  }
}
