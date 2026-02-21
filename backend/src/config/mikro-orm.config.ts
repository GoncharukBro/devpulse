import { Options } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { config } from './index';
import {
  Subscription,
  SubscriptionEmployee,
  FieldMapping,
  MetricReport,
  Team,
  TeamMember,
  Achievement,
  CollectionLog,
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
  ],
  extensions: [Migrator],
  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
  },
  debug: config.server.nodeEnv === 'development',
};

export default mikroOrmConfig;
