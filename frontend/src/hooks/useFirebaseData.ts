import { useEffect } from 'react';
import { off } from 'firebase/database';
import { database, ref, onValue } from '../services/firebase';
import { useEmergencyStore } from '../stores/emergencyStore';
import { MissingPerson } from '../types';

/**
 * Firebase Realtime Database에서 직접 실종자 데이터를 읽어오는 훅
 * WebSocket 없이도 실시간 업데이트를 받을 수 있습니다
 */
export function useFirebaseData() {
  const addMissingPersons = useEmergencyStore(state => state.addMissingPersons);
  const setConnectionStatus = useEmergencyStore(state => state.setConnectionStatus);

  useEffect(() => {
    console.log('🔥 Firebase Realtime Database 연결 시작...');

    const missingPersonsRef = ref(database, 'missingPersons');

    // 실시간 데이터 리스너 등록
    const unsubscribe = onValue(
      missingPersonsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const persons: MissingPerson[] = Object.values(data);

          console.log(`🔥 Firebase에서 ${persons.length}건 수신`);

          // 최신순으로 정렬 (updatedAt 기준)
          const sortedPersons = persons.sort((a, b) => {
            return (b.updatedAt || 0) - (a.updatedAt || 0);
          });

          addMissingPersons(sortedPersons);
          setConnectionStatus(true);
        } else {
          console.log('📭 Firebase에 데이터 없음');
          setConnectionStatus(true);
        }
      },
      (error) => {
        console.error('❌ Firebase 연결 오류:', error);
        setConnectionStatus(false);
      }
    );

    // 컴포넌트 언마운트 시 리스너 제거
    return () => {
      console.log('🔥 Firebase 리스너 해제');
      off(missingPersonsRef);
      unsubscribe();
    };
  }, [addMissingPersons, setConnectionStatus]);

  return {
    isConnected: true
  };
}
