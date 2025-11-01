import type { MissingPerson } from '../types';
import type { Announcement } from '../types/announcement';

const STORAGE_KEYS = {
  missingPersons: 'mp-offline-missing-persons',
  announcements: 'mp-offline-announcements'
} as const;

type OfflineCachePayload<T> = {
  updatedAt: number;
  data: T;
};

export type OfflineMissingPersonSummary = {
  id: string;
  name: string;
  missingDate?: string;
  address?: string;
  status?: string;
};

export type OfflineAnnouncementSummary = {
  id: string;
  title?: string;
  text?: string;
};

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const safeWrite = <T>(key: string, value: OfflineCachePayload<T>) => {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('[OfflineCache] 데이터 저장 실패:', error);
  }
};

const safeRead = <T>(key: string): OfflineCachePayload<T> | null => {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as OfflineCachePayload<T>;
  } catch (error) {
    console.warn('[OfflineCache] 데이터 읽기 실패:', error);
    return null;
  }
};

export const cacheMissingPersons = (persons: MissingPerson[]) => {
  if (!persons || persons.length === 0) {
    return;
  }

  const summaries: OfflineMissingPersonSummary[] = persons.slice(0, 40).map((person) => ({
    id: person.id,
    name: person.name,
    missingDate: person.missingDate,
    address: person.location?.address,
    status: person.status
  }));

  safeWrite(STORAGE_KEYS.missingPersons, {
    updatedAt: Date.now(),
    data: summaries
  });
};

export const hydrateMissingPersonsFromCache = (): OfflineMissingPersonSummary[] | null => {
  const payload = safeRead<OfflineMissingPersonSummary[]>(STORAGE_KEYS.missingPersons);
  return payload?.data ?? null;
};

export const cacheAnnouncements = (announcements: Announcement[]) => {
  if (!announcements || announcements.length === 0) {
    return;
  }

  const summaries: OfflineAnnouncementSummary[] = [];
  const seen = new Set<string>();

  announcements.forEach((announcement) => {
    if (seen.has(announcement.id)) {
      return;
    }
    seen.add(announcement.id);
    const titleCandidate = announcement.popupTitle?.trim();
    const fallbackTitle = announcement.text?.slice(0, 24) ?? '공지';
    summaries.push({
      id: announcement.id,
      title: titleCandidate || fallbackTitle,
      text: announcement.text
    });
  });

  safeWrite(STORAGE_KEYS.announcements, {
    updatedAt: Date.now(),
    data: summaries.slice(0, 20)
  });
};

export const hydrateAnnouncementsFromCache = (): OfflineAnnouncementSummary[] | null => {
  const payload = safeRead<OfflineAnnouncementSummary[]>(STORAGE_KEYS.announcements);
  return payload?.data ?? null;
};
