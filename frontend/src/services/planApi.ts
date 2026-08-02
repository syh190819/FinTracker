import apiClient from './apiClient';
import type { Plan, CreatePlan, UpdatePlan } from '../types/api';

export const planApi = {
  list: (params?: { archived?: boolean; type?: string }) =>
    apiClient.get<Plan[]>('/plans', { params }).then((r) => r.data),

  create: (data: CreatePlan) =>
    apiClient.post<Plan>('/plans', data).then((r) => r.data),

  update: (id: number, data: UpdatePlan) =>
    apiClient.put<Plan>(`/plans/${id}`, data).then((r) => r.data),

  delete: (id: number) => apiClient.delete(`/plans/${id}`),

  listTransactions: (planId: number) =>
    apiClient
      .get<import('../types/api').DepositTransaction[]>(`/plans/${planId}/transactions`)
      .then((r) => r.data),

  createTransaction: (planId: number, data: import('../types/api').CreateTransaction) =>
    apiClient
      .post<import('../types/api').DepositTransaction>(`/plans/${planId}/transactions`, data)
      .then((r) => r.data),
};
