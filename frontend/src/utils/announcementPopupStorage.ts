import type { Announcement } from '../types/announcement';

const STORAGE_KEY_PREFIX = 'announcement_popup_dismissed_';

type DismissalRecord = {
  date: string;
  announcementId: string;
};

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const getStorageKey = (announcementId: string) => `${STORAGE_KEY_PREFIX}${announcementId}`;

const getTodayToken = () => new Date().toDateString();

const readRecord = (announcementId: string): DismissalRecord | null => {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(announcementId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as DismissalRecord;
  } catch (error) {
    window.localStorage.removeItem(getStorageKey(announcementId));
    return null;
  }
};

export const markPopupDismissedForToday = (announcementId: string) => {
  if (!isBrowser()) {
    return;
  }

  const today = getTodayToken();
  const record: DismissalRecord = {
    date: today,
    announcementId
  };

  try {
    window.localStorage.setItem(getStorageKey(announcementId), JSON.stringify(record));
  } catch (error) {
    // 저장 실패 시 조용히 무시
  }
};

export const isPopupDismissedForToday = (announcementId: string): boolean => {
  const record = readRecord(announcementId);
  if (!record) {
    return false;
  }

  const today = getTodayToken();
  const dismissedToday = record.date === today;

  if (!dismissedToday && isBrowser()) {
    window.localStorage.removeItem(getStorageKey(announcementId));
  }

  return dismissedToday;
};

export const collectDismissedSetForToday = (announcements: Announcement[]): Set<string> => {
  const dismissed = new Set<string>();
  const today = getTodayToken();

  announcements.forEach((announcement) => {
    if (!isBrowser()) {
      return;
    }
    try {
      const raw = window.localStorage.getItem(getStorageKey(announcement.id));
      if (!raw) {
        return;
      }
      const record = JSON.parse(raw) as DismissalRecord;
      if (record.date === today) {
        dismissed.add(announcement.id);
      } else {
        window.localStorage.removeItem(getStorageKey(announcement.id));
      }
    } catch (error) {
      window.localStorage.removeItem(getStorageKey(announcement.id));
    }
  });

  return dismissed;
};

export const hasUndismissedPopupForToday = (announcements: Announcement[]): boolean => {
  if (announcements.length === 0) {
    return false;
  }

  const today = getTodayToken();

  for (const announcement of announcements) {
    if (!isBrowser()) {
      return true;
    }
    try {
      const raw = window.localStorage.getItem(getStorageKey(announcement.id));
      if (!raw) {
        return true;
      }

      const record = JSON.parse(raw) as DismissalRecord;
      if (record.date !== today) {
        window.localStorage.removeItem(getStorageKey(announcement.id));
        return true;
      }
    } catch (error) {
      window.localStorage.removeItem(getStorageKey(announcement.id));
      return true;
    }
  }

  return false;
};
