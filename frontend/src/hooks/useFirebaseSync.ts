import { useEffect } from 'react';
import { database, ref, onValue } from '../services/firebase';
import { useEmergencyStore } from '../stores/emergencyStore';
import { MissingPerson } from '../types';

/**
 * Firebase Realtime Database와 동기화하는 커스텀 훅
 */
export function useFirebaseSync() {
  const addMissingPersons = useEmergencyStore(state => state.addMissingPersons);

  useEffect(() => {
    console.log('🔥 Firebase 실시간 동기화 시작...');

    // Firebase에서 실종자 데이터 실시간 구독
    const missingPersonsRef = ref(database, 'missingPersons');

    const unsubscribe = onValue(missingPersonsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const persons: MissingPerson[] = Object.values(data);

        console.log(`🔥 Firebase에서 ${persons.length}건 수신`);

        // Zustand store에 추가
        addMissingPersons(persons);
      } else {
        console.log('🔥 Firebase에 데이터 없음');
      }
    }, (error) => {
      console.error('❌ Firebase 구독 오류:', error);
    });

    // 클린업: 컴포넌트 언마운트 시 구독 해제
    return () => {
      console.log('🔥 Firebase 구독 해제');
      unsubscribe();
    };
  }, [addMissingPersons]);
}
