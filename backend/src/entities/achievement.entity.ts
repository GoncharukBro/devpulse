import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { Subscription } from './subscription.entity';

export interface AchievementMetadata {
  [key: string]: unknown;
}

@Entity({ tableName: 'achievements' })
@Unique({ properties: ['youtrackLogin', 'type', 'periodStart', 'subscription'] })
export class Achievement {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property()
  youtrackLogin!: string;

  @ManyToOne(() => Subscription, { nullable: true, deleteRule: 'cascade' })
  subscription?: Subscription;

  @Property()
  type!: string;

  @Property()
  title!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Property({ type: 'date' })
  periodStart!: Date;

  @Property({ default: 'common' })
  rarity: string = 'common';

  @Property({ type: 'jsonb', default: '{}' })
  metadata: AchievementMetadata = {};

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();
}
