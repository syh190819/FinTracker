import apiClient from './apiClient';
import type { Todo, CreateTodo, UpdateTodo } from '../types/api';

export const todoApi = {
  list: (params?: { done?: boolean; plan_id?: number; date?: string }) =>
    apiClient.get<Todo[]>('/todos', { params }).then((r) => r.data),

  create: (data: CreateTodo) =>
    apiClient.post<Todo>('/todos', data).then((r) => r.data),

  update: (id: number, data: UpdateTodo) =>
    apiClient.put<Todo>(`/todos/${id}`, data).then((r) => r.data),

  delete: (id: number) => apiClient.delete(`/todos/${id}`),
};
