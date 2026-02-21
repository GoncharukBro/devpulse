import jwksRsa from 'jwks-rsa';
import { config } from '../../config';

const jwksUri = `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/certs`;

const jwksClient = jwksRsa({
  jwksUri,
  cache: true,
  cacheMaxAge: 600_000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

export function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    jwksClient.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
        return;
      }
      if (!key) {
        reject(new Error('Signing key not found'));
        return;
      }
      resolve(key.getPublicKey());
    });
  });
}
