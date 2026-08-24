import { getAuth } from 'firebase/auth';
import apiClient from './apiClient';
import type { AdminReportDetail, AdminReportQueueItem, DecryptedReportContact } from '../types/adminReporting';

const headers = async () => {
  const user = getAuth().currentUser;
  if (!user) throw new Error('로그인이 필요합니다.');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
};

export const listAdminReportQueue = async (status: string, signal?: AbortSignal) => {
  const response = await apiClient.get<{ success: true; reports: AdminReportQueueItem[] }>('/api/v2/admin/reports', { params: { status }, headers: await headers(), signal });
  return response.data.reports;
};

export const getAdminReportDetail = async (reportId: string, signal?: AbortSignal) => {
  const response = await apiClient.get<{ success: true; report: AdminReportDetail }>(`/api/v2/admin/reports/${encodeURIComponent(reportId)}`, { headers: { ...(await headers()), 'x-access-purpose': 'moderation_review' }, signal });
  return response.data.report;
};

export const requestReportInformation = async (reportId: string, expectedVersion: number, requestMessage: string) => {
  await apiClient.post(`/api/v2/admin/reports/${encodeURIComponent(reportId)}/needs-information`, { expectedVersion, requestMessage }, { headers: await headers() });
};

export const startReportReview = async (reportId: string, expectedVersion: number) => {
  await apiClient.post(`/api/v2/admin/reports/${encodeURIComponent(reportId)}/start-review`, { expectedVersion }, { headers: await headers() });
};

export const rejectReport = async (reportId: string, expectedVersion: number, reason: string) => {
  await apiClient.post(`/api/v2/admin/reports/${encodeURIComponent(reportId)}/reject`, { expectedVersion, reason }, { headers: await headers() });
};

export const approvePublicReport = async (reportId: string, input: { expectedVersion: number; publicRadiusM: number; approvedMediaIds: string[] }) => {
  await apiClient.post(`/api/v2/admin/reports/${encodeURIComponent(reportId)}/approve`, input, { headers: await headers() });
};

export const approveReportMedia = async (reportId: string, mediaId: string, expectedVersion: number, reviewNote: string) => {
  const response = await apiClient.post<{success: true; version: number}>(`/api/v2/admin/reports/${encodeURIComponent(reportId)}/media/${encodeURIComponent(mediaId)}/approve`, {expectedVersion, reviewNote}, {headers: await headers()});
  return response.data.version;
};

export const markReportDuplicate = async (reportId: string, expectedVersion: number, primaryReportId: string, reason: string) => {
  await apiClient.post(`/api/v2/admin/reports/${encodeURIComponent(reportId)}/duplicate`, {expectedVersion, primaryReportId, reason}, {headers: await headers()});
};

export const forwardReportToAgency = async (reportId: string, input: {expectedVersion: number; agencyName: string; channel: string; externalReceiptNumber?: string; outcome: string}) => {
  await apiClient.post(`/api/v2/admin/reports/${encodeURIComponent(reportId)}/forward`, input, {headers: await headers()});
};

export const confirmReport = async (reportId: string, expectedVersion: number, confirmationReference: string) => {
  await apiClient.post(`/api/v2/admin/reports/${encodeURIComponent(reportId)}/confirm`, {expectedVersion, confirmationReference}, {headers: await headers()});
};

export const archiveReport = async (reportId: string, expectedVersion: number, reason: string) => {
  await apiClient.post(`/api/v2/admin/reports/${encodeURIComponent(reportId)}/archive`, {expectedVersion, reason}, {headers: await headers()});
};

export const unpublishReport = async (reportId: string, expectedVersion: number, reason: string) => {
  await apiClient.post(`/api/v2/admin/reports/${encodeURIComponent(reportId)}/unpublish`, {expectedVersion, reason}, {headers: await headers()});
};

export const decryptReportContact = async (reportId: string, purpose: 'agency_callback' | 'identity_verification' | 'legal_request') => {
  const response = await apiClient.post<{success: true; contact: DecryptedReportContact}>(`/api/v2/admin/reports/${encodeURIComponent(reportId)}/contact`, {purpose}, {headers: await headers()});
  return response.data.contact;
};
