import apiClient from './apiClient';
import type { Category, CreateCategory, UpdateCategory } from '../types/api';

export const categoryApi = {
  list: () => apiClient.get<Category[]>('/categories').then((r) => r.data),

  create: (data: CreateCategory) =>
    apiClient.post<Category>('/categories', data).then((r) => r.data),

  update: (id: number, data: UpdateCategory) =>
    apiClient.put<Category>(`/categories/${id}`, data).then((r) => r.data),

  delete: (id: number) => apiClient.delete(`/categories/${id}`),
};
