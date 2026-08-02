import apiClient from './apiClient';
import type { WorkbenchSummary } from '../types/api';

export const workbenchApi = {
  summary: () =>
    apiClient.get<WorkbenchSummary>('/workbench/summary').then((r) => r.data),
};
