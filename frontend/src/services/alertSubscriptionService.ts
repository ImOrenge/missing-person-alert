import { getAuth } from 'firebase/auth';
import apiClient from './apiClient';
import type { AlertSubscriptionSettings } from '../types/alerts';

const headers = async () => {
  const user = getAuth().currentUser;
  if (!user) throw new Error('로그인이 필요합니다.');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
};

export const getAlertSubscriptions = async (signal?: AbortSignal): Promise<AlertSubscriptionSettings> => {
  const response = await apiClient.get<{ success: true; subscription: AlertSubscriptionSettings }>('/api/v2/alerts/subscriptions', { headers: await headers(), signal });
  return response.data.subscription;
};

export const saveAlertSubscriptions = async (settings: Omit<AlertSubscriptionSettings, 'deliveryReady'>): Promise<boolean> => {
  const response = await apiClient.put<{ success: true; deliveryReady: boolean }>('/api/v2/alerts/subscriptions', settings, { headers: await headers() });
  return response.data.deliveryReady;
};
