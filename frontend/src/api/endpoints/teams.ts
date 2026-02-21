import { apiClient } from '@/api/client';
import type { Team, TeamDetail } from '@/types/team';

export const teamsApi = {
  async list(): Promise<Team[]> {
    const response = await apiClient.get<Team[]>('/teams');
    return response.data;
  },

  async get(id: string): Promise<TeamDetail> {
    const response = await apiClient.get<TeamDetail>(`/teams/${id}`);
    return response.data;
  },

  async create(data: { name: string; members: string[] }): Promise<{ id: string; name: string }> {
    const response = await apiClient.post<{ id: string; name: string }>('/teams', data);
    return response.data;
  },

  async update(id: string, data: { name: string }): Promise<{ id: string; name: string }> {
    const response = await apiClient.patch<{ id: string; name: string }>(`/teams/${id}`, data);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/teams/${id}`);
  },

  async addMembers(id: string, members: string[]): Promise<{ added: number }> {
    const response = await apiClient.post<{ added: number }>(`/teams/${id}/members`, { members });
    return response.data;
  },

  async removeMember(id: string, login: string): Promise<void> {
    await apiClient.delete(`/teams/${id}/members/${login}`);
  },
};
