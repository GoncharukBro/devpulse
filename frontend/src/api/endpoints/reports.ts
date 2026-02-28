import { apiClient } from '@/api/client';
import type {
  OverviewDTO,
  ProjectSummaryDTO,
  ProjectHistoryDTO,
  EmployeeSummaryDTO,
  EmployeeHistoryDTO,
  EmployeeReportDTO,
  PaginatedEmployeeReports,
  EmployeeListItem,
} from '@/types/reports';

export const reportsApi = {
  async getOverview(): Promise<OverviewDTO> {
    const response = await apiClient.get<OverviewDTO>('/reports/overview');
    return response.data;
  },

  async getEmployees(params?: { subscriptionId?: string }): Promise<EmployeeListItem[]> {
    const response = await apiClient.get<EmployeeListItem[]>('/employees', { params });
    return response.data;
  },

  async getProjectSummary(subscriptionId: string): Promise<ProjectSummaryDTO> {
    const response = await apiClient.get<ProjectSummaryDTO>(
      `/reports/projects/${subscriptionId}/summary`,
    );
    return response.data;
  },

  async getProjectHistory(
    subscriptionId: string,
    params?: { weeks?: number },
  ): Promise<ProjectHistoryDTO> {
    const response = await apiClient.get<ProjectHistoryDTO>(
      `/reports/projects/${subscriptionId}/history`,
      { params },
    );
    return response.data;
  },

  async getEmployeeSummary(login: string): Promise<EmployeeSummaryDTO> {
    const response = await apiClient.get<EmployeeSummaryDTO>(
      `/reports/employees/${login}/summary`,
    );
    return response.data;
  },

  async getEmployeeHistory(
    login: string,
    params?: { subscriptionId?: string; weeks?: number },
  ): Promise<EmployeeHistoryDTO> {
    const response = await apiClient.get<EmployeeHistoryDTO>(
      `/reports/employees/${login}/history`,
      { params },
    );
    return response.data;
  },

  async getEmployeeReport(
    login: string,
    params: { subscriptionId: string; periodStart: string },
  ): Promise<EmployeeReportDTO> {
    const response = await apiClient.get<EmployeeReportDTO>(
      `/reports/employees/${login}/report`,
      { params },
    );
    return response.data;
  },

  async getEmployeeReports(
    login: string,
    params?: { subscriptionId?: string; page?: number; limit?: number },
  ): Promise<PaginatedEmployeeReports> {
    const response = await apiClient.get<PaginatedEmployeeReports>(
      `/reports/employees/${login}/reports`,
      { params },
    );
    return response.data;
  },

  async emailPreview(params: {
    type: 'employee' | 'project' | 'team';
    youtrackLogin?: string;
    subscriptionId?: string;
    teamId?: string;
    periodStart?: string;
  }): Promise<{ subject: string; html: string }> {
    const response = await apiClient.post<{ subject: string; html: string }>(
      '/reports/email-preview',
      params,
    );
    return response.data;
  },
};
