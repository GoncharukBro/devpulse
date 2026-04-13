import { Options } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import pg from 'pg';
import { config } from './index';

// Fix pg driver: parse `date` columns as UTC midnight instead of local midnight.
// Without this, dates shift by -1 day on every DB round-trip when server TZ ≠ UTC.
pg.types.setTypeParser(1082, (val: string) => (val ? new Date(val + 'T00:00:00.000Z') : null));
import {
  Subscription,
  SubscriptionEmployee,
  FieldMapping,
  MetricReport,
  Team,
  TeamMember,
  Achievement,
  CollectionLog,
  AggregatedReport,
} from '../entities';

const mikroOrmConfig: Options<PostgreSqlDriver> = {
  driver: PostgreSqlDriver,
  host: config.db.host,
  port: config.db.port,
  dbName: config.db.name,
  user: config.db.user,
  password: config.db.password,
  entities: [
    Subscription,
    SubscriptionEmployee,
    FieldMapping,
    MetricReport,
    Team,
    TeamMember,
    Achievement,
    CollectionLog,
    AggregatedReport,
  ],
  extensions: [Migrator],
  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
    tableName: 'devpulse_mikro_orm_migrations',
  },
  debug: config.server.nodeEnv === 'development',
};

export default mikroOrmConfig;
