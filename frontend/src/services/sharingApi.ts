import apiClient from './apiClient';
import type { SharingWithUsername, SharingInviteResponse, SharingScopeUpdate } from '../types/api';

export const sharingApi = {
  invite: () =>
    apiClient.post<SharingInviteResponse>('/share/invite').then((r) => r.data),

  accept: (inviteCode: string) =>
    apiClient.post('/share/accept', { invite_code: inviteCode }).then((r) => r.data),

  relationships: () =>
    apiClient.get<SharingWithUsername[]>('/share/relationships').then((r) => r.data),

  updateScope: (id: number, data: SharingScopeUpdate) =>
    apiClient.put(`/share/${id}/scope`, data).then((r) => r.data),

  delete: (id: number) => apiClient.delete(`/share/${id}`),
};
