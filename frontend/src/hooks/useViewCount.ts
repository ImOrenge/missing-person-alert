import { useEffect, useCallback, useState } from 'react';
import { getGuestId } from '../utils/guestId';
import { getAuth } from 'firebase/auth';

interface ViewCountResult {
  viewCount: number;
  viewStats?: {
    total: number;
    lastViewed?: number;
    uniqueViewers?: number;
  };
  loading: boolean;
  error: string | null;
}

/**
 * 실종자 조회수 추적 및 표시 훅
 *
 * @param personId - 실종자 ID
 * @param autoTrack - 자동으로 조회수 증가 여부 (기본값: true)
 * @returns 조회수 정보와 함수들
 */
export const useViewCount = (
  personId: string | null,
  autoTrack: boolean = true
): ViewCountResult & { incrementView: () => Promise<void> } => {
  const [viewCount, setViewCount] = useState<number>(0);
  const [viewStats, setViewStats] = useState<ViewCountResult['viewStats']>();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasTracked, setHasTracked] = useState<boolean>(false);

  const API_BASE_URL = process.env.REACT_APP_API_URL || '';

  /**
   * 조회수 증가 함수
   */
  const incrementView = useCallback(async () => {
    if (!personId || hasTracked) {
      console.log('[useViewCount] 조회수 증가 스킵:', { personId, hasTracked });
      return;
    }

    try {
      const guestId = getGuestId();
      const auth = getAuth();
      const currentUser = auth.currentUser;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (guestId) {
        headers['x-guest-id'] = guestId;
      }

      console.log('[useViewCount] 조회수 증가 요청:', { personId, guestId, userId: currentUser?.uid });

      const response = await fetch(`${API_BASE_URL}/api/views/${personId}/increment`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          guestId,
          userId: currentUser?.uid
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[useViewCount] 조회수 증가 실패:', response.status, errorText);
        throw new Error('조회수 증가 실패');
      }

      const data = await response.json();
      console.log('[useViewCount] 조회수 증가 성공:', data);

      if (data.success) {
        setViewCount(data.viewCount);
        setViewStats(data.viewStats);
        setHasTracked(true);
      }
    } catch (err) {
      console.error('[useViewCount] 조회수 증가 오류:', err);
      setError(err instanceof Error ? err.message : '조회수 증가에 실패했습니다.');
    }
  }, [personId, hasTracked, API_BASE_URL]);

  /**
   * 조회수 조회 함수
   */
  const fetchViewCount = useCallback(async () => {
    if (!personId) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('[useViewCount] 조회수 조회 요청:', personId);

      const response = await fetch(`${API_BASE_URL}/api/views/${personId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[useViewCount] 조회수 조회 실패:', response.status, errorText);
        throw new Error('조회수 조회 실패');
      }

      const data = await response.json();
      console.log('[useViewCount] 조회수 조회 성공:', data);
      setViewCount(data.viewCount || 0);
      setViewStats(data.viewStats);
    } catch (err) {
      console.error('[useViewCount] 조회수 조회 오류:', err);
      setError(err instanceof Error ? err.message : '조회수 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [personId, API_BASE_URL]);

  /**
   * 컴포넌트 마운트 시 자동 조회수 추적
   */
  useEffect(() => {
    if (!personId) {
      return;
    }

    // 먼저 현재 조회수를 가져옴
    fetchViewCount();

    // 자동 추적이 활성화된 경우 조회수 증가
    if (autoTrack && !hasTracked) {
      // 약간의 지연 후 조회수 증가 (실제 사용자 확인)
      const timer = setTimeout(() => {
        incrementView();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [personId, autoTrack, fetchViewCount, incrementView, hasTracked]);

  return {
    viewCount,
    viewStats,
    loading,
    error,
    incrementView
  };
};

/**
 * 조회수 포맷팅 헬퍼 함수
 */
export const formatViewCount = (count: number): string => {
  if (count < 1000) {
    return count.toString();
  }
  if (count < 10000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  if (count < 1000000) {
    return `${Math.floor(count / 1000)}K`;
  }
  return `${(count / 1000000).toFixed(1)}M`;
};
