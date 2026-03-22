import { apiClient } from '@/api/client';
import type { SubscriptionShare, SharesListResponse } from '@/types/subscription';

export const sharesApi = {
  async list(subscriptionId: string, params?: { page?: number; limit?: number }): Promise<SharesListResponse> {
    const response = await apiClient.get<SharesListResponse>(
      `/subscriptions/${subscriptionId}/shares`,
      { params },
    );
    return response.data;
  },

  async add(subscriptionId: string, login: string): Promise<SubscriptionShare> {
    const response = await apiClient.post<SubscriptionShare>(
      `/subscriptions/${subscriptionId}/shares`,
      { login },
    );
    return response.data;
  },

  async remove(subscriptionId: string, shareId: number): Promise<void> {
    await apiClient.delete(`/subscriptions/${subscriptionId}/shares/${shareId}`);
  },
};
