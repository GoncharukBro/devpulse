import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { buildApp } from './app';
import { config } from './config';
import mikroOrmConfig from './config/mikro-orm.config';
import { initCollectionModule } from './modules/collection';
import { LlmService } from './modules/llm/llm.service';
import { setLlmServiceRef } from './modules/settings/settings.routes';
import { AchievementsGenerator } from './modules/achievements/achievements.generator';

async function main(): Promise<void> {
  const orm = await MikroORM.init<PostgreSqlDriver>(mikroOrmConfig);
  const migrator = orm.getMigrator();
  await migrator.up();

  const app = await buildApp();

  app.addHook('onClose', async () => {
    await orm.close();
  });

  app.decorateRequest('orm', null as unknown as typeof orm);
  app.addHook('onRequest', async (request) => {
    request.orm = orm;
  });

  await app.listen({ port: config.server.port, host: config.server.host });

  // Инициализация модуля сбора метрик
  const { worker, cron } = initCollectionModule(orm, app.log);
  await worker.start();
  cron.start();

  // Инициализация генератора ачивок
  const achievementsGenerator = new AchievementsGenerator(orm, app.log);
  worker.setAchievementsGenerator(achievementsGenerator);

  // Инициализация LLM-модуля (требует auth для Keycloak token service)
  let llmService: LlmService | null = null;
  if (config.authEnabled) {
    llmService = new LlmService(orm, app.log);
    try {
      await llmService.initialize();
      worker.setLlmService(llmService);
      llmService.setAchievementsGenerator(achievementsGenerator);
      setLlmServiceRef(llmService);
    } catch (err) {
      app.log.warn(`LLM module initialization failed: ${(err as Error).message}. LLM analysis disabled.`);
    }
  } else {
    app.log.info('AUTH_ENABLED=false — LLM analysis disabled (requires Keycloak)');
  }

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    cron.stop();
    if (llmService) await llmService.shutdown();
    await worker.stop();
    await app.close();
    app.log.info('Server closed');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
