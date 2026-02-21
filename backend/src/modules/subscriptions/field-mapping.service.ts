import { EntityManager } from '@mikro-orm/postgresql';
import { FieldMapping } from '../../entities/field-mapping.entity';
import { Subscription } from '../../entities/subscription.entity';
import { NotFoundError, ValidationError } from '../../common/errors';
import {
  CreateFieldMappingDto,
  UpdateFieldMappingDto,
  DEFAULT_FIELD_MAPPING,
  VALID_TASK_CATEGORIES,
} from './subscriptions.types';

function validateTaskTypeMapping(mapping: Record<string, string>): void {
  for (const [key, value] of Object.entries(mapping)) {
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new ValidationError('taskTypeMapping keys and values must be strings');
    }
    if (!VALID_TASK_CATEGORIES.includes(value as (typeof VALID_TASK_CATEGORIES)[number])) {
      throw new ValidationError(
        `Invalid task category "${value}" for key "${key}". Valid: ${VALID_TASK_CATEGORIES.join(', ')}`,
      );
    }
  }
}

function validateStringArray(arr: unknown, fieldName: string): void {
  if (!Array.isArray(arr)) {
    throw new ValidationError(`${fieldName} must be an array`);
  }
  for (const item of arr) {
    if (typeof item !== 'string') {
      throw new ValidationError(`${fieldName} must contain only strings`);
    }
  }
}

export async function createFieldMapping(
  em: EntityManager,
  subscription: Subscription,
  dto?: CreateFieldMappingDto,
): Promise<FieldMapping> {
  const data = { ...DEFAULT_FIELD_MAPPING, ...dto };

  if (data.taskTypeMapping) {
    validateTaskTypeMapping(data.taskTypeMapping);
  }

  const mapping = new FieldMapping();
  mapping.subscription = subscription;
  mapping.taskTypeMapping = data.taskTypeMapping ?? DEFAULT_FIELD_MAPPING.taskTypeMapping;
  mapping.aiSavingWorkType = data.aiSavingWorkType ?? undefined;
  mapping.cycleTimeStartStatuses =
    data.cycleTimeStartStatuses ?? DEFAULT_FIELD_MAPPING.cycleTimeStartStatuses;
  mapping.cycleTimeEndStatuses =
    data.cycleTimeEndStatuses ?? DEFAULT_FIELD_MAPPING.cycleTimeEndStatuses;
  mapping.releaseStatuses = data.releaseStatuses ?? DEFAULT_FIELD_MAPPING.releaseStatuses;

  em.persist(mapping);
  return mapping;
}

export async function getFieldMapping(
  em: EntityManager,
  subscriptionId: string,
  ownerId: string,
): Promise<FieldMapping> {
  const mapping = await em.findOne(
    FieldMapping,
    { subscription: { id: subscriptionId, ownerId } },
    { populate: ['subscription'] },
  );

  if (!mapping) {
    throw new NotFoundError('Field mapping not found');
  }

  return mapping;
}

export async function updateFieldMapping(
  em: EntityManager,
  subscriptionId: string,
  ownerId: string,
  dto: UpdateFieldMappingDto,
): Promise<FieldMapping> {
  const mapping = await getFieldMapping(em, subscriptionId, ownerId);

  if (dto.taskTypeMapping !== undefined) {
    validateTaskTypeMapping(dto.taskTypeMapping);
    mapping.taskTypeMapping = dto.taskTypeMapping;
  }

  if (dto.aiSavingWorkType !== undefined) {
    mapping.aiSavingWorkType = dto.aiSavingWorkType ?? undefined;
  }

  if (dto.cycleTimeStartStatuses !== undefined) {
    validateStringArray(dto.cycleTimeStartStatuses, 'cycleTimeStartStatuses');
    mapping.cycleTimeStartStatuses = dto.cycleTimeStartStatuses;
  }

  if (dto.cycleTimeEndStatuses !== undefined) {
    validateStringArray(dto.cycleTimeEndStatuses, 'cycleTimeEndStatuses');
    mapping.cycleTimeEndStatuses = dto.cycleTimeEndStatuses;
  }

  if (dto.releaseStatuses !== undefined) {
    validateStringArray(dto.releaseStatuses, 'releaseStatuses');
    mapping.releaseStatuses = dto.releaseStatuses;
  }

  await em.flush();
  return mapping;
}
