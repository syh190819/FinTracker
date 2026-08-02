import apiClient from './apiClient';
import type { Budget, CreateBudget, UpdateBudget } from '../types/api';

export const budgetApi = {
  list: (month?: string) =>
    apiClient.get<Budget[]>('/budgets', { params: { month } }).then((r) => r.data),

  create: (data: CreateBudget) =>
    apiClient.post<Budget>('/budgets', data).then((r) => r.data),

  update: (id: number, data: UpdateBudget) =>
    apiClient.put<Budget>(`/budgets/${id}`, data).then((r) => r.data),

  delete: (id: number) => apiClient.delete(`/budgets/${id}`),
};
