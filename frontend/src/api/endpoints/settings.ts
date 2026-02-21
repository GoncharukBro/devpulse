import { apiClient } from '@/api/client';

export interface AppSettings {
  cronEnabled: boolean;
  cronSchedule: string;
  llmEnabled: boolean;
}

export const settingsApi = {
  async get(): Promise<AppSettings> {
    const response = await apiClient.get<AppSettings>('/settings');
    return response.data;
  },

  async update(data: Partial<AppSettings>): Promise<AppSettings> {
    const response = await apiClient.patch<AppSettings>('/settings', data);
    return response.data;
  },
};
