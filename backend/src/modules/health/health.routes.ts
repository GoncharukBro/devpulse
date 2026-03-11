import { FastifyInstance } from 'fastify';
import { collectionState } from '../collection/collection.state';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const workersHealth = collectionState.getWorkersHealth();
    const allAlive = workersHealth.collection.alive && workersHealth.llm.alive;

    return {
      status: allAlive ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      workers: workersHealth,
    };
  });
}
