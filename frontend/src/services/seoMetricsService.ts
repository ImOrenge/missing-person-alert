import apiClient from './apiClient';
import type { SeoMetricsResponse } from '../types/seoMetrics';

export type SeoMetricsRange = 7 | 28 | 90;

export const getSeoMetrics = async (range: SeoMetricsRange, signal?: AbortSignal): Promise<SeoMetricsResponse> => {
  const response = await apiClient.get<SeoMetricsResponse>('/api/admin/seo-metrics', {
    params: { range },
    signal,
  });
  return response.data;
};
