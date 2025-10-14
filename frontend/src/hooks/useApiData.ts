import { useCallback, useEffect, useRef } from 'react';
import { useEmergencyStore } from '../stores/emergencyStore';
import type { MissingPerson } from '../types';
import { firestore, collection, query, orderBy, onSnapshot } from '../services/firebase';

export function useApiData() {
  const setMissingPersons = useEmergencyStore(state => state.setMissingPersons);
  const setConnectionStatus = useEmergencyStore(state => state.setConnectionStatus);
  const isConnected = useEmergencyStore(state => state.isConnected);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const startSubscription = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    try {
      const ref = collection(firestore, 'missingPersons');
      const q = query(ref, orderBy('updatedAt', 'desc'));
      setConnectionStatus(true);

      unsubscribeRef.current = onSnapshot(
        q,
        (snapshot) => {
          const normalizeTimestamp = (value: unknown): number => {
            if (typeof value === 'number') return value;
            if (value && typeof (value as any).toMillis === 'function') {
              return (value as { toMillis: () => number }).toMillis();
            }
            if (value && typeof (value as any).seconds === 'number') {
              return ((value as { seconds: number }).seconds) * 1000;
            }
            return Date.now();
          };

          const persons = snapshot.docs.map((docSnap) => {
            const data = docSnap.data() as any;
            const location = data.location && typeof data.location === 'object'
              ? {
                  lat: Number(data.location.lat) || 0,
                  lng: Number(data.location.lng) || 0,
                  address: data.location.address || '대한민국'
                }
              : { lat: 0, lng: 0, address: '대한민국' };

            const person: MissingPerson = {
              id: docSnap.id,
              name: data.name ?? '이름 미상',
              age: typeof data.age === 'number' ? data.age : Number(data.age) || 0,
              gender: data.gender ?? 'U',
              location,
              photo: data.photo,
              description: data.description ?? '',
              missingDate: data.missingDate ?? '',
              type: data.type ?? 'unknown',
              status: data.status ?? 'active',
              height: typeof data.height === 'number' ? data.height : undefined,
              weight: typeof data.weight === 'number' ? data.weight : undefined,
              clothes: data.clothes,
              updatedAt: data.updatedAt ? normalizeTimestamp(data.updatedAt) : undefined,
              source: data.source,
              bodyType: data.bodyType,
              faceShape: data.faceShape,
              hairShape: data.hairShape,
              hairColor: data.hairColor,
              reportedBy: data.reportedBy
            };

            return person;
          });

          setMissingPersons(persons);
          setConnectionStatus(true);
        },
        (error) => {
          console.error('❌ 실시간 데이터 구독 실패:', error);
          setConnectionStatus(false);
        }
      );
    } catch (error) {
      console.error('❌ 실시간 데이터 구독 설정 실패:', error);
      setConnectionStatus(false);
    }
  }, [setMissingPersons, setConnectionStatus]);

  useEffect(() => {
    startSubscription();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [startSubscription]);

  return {
    isConnected,
    refresh: startSubscription
  };
}
