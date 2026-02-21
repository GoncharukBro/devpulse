import {
  Entity,
  PrimaryKey,
  Property,
  OneToMany,
  OneToOne,
  Collection,
  Unique,
} from '@mikro-orm/core';
import { SubscriptionEmployee } from './subscription-employee.entity';
import { FieldMapping } from './field-mapping.entity';
import { MetricReport } from './metric-report.entity';
import { CollectionLog } from './collection-log.entity';
import { Achievement } from './achievement.entity';

@Entity({ tableName: 'subscriptions' })
@Unique({ properties: ['youtrackInstanceId', 'projectId', 'ownerId'] })
export class Subscription {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property()
  youtrackInstanceId!: string;

  @Property()
  projectId!: string;

  @Property()
  projectShortName!: string;

  @Property()
  projectName!: string;

  @Property()
  ownerId!: string;

  @Property({ default: true })
  isActive: boolean = true;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @OneToMany(() => SubscriptionEmployee, (e) => e.subscription)
  employees = new Collection<SubscriptionEmployee>(this);

  @OneToOne(() => FieldMapping, (fm) => fm.subscription, { nullable: true })
  fieldMapping?: FieldMapping;

  @OneToMany(() => MetricReport, (r) => r.subscription)
  metricReports = new Collection<MetricReport>(this);

  @OneToMany(() => CollectionLog, (cl) => cl.subscription)
  collectionLogs = new Collection<CollectionLog>(this);

  @OneToMany(() => Achievement, (a) => a.subscription)
  achievements = new Collection<Achievement>(this);
}
