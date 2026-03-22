import { FastifyInstance } from 'fastify';
import { addShare, listShares, removeShare } from './shares.service';

export async function sharesRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/subscriptions/:id/shares
  app.post<{ Params: { id: string }; Body: { login: string } }>(
    '/subscriptions/:id/shares',
    async (request, reply) => {
      const em = request.orm.em.fork();
      const result = await addShare(
        em,
        request.params.id,
        request.user.id,
        request.user.username,
        request.body.login,
      );
      reply.status(201).send(result);
    },
  );

  // GET /api/subscriptions/:id/shares
  app.get<{ Params: { id: string }; Querystring: { page?: string; limit?: string } }>(
    '/subscriptions/:id/shares',
    async (request) => {
      const em = request.orm.em.fork();
      return listShares(
        em,
        request.params.id,
        request.user.id,
        request.query.page ? Number(request.query.page) : undefined,
        request.query.limit ? Number(request.query.limit) : undefined,
      );
    },
  );

  // DELETE /api/subscriptions/:id/shares/:shareId
  app.delete<{ Params: { id: string; shareId: string } }>(
    '/subscriptions/:id/shares/:shareId',
    async (request, reply) => {
      const em = request.orm.em.fork();
      await removeShare(
        em,
        request.params.id,
        Number(request.params.shareId),
        request.user.id,
      );
      reply.status(204).send();
    },
  );
}
