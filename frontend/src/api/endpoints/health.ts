import { apiClient } from '@/api/client';

export async function getHealth() {
  const response = await apiClient.get<{ status: string }>('/health');
  return response.data;
}
