import axios from 'axios';
import type { MissingPerson } from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

interface PublicMissingPersonsResponse {
  result: string;
  msg?: string;
  message?: string;
  error?: string;
  list?: unknown[];
}

const numberOrUndefined = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const timestampOrUndefined = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const seconds = numberOrUndefined(source.seconds ?? source._seconds);
    if (seconds !== undefined) return seconds * 1000;
  }
  return undefined;
};

const mapPublicPerson = (value: unknown, index: number): MissingPerson => {
  const item = value && typeof value === 'object' ? value as Record<string, any> : {};
  const rawLocation = item.location && typeof item.location === 'object' ? item.location : {};
  const photos = Array.isArray(item.photos)
    ? item.photos.filter((photo: unknown): photo is string => typeof photo === 'string' && photo.length > 0)
    : [];
  const photo = typeof item.photo === 'string' && item.photo.length > 0 ? item.photo : photos[0];

  return {
    id: String(item.id || `public-case-${index}`),
    name: typeof item.name === 'string' ? item.name : '이름 미상',
    age: numberOrUndefined(item.age) ?? 0,
    gender: item.gender === 'M' || item.gender === 'F' ? item.gender : 'U',
    location: {
      lat: numberOrUndefined(rawLocation.lat) ?? 0,
      lng: numberOrUndefined(rawLocation.lng) ?? 0,
      address: typeof rawLocation.address === 'string' ? rawLocation.address : '대한민국'
    },
    photo,
    photos,
    description: typeof item.description === 'string' ? item.description : '',
    missingDate: typeof item.missingDate === 'string' ? item.missingDate : '',
    type: item.type || 'unknown',
    status: item.status || 'active',
    height: numberOrUndefined(item.height),
    weight: numberOrUndefined(item.weight),
    clothes: typeof item.clothes === 'string' ? item.clothes : undefined,
    updatedAt: timestampOrUndefined(item.updatedAt),
    source: item.source,
    bodyType: item.bodyType,
    faceShape: item.faceShape,
    hairShape: item.hairShape,
    hairColor: item.hairColor,
    reportedBy: item.reportedBy,
    commentCount: numberOrUndefined(item.commentCount),
    commentStats: item.commentStats,
    viewCount: numberOrUndefined(item.viewCount) ?? 0,
    viewStats: item.viewStats,
    apiTargetCode: item.apiTargetCode
  } as MissingPerson;
};

/**
 * CDN 캐시가 적용된 공개 API에서 지도/목록용 실종자 스냅샷을 가져옵니다.
 * 브라우저가 Firestore 전체 컬렉션을 직접 구독하지 않도록 이 경로를 사용합니다.
 */
export async function fetchMissingPersons(): Promise<MissingPerson[]> {
  const apiUrl = `${API_BASE_URL}/api/safe182/missing-persons?limit=500`;
  const response = await axios.get<PublicMissingPersonsResponse>(apiUrl, { timeout: 15_000 });
  const payload = response.data;

  if (!payload || payload.error || payload.result !== '00' || !Array.isArray(payload.list)) {
    throw new Error(payload?.message || payload?.msg || '실종자 공개정보 응답이 올바르지 않습니다');
  }

  return payload.list.map(mapPublicPerson);
}
