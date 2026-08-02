import apiClient from './apiClient';
import type { AuthResponse, LoginRequest, RegisterRequest } from '../types/api';

export const authApi = {
  login: (data: LoginRequest) =>
    apiClient.post<AuthResponse>('/login', data).then((r) => r.data),

  register: (data: RegisterRequest) =>
    apiClient.post<AuthResponse>('/register', data).then((r) => r.data),
};
