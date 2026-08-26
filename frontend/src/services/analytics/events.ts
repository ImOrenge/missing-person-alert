import type { MissingPersonType } from '../../types';

export const PUBLIC_IMPACT_EVENT_NAMES = {
  CASE_IMPRESSION: 'case_impression',
  CASE_VIEW: 'case_view',
  SHARE_CLICK: 'share_click',
  REPORT_CTA_CLICK: 'report_cta_click',
  MAP_VIEW: 'map_view',
  REGION_FILTER: 'region_filter',
  OFFICIAL_SOURCE_CLICK: 'official_source_click',
  STATISTICS_VIEW: 'statistics_view',
  IMPACT_VIEW: 'impact_view',
  SEARCH_RESULT_VIEW: 'search_result_view',
} as const;

export type PublicImpactEventName = typeof PUBLIC_IMPACT_EVENT_NAMES[keyof typeof PUBLIC_IMPACT_EVENT_NAMES];
export type CaseCategory = 'child' | 'disabled' | 'dementia' | 'adult' | 'unknown';
export type CaseSurface = 'home' | 'map' | 'search' | 'related' | 'detail';
export type ShareChannel = 'native' | 'kakao' | 'link' | 'other';
export type RouteGroup = 'home' | 'case' | 'map' | 'statistics' | 'impact';
export type SourceAgency = 'police' | 'other_public';

export interface PublicImpactEventInput extends Record<string, unknown> {
  case_category?: CaseCategory | MissingPersonType;
  sido_code?: string;
  surface?: CaseSurface;
  share_channel?: ShareChannel;
  route_group?: RouteGroup;
  source_agency?: SourceAgency;
}

export interface SerializedPublicImpactEvent {
  name: PublicImpactEventName;
  params: Record<string, string>;
}

const EVENT_PARAMETER_ALLOWLIST: Record<PublicImpactEventName, readonly string[]> = {
  case_impression: ['case_category', 'sido_code', 'surface', 'source_agency'],
  case_view: ['case_category', 'sido_code', 'surface', 'route_group', 'source_agency'],
  share_click: ['case_category', 'sido_code', 'surface', 'share_channel', 'source_agency'],
  report_cta_click: ['case_category', 'sido_code', 'surface', 'route_group', 'source_agency'],
  map_view: ['route_group'],
  region_filter: ['sido_code', 'surface', 'route_group'],
  official_source_click: ['case_category', 'sido_code', 'surface', 'route_group', 'source_agency'],
  statistics_view: ['route_group'],
  impact_view: ['route_group'],
  search_result_view: ['sido_code', 'surface'],
};

const CASE_SCOPED_EVENTS = new Set<PublicImpactEventName>([
  PUBLIC_IMPACT_EVENT_NAMES.CASE_IMPRESSION,
  PUBLIC_IMPACT_EVENT_NAMES.CASE_VIEW,
  PUBLIC_IMPACT_EVENT_NAMES.SHARE_CLICK,
  PUBLIC_IMPACT_EVENT_NAMES.REPORT_CTA_CLICK,
  PUBLIC_IMPACT_EVENT_NAMES.OFFICIAL_SOURCE_CLICK,
]);

const VALID_VALUES: Partial<Record<string, ReadonlySet<string>>> = {
  case_category: new Set<CaseCategory>(['child', 'disabled', 'dementia', 'adult', 'unknown']),
  surface: new Set<CaseSurface>(['home', 'map', 'search', 'related', 'detail']),
  share_channel: new Set<ShareChannel>(['native', 'kakao', 'link', 'other']),
  route_group: new Set<RouteGroup>(['home', 'case', 'map', 'statistics', 'impact']),
  source_agency: new Set<SourceAgency>(['police', 'other_public']),
};

const SIDO_CODE_BY_TOKEN: Record<string, string> = {
  서울: '11', 서울특별시: '11',
  부산: '26', 부산광역시: '26',
  대구: '27', 대구광역시: '27',
  인천: '28', 인천광역시: '28',
  광주: '29', 광주광역시: '29',
  대전: '30', 대전광역시: '30',
  울산: '31', 울산광역시: '31',
  세종: '36', 세종특별자치시: '36',
  경기: '41', 경기도: '41',
  강원: '51', 강원도: '51', 강원특별자치도: '51',
  충북: '43', 충청북도: '43',
  충남: '44', 충청남도: '44',
  전북: '52', 전라북도: '52', 전북특별자치도: '52',
  전남: '46', 전라남도: '46',
  경북: '47', 경상북도: '47',
  경남: '48', 경상남도: '48',
  제주: '50', 제주도: '50', 제주특별자치도: '50',
};

export const normalizeCaseCategory = (value: unknown): CaseCategory => {
  switch (value) {
    case 'missing_child':
    case 'child':
      return 'child';
    case 'disabled':
      return 'disabled';
    case 'dementia':
      return 'dementia';
    case 'runaway':
    case 'adult':
      return 'adult';
    default:
      return 'unknown';
  }
};

export const getSidoCode = (addressOrRegion: unknown): string | undefined => {
  if (typeof addressOrRegion !== 'string') return undefined;
  const tokens = addressOrRegion.trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const code = SIDO_CODE_BY_TOKEN[token];
    if (code) return code;
  }
  return undefined;
};

const isValidParameterValue = (key: string, value: string): boolean => {
  if (key === 'sido_code') return /^\d{2}$/.test(value);
  const allowedValues = VALID_VALUES[key];
  return !allowedValues || allowedValues.has(value);
};

export const serializePublicImpactEvent = (
  name: PublicImpactEventName,
  input: PublicImpactEventInput,
): SerializedPublicImpactEvent => {
  const params: Record<string, string> = {};

  EVENT_PARAMETER_ALLOWLIST[name].forEach((key) => {
    const rawValue = input[key];
    if (typeof rawValue !== 'string') return;
    const value = key === 'case_category' ? normalizeCaseCategory(rawValue) : rawValue.trim();
    if (!value || !isValidParameterValue(key, value)) return;
    params[key] = value;
  });

  if (CASE_SCOPED_EVENTS.has(name) && !params.case_category) params.case_category = 'unknown';
  return { name, params };
};

export const buildCaseImpactContext = ({
  caseCategory,
  address,
  surface,
  routeGroup,
  sourceAgency = 'police',
}: {
  caseCategory?: CaseCategory | MissingPersonType;
  address?: string;
  surface: CaseSurface;
  routeGroup?: RouteGroup;
  sourceAgency?: SourceAgency;
}): PublicImpactEventInput => ({
  case_category: normalizeCaseCategory(caseCategory),
  ...(getSidoCode(address) ? { sido_code: getSidoCode(address) } : {}),
  surface,
  ...(routeGroup ? { route_group: routeGroup } : {}),
  source_agency: sourceAgency,
});
