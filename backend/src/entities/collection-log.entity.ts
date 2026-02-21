import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Subscription } from './subscription.entity';

export interface CollectionError {
  login: string;
  error: string;
  timestamp: string;
}

@Entity({ tableName: 'collection_logs' })
export class CollectionLog {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Subscription, { nullable: true, deleteRule: 'cascade' })
  subscription?: Subscription;

  @Property()
  type!: string;

  @Property()
  status!: string;

  @Property({ type: 'date', nullable: true })
  periodStart?: Date;

  @Property({ type: 'date', nullable: true })
  periodEnd?: Date;

  @Property({ default: 0 })
  totalEmployees: number = 0;

  @Property({ default: 0 })
  processedEmployees: number = 0;

  @Property({ type: 'jsonb', default: '[]' })
  errors: CollectionError[] = [];

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  startedAt: Date = new Date();

  @Property({ type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();
}
