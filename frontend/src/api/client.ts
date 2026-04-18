import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';
import { config } from '@/config';
import { useAuthStore } from '@/auth/auth.store';
import * as authService from '@/auth/auth.service';

const authEnabled = config.authEnabled;

export const apiClient = axios.create({
  baseURL: config.api.baseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach token (only when auth is enabled)
apiClient.interceptors.request.use((reqConfig) => {
  if (!authEnabled) return reqConfig;
  const token = useAuthStore.getState().accessToken;
  if (token) {
    reqConfig.headers.Authorization = `Bearer ${token}`;
  }
  return reqConfig;
});

// Response interceptor — handle 401 with refresh queue
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (cfg: InternalAxiosRequestConfig) => void;
  reject: (err: AxiosError) => void;
}> = [];

function processQueue(error: AxiosError | null) {
  failedQueue.forEach((pending) => {
    if (error) {
      pending.reject(error);
    } else {
      pending.resolve({} as InternalAxiosRequestConfig);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // When auth is disabled, don't handle 401 as auth error
    if (!authEnabled || error.response?.status !== 401 || originalRequest._retry) {
      if (error.response?.status !== 401 || !authEnabled) {
        const data = error.response?.data as Record<string, unknown> | undefined;
        const message =
          (typeof data?.message === 'string' ? data.message : null) || 'Произошла ошибка';
        toast.error(message);
      }
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    const currentRefresh = useAuthStore.getState().refreshToken;
    if (!currentRefresh) {
      useAuthStore.getState().clearAuth();
      window.location.href = '/devpulse/login';
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<InternalAxiosRequestConfig>((resolve, reject) => {
        failedQueue.push({
          resolve: () => {
            const token = useAuthStore.getState().accessToken;
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(originalRequest);
          },
          reject,
        });
      }).then((cfg) => apiClient(cfg));
    }

    isRefreshing = true;

    try {
      const tokens = await authService.refreshToken(currentRefresh);
      useAuthStore.getState().setTokens(tokens);
      processQueue(null);

      originalRequest.headers.Authorization = `Bearer ${tokens.access_token}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError as AxiosError);
      useAuthStore.getState().clearAuth();
      window.location.href = '/devpulse/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
