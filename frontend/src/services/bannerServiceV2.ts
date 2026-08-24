import apiClient from './apiClient';
import type { BannerDto } from '../types/banner';
import { getAuth } from 'firebase/auth';

export const fetchPublicBanners = async (signal?: AbortSignal): Promise<BannerDto[]> => {
  const response = await apiClient.get<{ success: true; banners: BannerDto[] }>('/api/v2/banners', { signal });
  return response.data.banners;
};

export interface AdminBannerRecord extends BannerDto {
  state: 'draft' | 'pending_approval' | 'scheduled' | 'published' | 'ended' | 'archived';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const adminHeaders = async () => {
  const user = getAuth().currentUser;
  if (!user) throw new Error('로그인이 필요합니다.');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
};

export const fetchAdminBanners = async (): Promise<AdminBannerRecord[]> => {
  const response = await apiClient.get<{ success: true; banners: AdminBannerRecord[] }>('/api/v2/admin/banners', { headers: await adminHeaders() });
  return response.data.banners;
};

export const createAdminBanner = async (input: Omit<BannerDto, 'id' | 'revision' | 'approvedAt'>) => {
  const response = await apiClient.post<{ success: true; bannerId: string }>('/api/v2/admin/banners', input, { headers: await adminHeaders() });
  return response.data.bannerId;
};

export const transitionAdminBanner = async (bannerId: string, action: 'submit' | 'approve' | 'end') => {
  await apiClient.post(`/api/v2/admin/banners/${encodeURIComponent(bannerId)}/${action}`, {}, { headers: await adminHeaders() });
};
