/**
 * Получение и кэширование Keycloak-токена для межсервисного
 * взаимодействия (client_credentials grant).
 */

import { Logger } from '../../common/types/logger';

interface KeycloakInternalConfig {
  url: string;
  realm: string;
  clientId: string;
  clientSecret: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

const MAX_RETRIES = 3;
const RETRY_BACKOFF = [1000, 3000, 5000];
const EXPIRY_BUFFER_MS = 30_000;
const REQUEST_TIMEOUT = 10_000;

export class KeycloakTokenService {
  private cachedToken: string | null = null;
  private expiresAt = 0;
  private disabled = false;

  constructor(
    private keycloakConfig: KeycloakInternalConfig,
    private log: Logger,
  ) {}

  async getToken(): Promise<string | null> {
    if (this.disabled) return null;

    if (this.cachedToken && Date.now() < this.expiresAt - EXPIRY_BUFFER_MS) {
      return this.cachedToken;
    }

    try {
      const result = await this.requestToken();
      this.cachedToken = result.access_token;
      this.expiresAt = Date.now() + result.expires_in * 1000;
      return this.cachedToken;
    } catch (err) {
      const msg = (err as Error).message;
      this.log.error(`Keycloak token error: ${msg}, LLM auth disabled`);
      this.disabled = true;
      return null;
    }
  }

  invalidate(): void {
    this.cachedToken = null;
    this.expiresAt = 0;
    // Re-enable on invalidate so we try again
    this.disabled = false;
  }

  private async requestToken(): Promise<TokenResponse> {
    const tokenUrl = `${this.keycloakConfig.url}/realms/${this.keycloakConfig.realm}/protocol/openid-connect/token`;

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.keycloakConfig.clientId,
      client_secret: this.keycloakConfig.clientSecret,
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        const response = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          return (await response.json()) as TokenResponse;
        }

        const errorBody = await response.text();
        lastError = new Error(
          `Keycloak returned ${response.status}: ${errorBody}`,
        );

        if (response.status === 401 || response.status === 404) {
          // Realm or client doesn't exist, no point retrying
          throw lastError;
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Keycloak returned')) {
          throw err;
        }
        lastError = err as Error;
      }

      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BACKOFF[attempt] ?? 5000;
        this.log.warn(
          `Keycloak token retry ${attempt + 1}/${MAX_RETRIES} after: ${lastError?.message}`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw lastError ?? new Error('Failed to obtain Keycloak token');
  }
}
