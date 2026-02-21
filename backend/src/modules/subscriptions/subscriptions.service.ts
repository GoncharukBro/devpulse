import { EntityManager } from '@mikro-orm/postgresql';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { Subscription } from '../../entities/subscription.entity';
import { SubscriptionEmployee } from '../../entities/subscription-employee.entity';
import { AppError, NotFoundError, ValidationError } from '../../common/errors';
import { getYouTrackInstances } from '../../config/youtrack.config';
import { createFieldMapping } from './field-mapping.service';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  CreateEmployeeDto,
  UpdateEmployeeDto,
} from './subscriptions.types';

function getInstanceName(instanceId: string): string | undefined {
  const instances = getYouTrackInstances();
  return instances.find((i) => i.id === instanceId)?.name;
}

function validateCreateDto(dto: CreateSubscriptionDto): void {
  if (!dto.youtrackInstanceId) throw new ValidationError('youtrackInstanceId is required');
  if (!dto.projectId) throw new ValidationError('projectId is required');
  if (!dto.projectShortName) throw new ValidationError('projectShortName is required');
  if (!dto.projectName) throw new ValidationError('projectName is required');
  if (!dto.employees || dto.employees.length === 0) {
    throw new ValidationError('At least one employee is required');
  }

  const instanceName = getInstanceName(dto.youtrackInstanceId);
  if (!instanceName) {
    throw new NotFoundError(`YouTrack instance not found: ${dto.youtrackInstanceId}`);
  }
}

export async function listSubscriptions(
  em: EntityManager,
  ownerId: string,
  active?: boolean,
): Promise<object[]> {
  const where: Record<string, unknown> = { ownerId };
  if (active !== undefined) {
    where.isActive = active;
  }

  const subscriptions = await em.find(Subscription, where, {
    populate: ['employees', 'collectionLogs'],
    orderBy: { createdAt: 'DESC' },
  });

  return subscriptions.map((sub) => {
    const lastLog = sub.collectionLogs
      .getItems()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    return {
      id: sub.id,
      youtrackInstanceId: sub.youtrackInstanceId,
      youtrackInstanceName: getInstanceName(sub.youtrackInstanceId) ?? sub.youtrackInstanceId,
      projectId: sub.projectId,
      projectShortName: sub.projectShortName,
      projectName: sub.projectName,
      isActive: sub.isActive,
      employeeCount: sub.employees.getItems().filter((e) => e.isActive).length,
      lastCollection: lastLog
        ? {
            status: lastLog.status,
            completedAt: lastLog.completedAt?.toISOString() ?? null,
            processedEmployees: lastLog.processedEmployees,
            totalEmployees: lastLog.totalEmployees,
          }
        : null,
      createdAt: sub.createdAt.toISOString(),
    };
  });
}

export async function getSubscription(
  em: EntityManager,
  id: string,
  ownerId: string,
): Promise<object> {
  const sub = await em.findOne(
    Subscription,
    { id, ownerId },
    { populate: ['employees', 'fieldMapping'] },
  );

  if (!sub) {
    throw new NotFoundError('Subscription not found');
  }

  return {
    id: sub.id,
    youtrackInstanceId: sub.youtrackInstanceId,
    youtrackInstanceName: getInstanceName(sub.youtrackInstanceId) ?? sub.youtrackInstanceId,
    projectId: sub.projectId,
    projectShortName: sub.projectShortName,
    projectName: sub.projectName,
    isActive: sub.isActive,
    employees: sub.employees.getItems().map((e) => ({
      id: e.id,
      youtrackLogin: e.youtrackLogin,
      displayName: e.displayName,
      email: e.email ?? null,
      avatarUrl: e.avatarUrl ?? null,
      isActive: e.isActive,
    })),
    fieldMapping: sub.fieldMapping
      ? {
          taskTypeMapping: sub.fieldMapping.taskTypeMapping,
          aiSavingWorkType: sub.fieldMapping.aiSavingWorkType ?? null,
          cycleTimeStartStatuses: sub.fieldMapping.cycleTimeStartStatuses,
          cycleTimeEndStatuses: sub.fieldMapping.cycleTimeEndStatuses,
          releaseStatuses: sub.fieldMapping.releaseStatuses,
        }
      : null,
    createdAt: sub.createdAt.toISOString(),
    updatedAt: sub.updatedAt.toISOString(),
  };
}

