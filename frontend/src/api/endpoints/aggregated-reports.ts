import { apiClient } from '@/api/client';
import type {
  PreviewRequest,
  PreviewResponse,
  CreateRequest,
  CreateResponse,
  ListResponse,
  AggregatedReportDTO,
} from '@/types/aggregated-report';

export const aggregatedReportsApi = {
  async preview(params: PreviewRequest): Promise<PreviewResponse> {
    const response = await apiClient.post<PreviewResponse>('/aggregated-reports/preview', params);
    return response.data;
  },

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

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/aggregated-reports/${id}`);
  },
};
