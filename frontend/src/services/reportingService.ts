import { getAuth } from 'firebase/auth';
import apiClient from './apiClient';
import type { CreateReportV2Input, CreateReportV2Response, OwnReportDetailDto, OwnReportListItemDto } from '../types/reporting';

const authHeaders = async () => {
  const user = getAuth().currentUser;
  if (!user) throw new Error('로그인이 필요합니다.');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
};

export const createReportV2 = async (input: CreateReportV2Input, recaptchaToken: string): Promise<CreateReportV2Response> => {
  const response = await apiClient.post<CreateReportV2Response>('/api/v2/reports', input, {
    headers: { ...(await authHeaders()), 'x-recaptcha-token': recaptchaToken, 'x-recaptcha-action': 'report_submit' },
  });
  return response.data;
};

export const listOwnReportsV2 = async (signal?: AbortSignal): Promise<OwnReportListItemDto[]> => {
  const response = await apiClient.get<{ success: true; reports: OwnReportListItemDto[] }>('/api/v2/reports/my', {
    headers: await authHeaders(), signal,
  });
  return response.data.reports;
};

export const getOwnReportDetailV2 = async (reportId: string, signal?: AbortSignal): Promise<OwnReportDetailDto> => {
  const response = await apiClient.get<{ success: true; report: OwnReportDetailDto }>(`/api/v2/reports/${encodeURIComponent(reportId)}`, {
    headers: await authHeaders(), signal,
  });
  return response.data.report;
};

export const withdrawOwnReportV2 = async (reportId: string): Promise<void> => {
  await apiClient.post(`/api/v2/reports/${encodeURIComponent(reportId)}/withdraw`, {}, { headers: await authHeaders() });
};

export const submitAdditionalReportInformation = async (reportId: string, expectedVersion: number, message: string): Promise<void> => {
  await apiClient.post(`/api/v2/reports/${encodeURIComponent(reportId)}/additional-information`, { expectedVersion, message }, { headers: await authHeaders() });
};
