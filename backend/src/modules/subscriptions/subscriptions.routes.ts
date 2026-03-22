import { FastifyInstance } from 'fastify';
import {
  listSubscriptions,
  getSubscription,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  addEmployees,
  updateEmployee,
  deleteEmployee,
} from './subscriptions.service';
import {
  getFieldMapping,
  updateFieldMapping,
} from './field-mapping.service';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  CreateEmployeeDto,
  UpdateEmployeeDto,
  UpdateFieldMappingDto,
  VALID_TASK_CATEGORY_KEYS,
} from './subscriptions.types';
import { ValidationError } from '../../common/errors';

function validateFieldMapping(dto: UpdateFieldMappingDto | undefined): void {
  if (!dto) return;
  if (dto.taskTypeMapping) {
    const invalidValues = Object.values(dto.taskTypeMapping).filter(
      (v) => !VALID_TASK_CATEGORY_KEYS.includes(v),
    );
    if (invalidValues.length > 0) {
      throw new ValidationError(`Invalid task category values: ${invalidValues.join(', ')}. Valid: ${VALID_TASK_CATEGORY_KEYS.join(', ')}`);
    }
  }
}

export async function subscriptionRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/subscriptions
  app.get<{ Querystring: { active?: string } }>('/subscriptions', async (request) => {
    const em = request.orm.em.fork();
    const active =
      request.query.active === 'true' ? true : request.query.active === 'false' ? false : undefined;
    return listSubscriptions(em, request.user.id, request.user.username, active);
  });

  // POST /api/subscriptions
  app.post<{ Body: CreateSubscriptionDto }>('/subscriptions', async (request, reply) => {
    validateFieldMapping(request.body.fieldMapping);
    const em = request.orm.em.fork();
    const result = await createSubscription(em, request.user.id, request.body);
    reply.status(201).send(result);
  });

  // GET /api/subscriptions/:id
  app.get<{ Params: { id: string } }>('/subscriptions/:id', async (request) => {
    const em = request.orm.em.fork();
    return getSubscription(em, request.params.id, request.user.id, request.user.username);
  });

  // PATCH /api/subscriptions/:id
  app.patch<{ Params: { id: string }; Body: UpdateSubscriptionDto }>(
    '/subscriptions/:id',
    async (request) => {
      const em = request.orm.em.fork();
      return updateSubscription(em, request.params.id, request.user.id, request.body);
    },
  );

  // DELETE /api/subscriptions/:id
  app.delete<{ Params: { id: string } }>('/subscriptions/:id', async (request, reply) => {
    const em = request.orm.em.fork();
    await deleteSubscription(em, request.params.id, request.user.id);
    reply.status(204).send();
  });

  // POST /api/subscriptions/:id/employees
  app.post<{ Params: { id: string }; Body: { employees: CreateEmployeeDto[] } }>(
    '/subscriptions/:id/employees',
    async (request) => {
      const em = request.orm.em.fork();
      return addEmployees(em, request.params.id, request.user.id, request.body.employees);
    },
  );

  // PATCH /api/subscriptions/:id/employees/:employeeId
  app.patch<{ Params: { id: string; employeeId: string }; Body: UpdateEmployeeDto }>(
    '/subscriptions/:id/employees/:employeeId',
    async (request) => {
      const em = request.orm.em.fork();
      return updateEmployee(
        em,
        request.params.id,
        request.params.employeeId,
        request.user.id,
        request.body,
      );
    },
  );

  // DELETE /api/subscriptions/:id/employees/:employeeId
  app.delete<{ Params: { id: string; employeeId: string } }>(
    '/subscriptions/:id/employees/:employeeId',
    async (request, reply) => {
      const em = request.orm.em.fork();
      await deleteEmployee(
        em,
        request.params.id,
        request.params.employeeId,
        request.user.id,
      );
      reply.status(204).send();
    },
  );

  // GET /api/subscriptions/:id/field-mapping
  app.get<{ Params: { id: string } }>('/subscriptions/:id/field-mapping', async (request) => {
    const em = request.orm.em.fork();
    const mapping = await getFieldMapping(em, request.params.id, request.user.id, request.user.username);
    return {
      taskTypeMapping: mapping.taskTypeMapping,
      typeFieldName: mapping.typeFieldName,
      cycleTimeStartStatuses: mapping.cycleTimeStartStatuses,
      cycleTimeEndStatuses: mapping.cycleTimeEndStatuses,
      releaseStatuses: mapping.releaseStatuses,
    };
  });

  // PUT /api/subscriptions/:id/field-mapping
  app.put<{ Params: { id: string }; Body: UpdateFieldMappingDto }>(
    '/subscriptions/:id/field-mapping',
    async (request) => {
      validateFieldMapping(request.body);
      const em = request.orm.em.fork();
      const mapping = await updateFieldMapping(
        em,
        request.params.id,
        request.user.id,
        request.body,
      );
      return {
        taskTypeMapping: mapping.taskTypeMapping,
        typeFieldName: mapping.typeFieldName,
        cycleTimeStartStatuses: mapping.cycleTimeStartStatuses,
        cycleTimeEndStatuses: mapping.cycleTimeEndStatuses,
        releaseStatuses: mapping.releaseStatuses,
      };
    },
  );
}
