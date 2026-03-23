import { apiClient } from '@/api/client';
import type { SubscriptionShare, SharesListResponse, ShareRole } from '@/types/subscription';

export const sharesApi = {
  async list(subscriptionId: string, params?: { page?: number; limit?: number }): Promise<SharesListResponse> {
    const response = await apiClient.get<SharesListResponse>(
      `/subscriptions/${subscriptionId}/shares`,
      { params },
    );
    return response.data;
  },

  async add(subscriptionId: string, login: string, role: ShareRole = 'viewer'): Promise<SubscriptionShare> {
    const response = await apiClient.post<SubscriptionShare>(
      `/subscriptions/${subscriptionId}/shares`,
      { login, role },
    );
    return response.data;
  },

  async updateRole(subscriptionId: string, shareId: number, role: ShareRole): Promise<SubscriptionShare> {
    const response = await apiClient.patch<SubscriptionShare>(
      `/subscriptions/${subscriptionId}/shares/${shareId}`,
      { role },
    );
    return response.data;
  },

  async remove(subscriptionId: string, shareId: number): Promise<void> {
    await apiClient.delete(`/subscriptions/${subscriptionId}/shares/${shareId}`);
  },
};
