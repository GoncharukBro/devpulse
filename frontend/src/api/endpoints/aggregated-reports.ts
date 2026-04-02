import { apiClient } from '@/api/client';
import type {
  CreateRequest,
  CreateResponse,
  ListResponse,
  AggregatedReportDTO,
} from '@/types/aggregated-report';

export const aggregatedReportsApi = {
  async create(params: CreateRequest): Promise<CreateResponse> {
    const response = await apiClient.post<CreateResponse>('/aggregated-reports', params);
    return response.data;
  },

  async list(params?: { type?: string; page?: number; limit?: number }): Promise<ListResponse> {
    const response = await apiClient.get<ListResponse>('/aggregated-reports', { params });
    return response.data;
  },

  async getById(id: string): Promise<AggregatedReportDTO> {
    const response = await apiClient.get<AggregatedReportDTO>(`/aggregated-reports/${id}`);
    return response.data;
  },

  async emailPreview(id: string): Promise<{ subject: string; html: string }> {
    const response = await apiClient.get<{ subject: string; html: string }>(`/aggregated-reports/${id}/email-preview`);
    return response.data;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/aggregated-reports/${id}`);
  },
};
