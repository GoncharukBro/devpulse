import { apiClient } from '@/api/client';

export interface AppSettings {
  cronEnabled: boolean;
  cronSchedule: string;
  llmEnabled: boolean;
}

export interface LlmSettings {
  baseUrl: string;
  model: string;
  temperature: number;
  rateLimit: number;
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

  async getLlm(): Promise<LlmSettings> {
    const response = await apiClient.get<LlmSettings>('/settings/llm');
    return response.data;
  },

  async updateLlm(data: Partial<LlmSettings>): Promise<LlmSettings> {
    const response = await apiClient.put<LlmSettings>('/settings/llm', data);
    return response.data;
  },
};
