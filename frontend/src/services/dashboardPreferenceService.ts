import { getAuth } from 'firebase/auth';
import apiClient from './apiClient';
import type { DashboardPreferences } from '../types/dashboardPreferences';

const headers = async () => {
  const user = getAuth().currentUser;
  if (!user) throw new Error('로그인이 필요합니다.');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
};

export const getDashboardPreferences = async (signal?: AbortSignal) => {
  const response = await apiClient.get<{ success: true; preferences: DashboardPreferences }>('/api/v2/dashboard/preferences', { headers: await headers(), signal });
  return response.data.preferences;
};

export const saveDashboardPreferences = async (preferences: DashboardPreferences) => {
  const response = await apiClient.put<{ success: true; preferences: DashboardPreferences }>('/api/v2/dashboard/preferences', preferences, { headers: await headers() });
  return response.data.preferences;
};
