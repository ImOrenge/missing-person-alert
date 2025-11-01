/**
 * API 클라이언트 설정
 * Guest ID를 자동으로 헤더에 포함
 */

import axios from 'axios';
import { getOrCreateGuestId } from '../utils/guestId';
import { getAuth } from 'firebase/auth';

// API 베이스 URL
const API_BASE_URL = process.env.REACT_APP_API_URL || '';

// Axios 인스턴스 생성
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 요청 인터셉터: Guest ID 및 인증 토큰 자동 추가
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;

      if (currentUser) {
        // 인증된 사용자: Firebase ID 토큰 추가
        const token = await currentUser.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      } else {
        // 비로그인 사용자: Guest ID 추가
        const guestId = getOrCreateGuestId();
        config.headers['x-guest-id'] = guestId;
      }

      return config;
    } catch (error) {
      console.error('❌ API 요청 인터셉터 오류:', error);
      return config;
    }
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 응답 인터셉터: 에러 핸들링
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      // 서버 응답이 있는 경우
      console.error('❌ API 응답 오류:', {
        status: error.response.status,
        data: error.response.data,
        url: error.config?.url
      });

      // 401 Unauthorized: 토큰 만료 또는 인증 실패
      if (error.response.status === 401) {
        console.warn('⚠️ 인증 실패 - 로그인이 필요합니다');
      }

      // 403 Forbidden: 권한 부족
      if (error.response.status === 403) {
        console.warn('⚠️ 권한 부족 - 접근이 거부되었습니다');
      }

      // 429 Too Many Requests: Rate Limit
      if (error.response.status === 429) {
        console.warn('⚠️ 요청이 너무 많습니다 - 잠시 후 다시 시도해주세요');
      }
    } else if (error.request) {
      // 요청은 보냈지만 응답을 받지 못한 경우
      console.error('❌ 네트워크 오류:', error.message);
    } else {
      // 요청 설정 중 오류 발생
      console.error('❌ 요청 설정 오류:', error.message);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
