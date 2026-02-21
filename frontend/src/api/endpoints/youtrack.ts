import { apiClient } from '@/api/client';
import type { YouTrackInstance, YouTrackProject, YouTrackUser } from '@/types/youtrack';

export const youtrackApi = {
  async getInstances(): Promise<YouTrackInstance[]> {
    const response = await apiClient.get<YouTrackInstance[]>('/youtrack/instances');
    return response.data;
  },

  async getProjects(instanceId: string): Promise<YouTrackProject[]> {
    const response = await apiClient.get<YouTrackProject[]>(
      `/youtrack/${instanceId}/projects`,
    );
    return response.data;
  },

  async getMembers(instanceId: string, projectId: string): Promise<YouTrackUser[]> {
    const response = await apiClient.get<YouTrackUser[]>(
      `/youtrack/${instanceId}/projects/${projectId}/members`,
    );
    return response.data;
  },
};
