import { Entity, PrimaryKey, Property, OneToMany, Collection } from '@mikro-orm/core';
import { TeamMember } from './team-member.entity';
import { prefixedTable } from './table-prefix';

@Entity({ tableName: prefixedTable('teams') })
export class Team {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property()
  name!: string;

  @Property()
  ownerId!: string;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @OneToMany(() => TeamMember, (m) => m.team)
  members = new Collection<TeamMember>(this);
}
