import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { Subscription } from './subscription.entity';

@Entity({ tableName: 'subscription_employees' })
@Unique({ properties: ['subscription', 'youtrackLogin'] })
export class SubscriptionEmployee {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Subscription, { deleteRule: 'cascade' })
  subscription!: Subscription;

  @Property()
  youtrackLogin!: string;

  @Property()
  displayName!: string;

  @Property({ nullable: true })
  email?: string;

  @Property({ nullable: true })
  avatarUrl?: string;

  @Property({ default: true })
  isActive: boolean = true;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();
}
