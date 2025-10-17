import { useCallback, useEffect, useRef } from 'react';
import { useEmergencyStore } from '../stores/emergencyStore';
import type { MissingPerson } from '../types';
import { firestore, collection, query, orderBy, onSnapshot } from '../services/firebase';

export function useApiData() {
  const setMissingPersons = useEmergencyStore(state => state.setMissingPersons);
  const setConnectionStatus = useEmergencyStore(state => state.setConnectionStatus);
  const isConnected = useEmergencyStore(state => state.isConnected);
  const enqueueNewPersonAlert = useEmergencyStore(state => state.enqueueNewPersonAlert);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const initialLoadRef = useRef(true);

  const startSubscription = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    try {
      const ref = collection(firestore, 'missingPersons');
      const q = query(ref, orderBy('updatedAt', 'desc'));
      setConnectionStatus(true);
      initialLoadRef.current = true;

      const convertDocToPerson = (docSnap: any): MissingPerson => {
        const data = docSnap.data();
        const normalizeTimestamp = (value: unknown): number | undefined => {
          if (typeof value === 'number') return value;
          if (value && typeof (value as any).toMillis === 'function') {
            return (value as { toMillis: () => number }).toMillis();
          }
          if (value && typeof (value as any).seconds === 'number') {
            return ((value as { seconds: number }).seconds) * 1000;
          }
          return undefined;
        };

        const location = data?.location && typeof data.location === 'object'
          ? {
              lat: Number(data.location.lat) || 0,
              lng: Number(data.location.lng) || 0,
              address: data.location.address || '대한민국'
            }
          : { lat: 0, lng: 0, address: '대한민국' };

        const photos = Array.isArray(data?.photos)
          ? data.photos.filter((url: unknown) => typeof url === 'string' && url.trim().length > 0)
          : data?.photo
          ? [data.photo]
          : [];
        const primaryPhoto =
          photos.length > 0
            ? photos[0]
            : typeof data?.photo === 'string' && data.photo.trim()
            ? data.photo
            : undefined;

        return {
          id: docSnap.id,
          name: data?.name ?? '이름 미상',
          age: typeof data?.age === 'number' ? data.age : Number(data?.age) || 0,
          gender: data?.gender ?? 'U',
          location,
          photo: primaryPhoto,
          photos,
          description: data?.description ?? '',
          missingDate: data?.missingDate ?? '',
          type: data?.type ?? 'unknown',
          status: data?.status ?? 'active',
          height: typeof data?.height === 'number' ? data.height : undefined,
          weight: typeof data?.weight === 'number' ? data.weight : undefined,
          clothes: data?.clothes,
          updatedAt: normalizeTimestamp(data?.updatedAt),
          source: data?.source,
          bodyType: data?.bodyType,
          faceShape: data?.faceShape,
          hairShape: data?.hairShape,
          hairColor: data?.hairColor,
          reportedBy: data?.reportedBy
        };
      };

      unsubscribeRef.current = onSnapshot(
        q,
        (snapshot) => {
          const persons = snapshot.docs.map(convertDocToPerson);

          setMissingPersons(persons);
          setConnectionStatus(true);

          if (initialLoadRef.current) {
            initialLoadRef.current = false;
          } else {
            const newPersons: MissingPerson[] = [];
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                newPersons.push(convertDocToPerson(change.doc));
              }
            });

            if (newPersons.length > 0) {
              enqueueNewPersonAlert(newPersons);
            }
          }
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
  }, [setMissingPersons, setConnectionStatus, enqueueNewPersonAlert]);

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
