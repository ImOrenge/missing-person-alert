import type {PublicImpactMonth} from './types';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';
let cachedMonths: PublicImpactMonth[] = [];

const isPublicMonth = (value: unknown): value is PublicImpactMonth => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PublicImpactMonth>;
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(item.month || '')) && item.published === true && item.review?.state === 'approved' && Boolean(item.events);
};

export const loadPublicImpactMonths = async (signal?: AbortSignal): Promise<{items: PublicImpactMonth[]; stale: boolean}> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/public/impact/monthly`, {signal, headers: {'Accept':'application/json'}});
    if (!response.ok) throw new Error(`impact_http_${response.status}`);
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items.filter(isPublicMonth).sort((left: PublicImpactMonth, right: PublicImpactMonth) => left.month.localeCompare(right.month)) : [];
    cachedMonths = items;
    return {items, stale:false};
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    return {items: cachedMonths, stale:true};
  }
};

export const resetImpactCacheForTests = () => { cachedMonths = []; };
