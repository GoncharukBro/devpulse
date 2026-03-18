import { create } from 'zustand';
import type { AuthUser, TokenResponse } from '@/auth/auth.types';
import * as authService from '@/auth/auth.service';
import { config } from '@/config';

const DEFAULT_USER: AuthUser = {
  id: 'default-user',
  username: 'admin',
  email: 'admin@devpulse.local',
  fullName: 'Администратор',
};

const LS_KEYS = {
  accessToken: 'dp_access_token',
  refreshToken: 'dp_refresh_token',
  expiresAt: 'dp_expires_at',
} as const;

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  expiresAt: number | null;

  setTokens: (tokens: TokenResponse) => void;
  clearAuth: () => void;
  initialize: () => Promise<void>;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRefresh(expiresAt: number, currentRefreshToken: string) {
  if (refreshTimer) clearTimeout(refreshTimer);

  const delay = expiresAt - Date.now() - 30_000;
  if (delay <= 0) return;

  refreshTimer = setTimeout(async () => {
    try {
      const tokens = await authService.refreshToken(currentRefreshToken);
      useAuthStore.getState().setTokens(tokens);
    } catch {
      useAuthStore.getState().clearAuth();
      window.location.href = '/login';
    }
  }, delay);
}

function userFromToken(token: string): AuthUser {
  const payload = authService.parseToken(token);
  return {
    id: payload.sub,
    username: payload.preferred_username,
    email: payload.email,
    firstName: payload.given_name,
    lastName: payload.family_name,
    fullName: payload.name,
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  expiresAt: null,

  setTokens: (tokens: TokenResponse) => {
    const expiresAt = Date.now() + tokens.expires_in * 1000;
    const user = userFromToken(tokens.access_token);

    localStorage.setItem(LS_KEYS.accessToken, tokens.access_token);
    localStorage.setItem(LS_KEYS.refreshToken, tokens.refresh_token);
    localStorage.setItem(LS_KEYS.expiresAt, String(expiresAt));

    set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      user,
      isAuthenticated: true,
      isLoading: false,
      expiresAt,
    });

    scheduleRefresh(expiresAt, tokens.refresh_token);
  },

  clearAuth: () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;

    localStorage.removeItem(LS_KEYS.accessToken);
    localStorage.removeItem(LS_KEYS.refreshToken);
    localStorage.removeItem(LS_KEYS.expiresAt);

    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      expiresAt: null,
    });
  },

  initialize: async () => {
    if (!config.authEnabled) {
      set({
        user: DEFAULT_USER,
        isAuthenticated: true,
        isLoading: false,
      });
      return;
    }

    const storedAccess = localStorage.getItem(LS_KEYS.accessToken);
    const storedRefresh = localStorage.getItem(LS_KEYS.refreshToken);
    const storedExpires = localStorage.getItem(LS_KEYS.expiresAt);

    if (!storedAccess || !storedRefresh || !storedExpires) {
      set({ isLoading: false });
      return;
    }

    const expiresAt = Number(storedExpires);

    // Token still valid
    if (Date.now() < expiresAt - 10_000) {
      const user = userFromToken(storedAccess);
      set({
        accessToken: storedAccess,
        refreshToken: storedRefresh,
        user,
        isAuthenticated: true,
        isLoading: false,
        expiresAt,
      });
      scheduleRefresh(expiresAt, storedRefresh);
      return;
    }

    // Token expired or about to — try refresh
    try {
      const tokens = await authService.refreshToken(storedRefresh);
      get().setTokens(tokens);
    } catch {
      get().clearAuth();
    }
  },
}));
