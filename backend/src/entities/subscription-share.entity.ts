import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { Subscription } from './subscription.entity';
import { prefixedTable } from './table-prefix';

@Entity({ tableName: prefixedTable('subscription_shares') })
@Unique({ properties: ['subscription', 'sharedWithLogin'] })
export class SubscriptionShare {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @ManyToOne(() => Subscription, { deleteRule: 'cascade' })
  subscription!: Subscription;

  @Property({ length: 255 })
  sharedWithLogin!: string;

  @Property({ length: 255 })
  sharedBy!: string;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();
}
