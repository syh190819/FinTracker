import apiClient from './apiClient';
import type { Expense, ExpenseQuery, CreateExpense, UpdateExpense } from '../types/api';

export const expenseApi = {
  list: (query?: ExpenseQuery) =>
    apiClient.get<Expense[]>('/expenses', { params: query }).then((r) => r.data),

  create: (data: CreateExpense) =>
    apiClient.post<Expense>('/expenses', data).then((r) => r.data),

  update: (id: number, data: UpdateExpense) =>
    apiClient.put<Expense>(`/expenses/${id}`, data).then((r) => r.data),

  delete: (id: number) => apiClient.delete(`/expenses/${id}`),
};
