import apiClient from './apiClient';
import type { UpdateUsernameRequest, UpdatePasswordRequest } from '../types/api';

export const profileApi = {
  updateUsername: (data: UpdateUsernameRequest) =>
    apiClient.put('/profile/username', data).then((r) => r.data),

  updatePassword: (data: UpdatePasswordRequest) =>
    apiClient.put('/profile/password', data).then((r) => r.data),
};
