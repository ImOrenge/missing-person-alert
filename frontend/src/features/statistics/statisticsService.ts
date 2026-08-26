import {POLICE_STATISTICS_SEED} from './policeStatisticsSeed';
import type {PoliceStatisticsYear} from './types';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

export interface StatisticsLoadResult {
  items: PoliceStatisticsYear[];
  source: 'firestore' | 'verified_seed';
  stale: boolean;
}

const isValidYear = (value: unknown): value is PoliceStatisticsYear => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<PoliceStatisticsYear>;
  return Number.isInteger(row.year) && row.published === true && Boolean(row.categories && row.totals && row.derived && row.source);
};

export const loadPublicStatistics = async (signal?: AbortSignal): Promise<StatisticsLoadResult> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/public/statistics/yearly`, {signal, headers: {'Accept': 'application/json'}});
    if (!response.ok) throw new Error(`statistics_http_${response.status}`);
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items.filter(isValidYear).sort((left: PoliceStatisticsYear, right: PoliceStatisticsYear) => left.year - right.year) : [];
    if (!items.length) throw new Error('statistics_empty');
    return {items, source: payload.source === 'firestore' ? 'firestore' : 'verified_seed', stale: payload.stale === true};
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    return {items: POLICE_STATISTICS_SEED, source: 'verified_seed', stale: true};
  }
};
