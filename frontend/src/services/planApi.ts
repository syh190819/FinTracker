import apiClient from './apiClient';
import type { Plan, CreatePlan, UpdatePlan } from '../types/api';

export const planApi = {
  list: (params?: { archived?: boolean }) =>
    apiClient.get<Plan[]>('/plans', { params }).then((r) => r.data),

  create: (data: CreatePlan) =>
    apiClient.post<Plan>('/plans', data).then((r) => r.data),

  update: (id: number, data: UpdatePlan) =>
    apiClient.put<Plan>(`/plans/${id}`, data).then((r) => r.data),

  delete: (id: number) => apiClient.delete(`/plans/${id}`),
};
