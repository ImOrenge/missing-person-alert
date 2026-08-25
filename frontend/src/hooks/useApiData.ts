import { useCallback, useEffect, useRef, useState } from 'react';
import { useEmergencyStore } from '../stores/emergencyStore';
import { fetchMissingPersons } from '../services/apiService';
import type { MissingPerson } from '../types';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const VISIBILITY_REFRESH_AGE_MS = 5 * 60 * 1000;

export function useApiData() {
  const setMissingPersons = useEmergencyStore(state => state.setMissingPersons);
  const setConnectionStatus = useEmergencyStore(state => state.setConnectionStatus);
  const isConnected = useEmergencyStore(state => state.isConnected);
  const enqueueNewPersonAlert = useEmergencyStore(state => state.enqueueNewPersonAlert);
  const mountedRef = useRef(false);
  const loadingRef = useRef(false);
  const initialLoadRef = useRef(true);
  const previousIdsRef = useRef<Set<string>>(new Set());
  const lastLoadedAtRef = useRef(0);
  const [hasLoadedPersons, setHasLoadedPersons] = useState(false);

  const loadPersons = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const persons = await fetchMissingPersons();
      if (!mountedRef.current) return;

      if (!initialLoadRef.current) {
        const newPersons: MissingPerson[] = persons.filter(person => !previousIdsRef.current.has(person.id));
        if (newPersons.length > 0) enqueueNewPersonAlert(newPersons);
      }

      previousIdsRef.current = new Set(persons.map(person => person.id));
      initialLoadRef.current = false;
      lastLoadedAtRef.current = Date.now();
      setMissingPersons(persons);
      setConnectionStatus(true);
      setHasLoadedPersons(true);
    } catch (error) {
      if (!mountedRef.current) return;
      console.error('실종자 공개정보 조회 실패:', error);
      setConnectionStatus(false);
      setHasLoadedPersons(true);
    } finally {
      loadingRef.current = false;
    }
  }, [enqueueNewPersonAlert, setConnectionStatus, setMissingPersons]);

  useEffect(() => {
    mountedRef.current = true;
    void loadPersons();

    const intervalId = window.setInterval(() => void loadPersons(), REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastLoadedAtRef.current >= VISIBILITY_REFRESH_AGE_MS
      ) {
        void loadPersons();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadPersons]);

  return {
    isConnected,
    hasLoadedPersons,
    refresh: loadPersons
  };
}
