import { useEffect, useCallback, useRef } from 'react';
import { useEmergencyStore } from '../stores/emergencyStore';
import { fetchMissingPersons } from '../services/apiService';

/**
 * 안전드림 API에서 직접 실종자 데이터를 가져오는 훅
 * 10분마다 자동으로 새로고침합니다
 */
export function useApiData() {
  const addMissingPersons = useEmergencyStore(state => state.addMissingPersons);
  const setConnectionStatus = useEmergencyStore(state => state.setConnectionStatus);
  const intervalRef = useRef<NodeJS.Timeout>();

  const loadData = useCallback(async () => {
    try {
      console.log('🔄 실종자 데이터 로딩 시작...');
      setConnectionStatus(true);

      const persons = await fetchMissingPersons();

      if (persons.length > 0) {
        addMissingPersons(persons);
        console.log(`✅ ${persons.length}건 로드 완료`);
      } else {
        console.log('📭 데이터 없음');
      }
    } catch (error) {
      console.error('❌ 데이터 로딩 실패:', error);
      setConnectionStatus(false);
    }
  }, [addMissingPersons, setConnectionStatus]);

  useEffect(() => {
    // 초기 데이터 로드
    loadData();

    // 10분마다 자동 새로고침
    intervalRef.current = setInterval(() => {
      console.log('⏰ 10분 경과 - 자동 새로고침');
      loadData();
    }, 10 * 60 * 1000); // 10분

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [loadData]);

  return {
    isConnected: true,
    refresh: loadData
  };
}
