import jwt from 'jsonwebtoken';
import { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config';
import { getSigningKey } from '../services/jwks.service';
import { AuthUser, KeycloakJwtPayload } from '../types/auth.types';

const expectedIssuer = `${config.keycloak.url}/realms/${config.keycloak.realm}`;

const PUBLIC_ROUTES = ['/api/health'];

function isPublicRoute(url: string): boolean {
  const path = url.split('?')[0];
  return PUBLIC_ROUTES.some((route) => path === route);
}

function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

function parsePayloadToUser(payload: KeycloakJwtPayload): AuthUser {
  const clientRoles =
    payload.resource_access?.[config.keycloak.clientId]?.roles ?? [];

  return {
    id: payload.sub,
    username: payload.preferred_username,
    email: payload.email,
    firstName: payload.given_name,
    lastName: payload.family_name,
    fullName: payload.name,
    roles: payload.realm_access?.roles ?? [],
    clientRoles,
  };
}

function verifyToken(token: string): Promise<KeycloakJwtPayload> {
  return new Promise((resolve, reject) => {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header.kid) {
      reject(new Error('Invalid token structure'));
      return;
    }

    getSigningKey(decoded.header.kid)
      .then((publicKey) => {
        jwt.verify(
          token,
          publicKey,
          {
            issuer: expectedIssuer,
            algorithms: ['RS256'],
          },
          (err, payload) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(payload as KeycloakJwtPayload);
          },
        );
      })
      .catch(reject);
  });
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (isPublicRoute(request.url)) return;

  const authHeader = request.headers.authorization;
  const token = extractToken(authHeader);

  if (!authHeader) {
    request.log.warn('Auth failed: missing authorization header');
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing authorization token',
    });
    return;
  }

  if (!token) {
    request.log.warn('Auth failed: invalid authorization format');
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid authorization format',
    });
    return;
  }

  try {
    const payload = await verifyToken(token);
    request.user = parsePayloadToUser(payload);
    request.log.info(`User authenticated: ${request.user.username}`);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      request.log.warn('Auth failed: token expired');
      reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Token expired',
      });
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      request.log.warn(`Auth failed: ${err.message}`);
      reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid token',
      });
      return;
    }

    request.log.error(`Failed to fetch JWKS keys: ${err}`);
    reply.status(503).send({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Authentication service unavailable',
    });
  }
}
