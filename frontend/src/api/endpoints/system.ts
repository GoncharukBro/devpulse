import { apiClient } from '@/api/client';

type ServiceStatus = 'connected' | 'error' | 'not_configured';

export interface ServiceInfo {
  status: ServiceStatus;
  url?: string;
  name?: string;
  model?: string;
  details: string;
}

export interface SystemStatusResponse {
  version: string;
  services: {
    youtrack: ServiceInfo[];
    ollama: ServiceInfo;
    keycloak: ServiceInfo;
    database: ServiceInfo;
    smtp: ServiceInfo;
  };
}

export const systemApi = {
  async getStatus(): Promise<SystemStatusResponse> {
    const response = await apiClient.get<SystemStatusResponse>('/system/status');
    return response.data;
  },
};
