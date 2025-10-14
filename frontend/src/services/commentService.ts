import { getAuth } from 'firebase/auth';
import { toast } from 'react-toastify';
import { executeRecaptcha, loadRecaptchaScript } from '../utils/recaptcha';
import type { CommentType } from '../types/comment';

type TimestampObject = {
  seconds?: number;
  _seconds?: number;
  nanoseconds?: number;
  _nanoseconds?: number;
};

export interface CommentDto {
  commentId: string;
  missingPersonId: string;
  userId: string;
  nickname: string;
  isAnonymous: boolean;
  content: string;
  type: CommentType;
  createdAt: string;
  updatedAt: string;
  likes: number;
  likedBy: string[];
  isEdited: boolean;
  isDeleted: boolean;
  reported: boolean;
  reportCount: number;
  reportedBy: string[];
  isHidden: boolean;
}

export interface CommentModel extends Omit<CommentDto, 'createdAt' | 'updatedAt'> {
  createdAt: Date;
  updatedAt: Date;
}

const API_BASE = process.env.REACT_APP_API_URL || '';

const toDate = (value: TimestampObject | string): Date => {
  if (!value) {
    return new Date();
  }

  if (typeof value === 'string') {
    return new Date(value);
  }

  const seconds = value.seconds ?? value._seconds;
  const nanos = value.nanoseconds ?? value._nanoseconds ?? 0;
  if (typeof seconds === 'number') {
    return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000));
  }

  return new Date();
};

const mapComment = (raw: any): CommentModel => ({
  commentId: raw.commentId,
  missingPersonId: raw.missingPersonId,
  userId: raw.userId,
  nickname: raw.nickname,
  isAnonymous: raw.isAnonymous,
  content: raw.content,
  type: raw.type,
  createdAt: toDate(raw.createdAt),
  updatedAt: toDate(raw.updatedAt),
  likes: raw.likes ?? 0,
  likedBy: Array.isArray(raw.likedBy) ? raw.likedBy : [],
  isEdited: !!raw.isEdited,
  isDeleted: !!raw.isDeleted,
  reported: !!raw.reported,
  reportCount: raw.reportCount ?? 0,
  reportedBy: Array.isArray(raw.reportedBy) ? raw.reportedBy : [],
  isHidden: !!raw.isHidden
});

const getAuthToken = async () => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('로그인이 필요합니다');
  }
  return user.getIdToken();
};

export interface FetchCommentsOptions {
  type?: CommentType | 'all';
  order?: 'latest' | 'popular';
  limit?: number;
}

export const fetchComments = async (missingPersonId: string, options: FetchCommentsOptions = {}) => {
  const params = new URLSearchParams();
  if (options.type && options.type !== 'all') {
    params.append('type', options.type);
  }
  if (options.order) {
    params.append('order', options.order);
  }
  if (options.limit) {
    params.append('limit', String(options.limit));
  }

  const response = await fetch(`${API_BASE}/api/comments/${missingPersonId}?${params.toString()}`, {
    method: 'GET'
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || '댓글 목록을 불러오지 못했습니다');
  }

  const data = await response.json();
  return (data.comments as any[]).map(mapComment);
};

export const createComment = async (missingPersonId: string, payload: {
  content: string;
  type: CommentType;
  isAnonymous: boolean;
}) => {
  await loadRecaptchaScript();
  const [token, recaptcha] = await Promise.all([
    getAuthToken(),
    executeRecaptcha('comment_create')
  ]);

  const response = await fetch(`${API_BASE}/api/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-recaptcha-token': recaptcha,
      'x-recaptcha-action': 'comment'
    },
    body: JSON.stringify({
      missingPersonId,
      content: payload.content,
      type: payload.type,
      isAnonymous: payload.isAnonymous
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || '댓글 작성에 실패했습니다');
  }

  const data = await response.json();
  return mapComment(data.comment);
};

export const updateComment = async (commentId: string, content: string) => {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE}/api/comments/${commentId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ content })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || '댓글 수정에 실패했습니다');
  }

  const data = await response.json();
  return mapComment(data.comment);
};

export const deleteComment = async (commentId: string) => {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE}/api/comments/${commentId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || '댓글 삭제에 실패했습니다');
  }
};

export const toggleLikeComment = async (commentId: string) => {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE}/api/comments/${commentId}/like`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || '공감 처리에 실패했습니다');
  }

  return response.json() as Promise<{ liked: boolean; likes: number }>;
};

export const reportComment = async (commentId: string, reason: CommentType | 'spam' | 'inappropriate' | 'false' | 'other', description?: string) => {
  await loadRecaptchaScript();
  const [token, recaptcha] = await Promise.all([
    getAuthToken(),
    executeRecaptcha('comment_report')
  ]);

  const response = await fetch(`${API_BASE}/api/comments/${commentId}/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-recaptcha-token': recaptcha,
      'x-recaptcha-action': 'comment'
    },
    body: JSON.stringify({
      reason,
      description
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || '신고 처리에 실패했습니다');
  }
};

export const ensureCommentAuth = () => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    toast.error('로그인이 필요합니다');
    throw new Error('로그인이 필요합니다');
  }
  return user;
};
