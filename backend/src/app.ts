import Fastify, { FastifyError, FastifyInstance } from 'fastify';
import { config } from './config';
import { registerPlugins } from './plugins';
import { healthRoutes } from './modules/health/health.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { youtrackRoutes } from './modules/youtrack/youtrack.routes';
import { subscriptionRoutes } from './modules/subscriptions/subscriptions.routes';
import { collectionRoutes } from './modules/collection';
import { reportsRoutes } from './modules/reports/reports.routes';
import { teamsRoutes } from './modules/teams/teams.routes';
import { settingsRoutes } from './modules/settings/settings.routes';
import { achievementsRoutes } from './modules/achievements/achievements.routes';
import { AppError } from './common/errors';
import { authenticate } from './common/middleware/auth.middleware';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.server.logLevel,
      transport:
        config.server.nodeEnv === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  await registerPlugins(app);

  app.setErrorHandler((error: FastifyError | AppError, _request, reply) => {
    const statusCode = error instanceof AppError ? error.statusCode : ('statusCode' in error ? error.statusCode ?? 500 : 500);

    if (statusCode >= 500) {
      app.log.error(error);
    } else {
      app.log.warn(error.message);
    }

    reply.status(statusCode).send({
      statusCode,
      error: getHttpErrorName(statusCode),
      message: error.message,
    });
  });

  app.addHook('onRequest', authenticate);

  await app.register(
    async (instance) => {
      await instance.register(healthRoutes);
      await instance.register(authRoutes);
      await instance.register(youtrackRoutes);
      await instance.register(subscriptionRoutes);
      await instance.register(collectionRoutes);
      await instance.register(reportsRoutes);
      await instance.register(teamsRoutes);
      await instance.register(settingsRoutes);
      await instance.register(achievementsRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}

function getHttpErrorName(statusCode: number): string {
  const names: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };
  return names[statusCode] || 'Error';
}
