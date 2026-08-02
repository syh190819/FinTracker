import apiClient from './apiClient';

export const importExportApi = {
  exportAll: () =>
    apiClient.get<any>('/export').then((r) => r.data),

  importAll: (data: any) =>
    apiClient.post('/import', data),
};
