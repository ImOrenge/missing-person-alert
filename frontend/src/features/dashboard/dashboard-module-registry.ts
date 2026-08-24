export type DashboardModuleId = 'overview' | 'status-summary' | 'search' | 'urgent-cases' | 'case-details' | 'news' | 'region-summary' | 'quick-actions';

export interface DashboardModuleDefinition {
  id: DashboardModuleId;
  label: string;
  fixed: boolean;
}

export const DASHBOARD_MODULES: DashboardModuleDefinition[] = [
  { id: 'overview', label: '대시보드 안내', fixed: true },
  { id: 'status-summary', label: '현황 요약', fixed: true },
  { id: 'search', label: '통합 검색·전국 안내', fixed: true },
  { id: 'urgent-cases', label: '최근 실종자·지도', fixed: true },
  { id: 'case-details', label: '실종자 상세 정보', fixed: true },
  { id: 'news', label: '관련 뉴스', fixed: false },
  { id: 'region-summary', label: '지역별 현황·공지', fixed: false },
  { id: 'quick-actions', label: '제보·관심 지역 알림', fixed: true },
];

export const DEFAULT_MODULE_ORDER = DASHBOARD_MODULES.map((module) => module.id);
export const OPTIONAL_DASHBOARD_MODULES = DASHBOARD_MODULES.filter((module) => !module.fixed);
