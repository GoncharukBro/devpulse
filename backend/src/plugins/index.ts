import cors from '@fastify/cors';
import { FastifyInstance } from 'fastify';

export async function registerPlugins(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3100',
    credentials: true,
  });
}