export async function createSubscription(
  em: EntityManager,
  ownerId: string,
  dto: CreateSubscriptionDto,
): Promise<object> {
  validateCreateDto(dto);

  const sub = new Subscription();
  sub.youtrackInstanceId = dto.youtrackInstanceId;
  sub.projectId = dto.projectId;
  sub.projectShortName = dto.projectShortName;
  sub.projectName = dto.projectName;
  sub.ownerId = ownerId;
  em.persist(sub);

  for (const empDto of dto.employees) {
    const emp = new SubscriptionEmployee();
    emp.subscription = sub;
    emp.youtrackLogin = empDto.youtrackLogin;
    emp.displayName = empDto.displayName;
    emp.email = empDto.email;
    emp.avatarUrl = empDto.avatarUrl;
    em.persist(emp);
  }

  await createFieldMapping(em, sub, dto.fieldMapping);

  try {
    await em.flush();
  } catch (err) {
    if (err instanceof UniqueConstraintViolationException) {
      throw new AppError(409, 'Subscription for this project already exists');
    }
    throw err;
  }

  return getSubscription(em, sub.id, ownerId);
}

export async function updateSubscription(
  em: EntityManager,
  id: string,
  ownerId: string,
  dto: UpdateSubscriptionDto,
): Promise<object> {
  const sub = await em.findOne(Subscription, { id, ownerId });
  if (!sub) throw new NotFoundError('Subscription not found');

  if (dto.isActive !== undefined) {
    sub.isActive = dto.isActive;
  }

  await em.flush();
  return getSubscription(em, id, ownerId);
}

export async function deleteSubscription(
  em: EntityManager,
  id: string,
  ownerId: string,
): Promise<void> {
  const sub = await em.findOne(Subscription, { id, ownerId });
  if (!sub) throw new NotFoundError('Subscription not found');

  await em.removeAndFlush(sub);
}

export async function addEmployees(
  em: EntityManager,
  subscriptionId: string,
  ownerId: string,
  employees: CreateEmployeeDto[],
): Promise<object[]> {
  const sub = await em.findOne(
    Subscription,
    { id: subscriptionId, ownerId },
    { populate: ['employees'] },
  );
  if (!sub) throw new NotFoundError('Subscription not found');

  const existingLogins = new Set(sub.employees.getItems().map((e) => e.youtrackLogin));

  for (const empDto of employees) {
    if (existingLogins.has(empDto.youtrackLogin)) continue;

    const emp = new SubscriptionEmployee();
    emp.subscription = sub;
    emp.youtrackLogin = empDto.youtrackLogin;
    emp.displayName = empDto.displayName;
    emp.email = empDto.email;
    emp.avatarUrl = empDto.avatarUrl;
    em.persist(emp);
  }

  await em.flush();

  // Re-fetch to get full list
  const updated = await em.findOneOrFail(
    Subscription,
    { id: subscriptionId },
    { populate: ['employees'] },
  );

  return updated.employees.getItems().map((e) => ({
    id: e.id,
    youtrackLogin: e.youtrackLogin,
    displayName: e.displayName,
    email: e.email ?? null,
    avatarUrl: e.avatarUrl ?? null,
    isActive: e.isActive,
  }));
}

export async function updateEmployee(
  em: EntityManager,
  subscriptionId: string,
  employeeId: string,
  ownerId: string,
  dto: UpdateEmployeeDto,
): Promise<object> {
  const emp = await em.findOne(SubscriptionEmployee, {
    id: employeeId,
    subscription: { id: subscriptionId, ownerId },
  });
  if (!emp) throw new NotFoundError('Employee not found');

  if (dto.isActive !== undefined) {
    emp.isActive = dto.isActive;
  }

  await em.flush();

  return {
    id: emp.id,
    youtrackLogin: emp.youtrackLogin,
    displayName: emp.displayName,
    email: emp.email ?? null,
    avatarUrl: emp.avatarUrl ?? null,
    isActive: emp.isActive,
  };
}

export async function deleteEmployee(
  em: EntityManager,
  subscriptionId: string,
  employeeId: string,
  ownerId: string,
): Promise<void> {
  const emp = await em.findOne(SubscriptionEmployee, {
    id: employeeId,
    subscription: { id: subscriptionId, ownerId },
  });
  if (!emp) throw new NotFoundError('Employee not found');

  await em.removeAndFlush(emp);
}
