import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { Team } from './team.entity';
import { prefixedTable } from './table-prefix';

@Entity({ tableName: prefixedTable('team_members') })
@Unique({ properties: ['team', 'youtrackLogin'] })
export class TeamMember {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Team, { deleteRule: 'cascade' })
  team!: Team;

  @Property()
  youtrackLogin!: string;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();
}
