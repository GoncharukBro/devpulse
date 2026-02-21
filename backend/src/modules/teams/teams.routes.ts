/**
 * API-эндпоинты для управления командами.
 */

import { FastifyInstance } from 'fastify';
import { TeamsService } from './teams.service';
import { CreateTeamDto, UpdateTeamDto, AddMembersDto } from './teams.types';

export async function teamsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/teams
  app.get('/teams', async (request) => {
    const em = request.orm.em.fork();
    const service = new TeamsService(em);
    return service.listTeams(request.user.id);
  });

  // POST /api/teams
  app.post<{ Body: CreateTeamDto }>('/teams', async (request, reply) => {
    const em = request.orm.em.fork();
    const service = new TeamsService(em);
    const result = await service.createTeam(
      request.user.id,
      request.body.name,
      request.body.members,
    );
    reply.status(201).send(result);
  });

  // GET /api/teams/:id
  app.get<{ Params: { id: string } }>('/teams/:id', async (request) => {
    const em = request.orm.em.fork();
    const service = new TeamsService(em);
    return service.getTeam(request.params.id, request.user.id);
  });

  // PATCH /api/teams/:id
  app.patch<{ Params: { id: string }; Body: UpdateTeamDto }>(
    '/teams/:id',
    async (request) => {
      const em = request.orm.em.fork();
      const service = new TeamsService(em);
      return service.updateTeam(
        request.params.id,
        request.user.id,
        request.body.name ?? '',
      );
    },
  );

  // DELETE /api/teams/:id
  app.delete<{ Params: { id: string } }>('/teams/:id', async (request, reply) => {
    const em = request.orm.em.fork();
    const service = new TeamsService(em);
    await service.deleteTeam(request.params.id, request.user.id);
    reply.status(204).send();
  });

  // POST /api/teams/:id/members
  app.post<{ Params: { id: string }; Body: AddMembersDto }>(
    '/teams/:id/members',
    async (request) => {
      const em = request.orm.em.fork();
      const service = new TeamsService(em);
      return service.addMembers(
        request.params.id,
        request.user.id,
        request.body.members,
      );
    },
  );

  // DELETE /api/teams/:id/members/:login
  app.delete<{ Params: { id: string; login: string } }>(
    '/teams/:id/members/:login',
    async (request, reply) => {
      const em = request.orm.em.fork();
      const service = new TeamsService(em);
      await service.removeMember(
        request.params.id,
        request.user.id,
        request.params.login,
      );
      reply.status(204).send();
    },
  );
}
