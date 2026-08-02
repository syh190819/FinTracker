import apiClient from './apiClient';
import type {
  PlanWithBalance,
  DepositPlan,
  DepositTransaction,
  CreateDepositPlan,
  UpdateDepositPlan,
  CreateTransaction,
} from '../types/api';

export const depositApi = {
  listPlans: () =>
    apiClient.get<PlanWithBalance[]>('/deposit-plans').then((r) => r.data),

  createPlan: (data: CreateDepositPlan) =>
    apiClient.post<DepositPlan>('/deposit-plans', data).then((r) => r.data),

  updatePlan: (id: number, data: UpdateDepositPlan) =>
    apiClient.put<DepositPlan>(`/deposit-plans/${id}`, data).then((r) => r.data),

  deletePlan: (id: number) => apiClient.delete(`/deposit-plans/${id}`),

  listTransactions: (planId: number) =>
    apiClient.get<DepositTransaction[]>(`/deposit-plans/${planId}/transactions`).then((r) => r.data),

  createTransaction: (planId: number, data: CreateTransaction) =>
    apiClient
      .post<DepositTransaction>(`/deposit-plans/${planId}/transactions`, data)
      .then((r) => r.data),
};
