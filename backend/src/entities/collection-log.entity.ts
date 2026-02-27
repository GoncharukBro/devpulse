import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Subscription } from './subscription.entity';

export interface CollectionError {
  login: string;
  error: string;
  timestamp: string;
}

export type CollectionLogStatus =
  | 'pending'
  | 'running'
  | 'stopping'
  | 'completed'
  | 'partial'
  | 'stopped'
  | 'cancelled'
  | 'failed'
  | 'skipped';

export type CollectionLogType = 'manual' | 'cron';

@Entity({ tableName: 'collection_logs' })
export class CollectionLog {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Subscription, { nullable: true, deleteRule: 'cascade' })
  subscription?: Subscription;

  @Property({ nullable: true })
  userId?: string;

  @Property({ type: 'date', nullable: true })
  periodStart?: Date;

  @Property({ type: 'date', nullable: true })
  periodEnd?: Date;

  @Property()
  type!: string;

  @Property()
  status!: string;

  @Property({ default: 0 })
  totalEmployees: number = 0;

  @Property({ default: 0 })
  processedEmployees: number = 0;

  @Property({ default: 0 })
  skippedEmployees: number = 0;

  @Property({ default: 0 })
  failedEmployees: number = 0;

  @Property({ default: 0 })
  reQueuedEmployees: number = 0;

  @Property({ default: 0 })
  llmTotal: number = 0;

  @Property({ default: 0 })
  llmCompleted: number = 0;

  @Property({ default: 0 })
  llmFailed: number = 0;

  @Property({ default: 0 })
  llmSkipped: number = 0;

  @Property({ default: false })
  overwrite: boolean = false;

  @Property({ default: 0 })
  duration: number = 0;

  @Property({ default: 0 })
  youtrackDuration: number = 0;

  @Property({ default: 0 })
  llmDuration: number = 0;

  @Property({ type: 'text', nullable: true })
  error?: string;

  @Property({ type: 'jsonb', default: '[]' })
  errors: CollectionError[] = [];

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  startedAt: Date = new Date();

  @Property({ type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
