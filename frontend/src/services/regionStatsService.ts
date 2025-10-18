import { doc, getDoc, Timestamp, firestore } from './firebase';
import type {
  RegionDailyEntry,
  RegionMetadataDocument,
  RegionMetadataEntry,
  RegionStatSummary,
  RegionStatsDocument
} from '../types/regionStats';

const REGION_STATS_DOC_REF = doc(firestore, 'stats', 'regionDaily');
const REGION_METADATA_DOC_REF = doc(firestore, 'stats', 'regionMetadata');
const CACHE_TTL_MS = 15 * 60 * 1000;

interface RegionStatsCache {
  data: RegionStatsData;
  fetchedAt: number;
}

interface RegionMetadataCache {
  data: RegionMetadataDocument | null;
  fetchedAt: number;
}

export interface RegionStatsData {
  updatedAt?: number;
  generatedAt?: number;
  totals: RegionStatsDocument['totals'];
  historyDays: number;
  regions: RegionStatSummary[];
}

let statsCache: RegionStatsCache | null = null;
let metadataCache: RegionMetadataCache | null = null;

const toMillis = (value: unknown | Timestamp): number | undefined => {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (typeof value === 'object' && value !== null) {
    const maybeTimestamp = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof maybeTimestamp.toMillis === 'function') {
      return maybeTimestamp.toMillis();
    }
    if (typeof maybeTimestamp.seconds === 'number') {
      const millis = maybeTimestamp.seconds * 1000 + Math.floor((maybeTimestamp.nanoseconds ?? 0) / 1_000_000);
      return millis;
    }
  }

  return undefined;
};

const normalizeDailyEntries = (value: unknown): RegionDailyEntry[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is RegionDailyEntry => Boolean(entry && typeof entry.date === 'string'))
      .map((entry) => ({
        date: entry.date,
        totalCases: Number(entry.totalCases ?? 0),
        activeCases: Number(entry.activeCases ?? 0)
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, any>)
      .map(([date, entry]) => ({
        date,
        totalCases: Number(entry?.totalCases ?? 0),
        activeCases: Number(entry?.activeCases ?? 0)
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return [];
};

const transformStatsDocument = (raw: any): RegionStatsData => {
  const regionsRaw = raw?.regions ?? {};
  const regions: RegionStatSummary[] = Object.values(regionsRaw).map((entry: any) => ({
    regionId: entry?.regionId ?? entry?.id ?? 'unknown',
    regionName: entry?.regionName ?? '기타/미상',
    code: entry?.code ?? '00',
    totalCases: Number(entry?.totalCases ?? 0),
    activeCases: Number(entry?.activeCases ?? 0),
    latestCaseDate: typeof entry?.latestCaseDate === 'string' ? entry.latestCaseDate : null,
    daily: normalizeDailyEntries(entry?.daily)
  }));

  regions.sort((a, b) => b.totalCases - a.totalCases || a.regionName.localeCompare(b.regionName));

  return {
    updatedAt: toMillis(raw?.updatedAt) ?? toMillis(raw?.generatedAt),
    generatedAt: toMillis(raw?.generatedAt),
    totals: {
      regions: Number(raw?.totals?.regions ?? regions.length),
      totalCases: Number(raw?.totals?.totalCases ?? 0),
      activeCases: Number(raw?.totals?.activeCases ?? 0)
    },
    historyDays: Number(raw?.historyDays ?? 0),
    regions
  };
};

const transformMetadataDocument = (raw: any): RegionMetadataDocument | null => {
  if (!raw) {
    return null;
  }

  const entries: RegionMetadataEntry[] = Array.isArray(raw.regions)
    ? raw.regions.filter(Boolean).map((region: any) => ({
        id: region?.id ?? 'unknown',
        name: region?.name ?? '기타/미상',
        code: region?.code ?? '00',
        parentId: typeof region?.parentId === 'string' ? region.parentId : null,
        center: {
          lat: Number(region?.center?.lat ?? 0),
          lng: Number(region?.center?.lng ?? 0)
        }
      }))
    : [];

  return {
    lastUpdatedAt: toMillis(raw?.lastUpdatedAt),
    regions: entries
  };
};

const isCacheValid = (cache: { fetchedAt: number } | null): boolean => {
  if (!cache) {
    return false;
  }
  return Date.now() - cache.fetchedAt < CACHE_TTL_MS;
};

export const getRegionStats = async (options: { force?: boolean } = {}): Promise<RegionStatsData | null> => {
  if (!options.force && isCacheValid(statsCache)) {
    return statsCache!.data;
  }

  const snapshot = await getDoc(REGION_STATS_DOC_REF);
  if (!snapshot.exists()) {
    statsCache = null;
    return null;
  }

  const data = transformStatsDocument(snapshot.data());
  statsCache = {
    data,
    fetchedAt: Date.now()
  };
  return data;
};

export const getRegionMetadata = async (options: { force?: boolean } = {}): Promise<RegionMetadataDocument | null> => {
  if (!options.force && isCacheValid(metadataCache)) {
    return metadataCache!.data;
  }

  const snapshot = await getDoc(REGION_METADATA_DOC_REF);
  if (!snapshot.exists()) {
    metadataCache = null;
    return null;
  }

  const data = transformMetadataDocument(snapshot.data());
  metadataCache = {
    data,
    fetchedAt: Date.now()
  };
  return data;
};

export const getRegionStatsUpdateInfo = async (): Promise<{
  updatedAt?: number;
  hasFreshData: boolean;
}> => {
  const stats = await getRegionStats();
  const updatedAt = stats?.updatedAt ?? stats?.generatedAt;
  const hasFreshData = !!updatedAt && Date.now() - updatedAt < 24 * 60 * 60 * 1000;
  return { updatedAt, hasFreshData };
};
