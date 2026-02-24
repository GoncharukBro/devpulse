import { apiClient } from '@/api/client';
import type { Achievement, AchievementTypeInfo, CatalogResponse, PortfolioResponse } from '@/types/achievement';

export interface AchievementsListParams {
  youtrackLogin?: string;
  type?: string;
  subscriptionId?: string;
  rarity?: string;
  newOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface AchievementsListResponse {
  data: Achievement[];
  total: number;
}

export const achievementsApi = {
  async list(params?: AchievementsListParams): Promise<AchievementsListResponse> {
    const response = await apiClient.get<AchievementsListResponse>('/achievements', { params });
    return response.data;
  },

  async getRecent(limit = 5): Promise<Achievement[]> {
    const response = await apiClient.get<Achievement[]>('/achievements/recent', {
      params: { limit },
    });
    return response.data;
  },

  async getTypes(): Promise<AchievementTypeInfo[]> {
    const response = await apiClient.get<AchievementTypeInfo[]>('/achievements/types');
    return response.data;
  },

  async getByEmployee(login: string): Promise<Achievement[]> {
    const response = await apiClient.get<Achievement[]>(`/achievements/employee/${login}`);
    return response.data;
  },

  async getCatalog(): Promise<CatalogResponse> {
    const response = await apiClient.get<CatalogResponse>('/achievements/catalog');
    return response.data;
  },

  async getPortfolio(login: string): Promise<PortfolioResponse> {
    const response = await apiClient.get<PortfolioResponse>(`/achievements/portfolio/${login}`);
    return response.data;
  },
};
