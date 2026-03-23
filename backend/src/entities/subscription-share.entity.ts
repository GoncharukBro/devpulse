import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { Subscription } from './subscription.entity';
import { prefixedTable } from './table-prefix';

export type ShareRole = 'viewer' | 'editor';

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

  @Property({ length: 20, default: 'viewer' })
  role: ShareRole = 'viewer';

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();
}
