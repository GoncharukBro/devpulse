import { FastifyInstance } from 'fastify';
import { getYouTrackService } from './youtrack.service';

export async function youtrackRoutes(app: FastifyInstance): Promise<void> {
  const service = getYouTrackService(app.log);

  app.get('/youtrack/instances', async () => {
    return service.getInstances();
  });

  app.get<{ Params: { instanceId: string } }>(
    '/youtrack/:instanceId/projects',
    async (request) => {
      return service.getProjects(request.params.instanceId);
    },
  );

  app.get<{ Params: { instanceId: string; projectId: string } }>(
    '/youtrack/:instanceId/projects/:projectId/members',
    async (request) => {
      const { instanceId, projectId } = request.params;
      return service.getProjectMembers(instanceId, projectId);
    },
  );
}
