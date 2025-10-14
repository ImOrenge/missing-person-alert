import { getAuth } from 'firebase/auth';
import { executeRecaptcha, loadRecaptchaScript } from '../utils/recaptcha';

interface RawTimestamp {
  seconds?: number;
  nanoseconds?: number;
  _seconds?: number;
  _nanoseconds?: number;
}

const API_BASE = process.env.REACT_APP_API_URL || '';

const toDate = (value: RawTimestamp | string | undefined): Date => {
  if (!value) return new Date();
  if (typeof value === 'string') return new Date(value);
  const seconds = value.seconds ?? value._seconds;
  const nanos = value.nanoseconds ?? value._nanoseconds ?? 0;
  return typeof seconds === 'number'
    ? new Date(seconds * 1000 + Math.floor(nanos / 1_000_000))
    : new Date();
};

export interface CommentReportRecord {
  reportId: string;
  commentId: string;
  reportedBy: string;
  reason: 'spam' | 'inappropriate' | 'false' | 'other';
  description?: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  comment?: {
    content?: string;
    nickname?: string;
    type?: string;
    reportCount?: number;
    isHidden?: boolean;
  };
}

const requireAdminToken = async () => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('인증이 필요합니다');
  }
  return user.getIdToken();
};

export const fetchCommentReports = async (status: 'pending' | 'resolved' | 'dismissed' = 'pending') => {
  const token = await requireAdminToken();
  const response = await fetch(`${API_BASE}/api/comment-reports?status=${status}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || '신고 목록을 불러오지 못했습니다');
  }

  const payload = await response.json();
  return (payload.reports ?? []).map((report: any) => ({
    reportId: report.reportId,
    commentId: report.commentId,
    reportedBy: report.reportedBy,
    reason: report.reason,
    description: report.description,
    status: report.status,
    createdAt: toDate(report.createdAt),
    resolvedAt: report.resolvedAt ? toDate(report.resolvedAt) : undefined,
    resolvedBy: report.resolvedBy,
    comment: report.comment,
  })) as CommentReportRecord[];
};

export const resolveCommentReport = async (reportId: string, status: 'resolved' | 'dismissed', hideComment: boolean) => {
  const token = await requireAdminToken();
  const response = await fetch(`${API_BASE}/api/comment-reports/${reportId}/resolve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status, hideComment })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || '신고 처리를 완료하지 못했습니다');
  }
};

export const moderateCommentVisibility = async (commentId: string, isHidden: boolean) => {
  const token = await requireAdminToken();
  const response = await fetch(`${API_BASE}/api/comments/${commentId}/moderation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ isHidden })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || '댓글 상태 변경에 실패했습니다');
  }
};

export const reportCommentAsAdmin = async (commentId: string, reason: 'spam' | 'inappropriate' | 'false' | 'other', description?: string) => {
  await loadRecaptchaScript();
  const [token, recaptchaToken] = await Promise.all([
    requireAdminToken(),
    executeRecaptcha('comment_report_admin')
  ]);

  const response = await fetch(`${API_BASE}/api/comments/${commentId}/report`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-recaptcha-token': recaptchaToken,
      'x-recaptcha-action': 'comment'
    },
    body: JSON.stringify({ reason, description })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || '신고 제출에 실패했습니다');
  }
};
