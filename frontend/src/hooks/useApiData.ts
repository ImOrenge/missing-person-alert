import { useCallback, useEffect, useRef, useState } from 'react';
import { useEmergencyStore } from '../stores/emergencyStore';
import type { MissingPerson } from '../types';
import { firestore, collection, query, orderBy, onSnapshot } from '../services/firebase';
import type { DocumentSnapshot, DocumentData } from 'firebase/firestore';

export function useApiData() {
  const setMissingPersons = useEmergencyStore(state => state.setMissingPersons);
  const setConnectionStatus = useEmergencyStore(state => state.setConnectionStatus);
  const isConnected = useEmergencyStore(state => state.isConnected);
  const enqueueNewPersonAlert = useEmergencyStore(state => state.enqueueNewPersonAlert);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const initialLoadRef = useRef(true);
  const [hasLoadedPersons, setHasLoadedPersons] = useState(false);

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
      setHasLoadedPersons(false);

      const convertDocToPerson = (docSnap: DocumentSnapshot<DocumentData>): MissingPerson => {
        const data = docSnap.data();
        const normalizeTimestamp = (value: unknown): number | undefined => {
          if (typeof value === 'number') return value;
          // Firestore Timestamp 타입
          if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis: () => number }).toMillis === 'function') {
            return (value as { toMillis: () => number }).toMillis();
          }
          // seconds 필드가 있는 객체
          if (value && typeof value === 'object' && 'seconds' in value && typeof (value as { seconds: number }).seconds === 'number') {
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

        const photos: string[] = Array.isArray(data?.photos)
          ? (data?.photos.filter((url: unknown) => typeof url === 'string' && url.trim().length > 0) as string[])
          : data?.photo
          ? [data.photo]
          : [];
        const primaryPhoto: string | undefined =
          photos.length > 0
            ? photos[0]
            : typeof data?.photo === 'string' && data?.photo.trim()
            ? data.photo
            : undefined;
        const viewCount =
          typeof data?.viewCount === 'number'
            ? data.viewCount
            : typeof data?.viewCount === 'string'
            ? Number(data.viewCount) || 0
            : 0;
        const rawViewStats =
          data?.viewStats && typeof data.viewStats === 'object'
            ? (data.viewStats as Record<string, unknown>)
            : undefined;
        const viewStats = rawViewStats
            ? {
                total:
                  typeof rawViewStats.total === 'number'
                    ? (rawViewStats.total as number)
                    : typeof rawViewStats.total === 'string'
                    ? Number(rawViewStats.total) || viewCount
                    : viewCount,
                lastViewed: normalizeTimestamp(rawViewStats.lastViewed),
                uniqueViewers:
                  typeof rawViewStats.uniqueViewers === 'number'
                    ? (rawViewStats.uniqueViewers as number)
                    : typeof rawViewStats.uniqueViewers === 'string'
                    ? Number(rawViewStats.uniqueViewers) || undefined
                    : undefined
              }
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
          reportedBy: data?.reportedBy,
          commentCount:
            typeof data?.commentCount === 'number'
              ? data.commentCount
              : typeof data?.commentsCount === 'number'
              ? data.commentsCount
              : typeof data?.commentStats?.total === 'number'
              ? data.commentStats.total
              : undefined,
          commentStats: data?.commentStats,
          viewCount,
          viewStats
        };
      };

      unsubscribeRef.current = onSnapshot(
        q,
        (snapshot) => {
          const persons = snapshot.docs.map(convertDocToPerson);

          setMissingPersons(persons);
          setConnectionStatus(true);
          setHasLoadedPersons(true);

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
          setHasLoadedPersons(true);
        }
      );
    } catch (error) {
      console.error('❌ 실시간 데이터 구독 설정 실패:', error);
      setConnectionStatus(false);
      setHasLoadedPersons(true);
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
    hasLoadedPersons,
    refresh: startSubscription
  };
}
