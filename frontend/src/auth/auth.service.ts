import { config } from '@/config';
import { generateCodeVerifier, generateCodeChallenge, generateState } from '@/auth/pkce';
import type { TokenResponse, TokenPayload } from '@/auth/auth.types';

const KC = config.keycloak;
const BASE = `${KC.url}/realms/${KC.realm}/protocol/openid-connect`;
const AUTH_URL = `${BASE}/auth`;
const TOKEN_URL = `${BASE}/token`;
const LOGOUT_URL = `${BASE}/logout`;

const STORAGE_KEYS = {
  codeVerifier: 'dp_code_verifier',
  state: 'dp_state',
  returnUrl: 'dp_return_url',
} as const;

export function login(returnUrl?: string): void {
  const verifier = generateCodeVerifier();
  const state = generateState();

  sessionStorage.setItem(STORAGE_KEYS.codeVerifier, verifier);
  sessionStorage.setItem(STORAGE_KEYS.state, state);
  if (returnUrl) {
    sessionStorage.setItem(STORAGE_KEYS.returnUrl, returnUrl);
  }

  generateCodeChallenge(verifier).then((challenge) => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: KC.clientId,
      redirect_uri: KC.redirectUri,
      scope: 'openid profile email',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    window.location.href = `${AUTH_URL}?${params.toString()}`;
  });
}

export async function handleCallback(code: string, state: string): Promise<TokenResponse> {
  const savedState = sessionStorage.getItem(STORAGE_KEYS.state);
  if (state !== savedState) {
    throw new Error('Invalid state parameter');
  }

  const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.codeVerifier);
  if (!codeVerifier) {
    throw new Error('Missing code verifier');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: KC.clientId,
    code,
    redirect_uri: KC.redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Token exchange failed: ${errorBody}`);
  }

  sessionStorage.removeItem(STORAGE_KEYS.codeVerifier);
  sessionStorage.removeItem(STORAGE_KEYS.state);

  return response.json();
}

export function getSavedReturnUrl(): string {
  const url = sessionStorage.getItem(STORAGE_KEYS.returnUrl) || '/overview';
  sessionStorage.removeItem(STORAGE_KEYS.returnUrl);
  return url;
}

export async function refreshToken(currentRefreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: KC.clientId,
    refresh_token: currentRefreshToken,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error('Token refresh failed');
  }

  return response.json();
}

export function logout(): void {
  const params = new URLSearchParams({
    client_id: KC.clientId,
    post_logout_redirect_uri: KC.redirectUri,
  });

  window.location.href = `${LOGOUT_URL}?${params.toString()}`;
}

export function parseToken(token: string): TokenPayload {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join(''),
  );
  return JSON.parse(json);
}
