import { apiClient } from '@/api/client';
import type {
  CollectionState,
  CronState,
  PaginatedCollectionLogs,
  TriggerResponse,
  BackfillResponse,
  StopResponse,
} from '@/types/collection';

export const collectionApi = {
  async trigger(data: {
    subscriptionId: string;
    periodStart?: string;
    periodEnd?: string;
  }): Promise<TriggerResponse> {
    const response = await apiClient.post<TriggerResponse>('/collection/trigger', data);
    return response.data;
  },

  async triggerAll(data?: {
    periodStart?: string;
    periodEnd?: string;
  }): Promise<TriggerResponse> {
    const response = await apiClient.post<TriggerResponse>('/collection/trigger-all', data);
    return response.data;
  },

  async backfill(data: {
    subscriptionId: string;
    from: string;
    to: string;
  }): Promise<BackfillResponse> {
    const response = await apiClient.post<BackfillResponse>('/collection/backfill', data);
    return response.data;
  },

  async backfillAll(data: {
    from: string;
    to: string;
  }): Promise<BackfillResponse> {
    const response = await apiClient.post<BackfillResponse>('/collection/backfill-all', data);
    return response.data;
  },

  async stop(data: {
    subscriptionIds: string[];
  }): Promise<StopResponse> {
    const response = await apiClient.post<StopResponse>('/collection/stop', data);
    return response.data;
  },

  async stopAll(): Promise<StopResponse> {
    const response = await apiClient.post<StopResponse>('/collection/stop-all');
    return response.data;
  },

  async getState(): Promise<CollectionState> {
    const response = await apiClient.get<CollectionState>('/collection/state');
    return response.data;
  },

  async getLogs(params?: {
    subscriptionId?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedCollectionLogs> {
    const response = await apiClient.get<PaginatedCollectionLogs>('/collection/logs', {
      params,
    });
    return response.data;
  },

  async pauseCron(): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>('/collection/cron/pause');
    return response.data;
  },

  async resumeCron(): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>('/collection/cron/resume');
    return response.data;
  },

  async getCronState(): Promise<CronState> {
    const response = await apiClient.get<CronState>('/collection/cron/state');
    return response.data;
  },
};
