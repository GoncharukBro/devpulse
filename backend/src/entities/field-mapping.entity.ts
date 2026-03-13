import { Entity, PrimaryKey, Property, OneToOne } from '@mikro-orm/core';
import { Subscription } from './subscription.entity';

export interface TaskTypeMapping {
  [youtrackType: string]: string;
}

@Entity({ tableName: 'field_mappings' })
export class FieldMapping {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @OneToOne(() => Subscription, (s) => s.fieldMapping, { owner: true, deleteRule: 'cascade' })
  subscription!: Subscription;

  @Property({ type: 'jsonb', default: '{}' })
  taskTypeMapping: TaskTypeMapping = {};

  @Property({ type: 'text', default: 'Type' })
  typeFieldName: string = 'Type';

  @Property({ type: 'jsonb', default: '[]' })
  cycleTimeStartStatuses: string[] = [];

  @Property({ type: 'jsonb', default: '[]' })
  cycleTimeEndStatuses: string[] = [];

  @Property({ type: 'jsonb', default: '[]' })
  releaseStatuses: string[] = [];

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
