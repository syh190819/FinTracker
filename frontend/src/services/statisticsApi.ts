import apiClient from './apiClient';
import type { MonthlyTotal, CategoryTotal, BudgetVsActual } from '../types/api';

export const statisticsApi = {
  monthly: (year?: number) =>
    apiClient.get<MonthlyTotal[]>('/statistics/monthly', { params: { year } }).then((r) => r.data),

  category: (month?: string) =>
    apiClient.get<CategoryTotal[]>('/statistics/category', { params: { month } }).then((r) => r.data),

  budgetVsActual: (month?: string) =>
    apiClient
      .get<BudgetVsActual[]>('/statistics/budget-vs-actual', { params: { month } })
      .then((r) => r.data),
};
