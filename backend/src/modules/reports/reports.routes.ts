/**
 * API-эндпоинты отчётов и метрик.
 */

import { FastifyInstance } from 'fastify';
import { ReportsService } from './reports.service';

interface EmployeeReportQuery {
  subscriptionId: string;
  periodStart: string;
}

interface EmployeeHistoryQuery {
  subscriptionId?: string;
  weeks?: string;
}

interface EmployeeReportsQuery {
  subscriptionId?: string;
  page?: string;
  limit?: string;
}

interface EmailPreviewBody {
  type: 'employee' | 'project' | 'team';
  youtrackLogin?: string;
  subscriptionId?: string;
  teamId?: string;
  periodStart?: string;
}

interface EmployeeListQuery {
  subscriptionId?: string;
}

interface ProjectHistoryQuery {
  weeks?: string;
}

export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/employees
  app.get<{ Querystring: EmployeeListQuery }>(
    '/employees',
    async (request) => {
      const em = request.orm.em.fork();
      const service = new ReportsService(em);
      return service.getEmployeeList(request.user.id, request.user.username, request.query.subscriptionId);
    },
  );

  // GET /api/reports/overview
  app.get('/reports/overview', async (request) => {
    const em = request.orm.em.fork();
    const service = new ReportsService(em);
    return service.getOverview(request.user.id, request.user.username);
  });

  // GET /api/reports/employees
  app.get<{ Querystring: EmployeeListQuery }>(
    '/reports/employees',
    async (request) => {
      const em = request.orm.em.fork();
      const service = new ReportsService(em);
      return service.getEmployeeList(request.user.id, request.user.username, request.query.subscriptionId);
    },
  );

  // GET /api/reports/projects/:subscriptionId/summary
  app.get<{ Params: { subscriptionId: string } }>(
    '/reports/projects/:subscriptionId/summary',
    async (request) => {
      const em = request.orm.em.fork();
      const service = new ReportsService(em);
      return service.getProjectSummary({
        subscriptionId: request.params.subscriptionId,
        userId: request.user.id,
        userLogin: request.user.username,
      });
    },
  );

  // GET /api/reports/projects/:subscriptionId/history
  app.get<{ Params: { subscriptionId: string }; Querystring: ProjectHistoryQuery }>(
    '/reports/projects/:subscriptionId/history',
    async (request) => {
      const em = request.orm.em.fork();
      const service = new ReportsService(em);
      return service.getProjectHistory({
        subscriptionId: request.params.subscriptionId,
        userId: request.user.id,
        userLogin: request.user.username,
        weeks: request.query.weeks ? parseInt(request.query.weeks, 10) : undefined,
      });
    },
  );

  // GET /api/reports/employees/:login/summary
  app.get<{ Params: { login: string } }>(
    '/reports/employees/:login/summary',
    async (request) => {
      const em = request.orm.em.fork();
      const service = new ReportsService(em);
      return service.getEmployeeSummary({
        youtrackLogin: request.params.login,
        userId: request.user.id,
        userLogin: request.user.username,
      });
    },
  );

  // GET /api/reports/employees/:login/history
  app.get<{ Params: { login: string }; Querystring: EmployeeHistoryQuery }>(
    '/reports/employees/:login/history',
    async (request) => {
      const em = request.orm.em.fork();
      const service = new ReportsService(em);
      return service.getEmployeeHistory({
        youtrackLogin: request.params.login,
        userId: request.user.id,
        userLogin: request.user.username,
        subscriptionId: request.query.subscriptionId,
        weeks: request.query.weeks ? parseInt(request.query.weeks, 10) : undefined,
      });
    },
  );

  // GET /api/reports/employees/:login/report
  app.get<{ Params: { login: string }; Querystring: EmployeeReportQuery }>(
    '/reports/employees/:login/report',
    async (request, reply) => {
      const { subscriptionId, periodStart } = request.query;
      if (!subscriptionId || !periodStart) {
        reply.status(400).send({ message: 'subscriptionId and periodStart are required' });
        return;
      }

      const em = request.orm.em.fork();
      const service = new ReportsService(em);
      const report = await service.getEmployeeReport({
        youtrackLogin: request.params.login,
        subscriptionId,
        periodStart: new Date(periodStart),
        userId: request.user.id,
        userLogin: request.user.username,
      });

      if (!report) {
        reply.status(404).send({ message: 'Report not found' });
        return;
      }

      return report;
    },
  );

  // GET /api/reports/employees/:login/reports
  app.get<{ Params: { login: string }; Querystring: EmployeeReportsQuery }>(
    '/reports/employees/:login/reports',
    async (request) => {
      const em = request.orm.em.fork();
      const service = new ReportsService(em);
      return service.getEmployeeReportList({
        youtrackLogin: request.params.login,
        userId: request.user.id,
        userLogin: request.user.username,
        subscriptionId: request.query.subscriptionId,
        page: request.query.page ? parseInt(request.query.page, 10) : undefined,
        limit: request.query.limit ? parseInt(request.query.limit, 10) : undefined,
      });
    },
  );

  // POST /api/reports/email-preview
  app.post<{ Body: EmailPreviewBody }>(
    '/reports/email-preview',
    async (request, reply) => {
      const { type, youtrackLogin, subscriptionId, teamId, periodStart } = request.body;

      if (!type) {
        reply.status(400).send({ message: 'type is required' });
        return;
      }
      if (type === 'employee' && (!youtrackLogin || !subscriptionId)) {
        reply.status(400).send({ message: 'youtrackLogin and subscriptionId are required for employee type' });
        return;
      }
      if (type === 'project' && !subscriptionId) {
        reply.status(400).send({ message: 'subscriptionId is required for project type' });
        return;
      }
      if (type === 'team' && !teamId) {
        reply.status(400).send({ message: 'teamId is required for team type' });
        return;
      }

      const em = request.orm.em.fork();
      const service = new ReportsService(em);
      return service.getEmailPreview({
        type,
        userId: request.user.id,
        userLogin: request.user.username,
        youtrackLogin,
        subscriptionId,
        teamId,
        periodStart,
      });
    },
  );
}
