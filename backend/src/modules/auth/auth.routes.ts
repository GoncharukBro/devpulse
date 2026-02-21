import { FastifyInstance } from 'fastify';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/auth/me', async (request) => {
    return request.user;
  });
}
