import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { AuthUser } from './auth.types';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
    orm: MikroORM<PostgreSqlDriver>;
  }
}
