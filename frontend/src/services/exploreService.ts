import apiClient from './apiClient';
import type { PublicMapReportDto } from '../types/publicReport';

export interface PublicMapBounds { west: number; south: number; east: number; north: number; zoom: number; }

export interface PublicReportFeedResponse {
  items: PublicMapReportDto[];
  total: number;
  capped: boolean;
}

const KOREA_BOUNDS: PublicMapBounds = { west: 124, south: 33, east: 132, north: 39.5, zoom: 7 };

export const fetchPublicMapReports = async (signal?: AbortSignal, bounds: PublicMapBounds = KOREA_BOUNDS): Promise<PublicMapReportDto[]> => {
  const response = await apiClient.get<{ success: true; items: PublicMapReportDto[] }>('/api/v2/explore/reports', {
    params: { ...bounds, limit: 200 }, signal,
  });
  return response.data.items;
};

export const fetchPublicReportFeed = async (signal?: AbortSignal): Promise<PublicReportFeedResponse> => {
  const response = await apiClient.get<{ success: true } & PublicReportFeedResponse>('/api/v2/explore/reports', {
    params: { ...KOREA_BOUNDS, limit: 200 }, signal,
  });
  return {
    items: response.data.items,
    total: response.data.total,
    capped: response.data.capped,
  };
};
