import { apiClient } from '@/api/client';
import type {
  Subscription,
  SubscriptionDetail,
  SubscriptionEmployee,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  CreateEmployeeDto,
  FieldMapping,
  UpdateFieldMappingDto,
} from '@/types/subscription';

export const subscriptionsApi = {
  async list(params?: { active?: boolean }): Promise<Subscription[]> {
    const response = await apiClient.get<Subscription[]>('/subscriptions', { params });
    return response.data;
  },

  async get(id: string): Promise<SubscriptionDetail> {
    const response = await apiClient.get<SubscriptionDetail>(`/subscriptions/${id}`);
    return response.data;
  },

  async create(data: CreateSubscriptionDto): Promise<SubscriptionDetail> {
    const response = await apiClient.post<SubscriptionDetail>('/subscriptions', data);
    return response.data;
  },

  async update(id: string, data: UpdateSubscriptionDto): Promise<SubscriptionDetail> {
    const response = await apiClient.patch<SubscriptionDetail>(`/subscriptions/${id}`, data);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/subscriptions/${id}`);
  },

  async addEmployees(id: string, employees: CreateEmployeeDto[]): Promise<SubscriptionEmployee[]> {
    const response = await apiClient.post<SubscriptionEmployee[]>(
      `/subscriptions/${id}/employees`,
      { employees },
    );
    return response.data;
  },

  async updateEmployee(
    id: string,
    employeeId: string,
    data: { isActive?: boolean },
  ): Promise<SubscriptionEmployee> {
    const response = await apiClient.patch<SubscriptionEmployee>(
      `/subscriptions/${id}/employees/${employeeId}`,
      data,
    );
    return response.data;
  },

  async removeEmployee(id: string, employeeId: string): Promise<void> {
    await apiClient.delete(`/subscriptions/${id}/employees/${employeeId}`);
  },

  async getFieldMapping(id: string): Promise<FieldMapping> {
    const response = await apiClient.get<FieldMapping>(`/subscriptions/${id}/field-mapping`);
    return response.data;
  },

  async updateFieldMapping(id: string, data: UpdateFieldMappingDto): Promise<FieldMapping> {
    const response = await apiClient.put<FieldMapping>(
      `/subscriptions/${id}/field-mapping`,
      data,
    );
    return response.data;
  },
};
