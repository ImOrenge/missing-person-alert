export const SEO_EVENT_NAMES = [
  "seo_detail_view",
  "seo_app_cta_click",
  "report_started",
  "share_started",
  "call_112_click",
  "call_182_click",
  "seo_return_visit",
  "seo_search_entry",
  "seo_detail_started",
] as const;

export type SeoEventName = typeof SEO_EVENT_NAMES[number];

export const SEO_SOURCE_NAMES = ["google", "naver", "bing", "daum", "direct", "other"] as const;
export type SeoSourceName = typeof SEO_SOURCE_NAMES[number];

export const SEO_PAGE_GROUP_NAMES = ["home", "nationwide", "region", "type", "recent", "statistics", "guide", "detail", "other"] as const;
export type SeoPageGroupName = typeof SEO_PAGE_GROUP_NAMES[number];

export interface SeoMetricDay {
  date: string;
  detailViews: number;
  mapClicks: number;
  reportStarts: number;
  shares: number;
  calls112: number;
  calls182: number;
  returnVisits: number;
  searchEntries: number;
  detailStarts: number;
  sourceEntries: Record<SeoSourceName, number>;
  pageGroupEntries: Record<SeoPageGroupName, number>;
}

export interface SeoMetricsSummary {
  rangeDays: number;
  startDate: string;
  endDate: string;
  totals: Omit<SeoMetricDay, "date" | "sourceEntries" | "pageGroupEntries"> & {
    sourceEntries: Record<SeoSourceName, number>;
    pageGroupEntries: Record<SeoPageGroupName, number>;
  };
  rates: {
    mapViewRate: number;
    shareRate: number;
    reportStartRate: number;
    callRate: number;
    searchToDetailRate: number;
    returnVisitRate: number;
    homeSearchShare: number;
    expansionSearchShare: number;
  };
  daily: SeoMetricDay[];
}

const safeCount = (value: unknown): number => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

export const isSeoEventName = (value: unknown): value is SeoEventName =>
  typeof value === "string" && SEO_EVENT_NAMES.includes(value as SeoEventName);

export const normalizeSeoSource = (value: unknown): SeoSourceName =>
  typeof value === "string" && SEO_SOURCE_NAMES.includes(value as SeoSourceName) ? value as SeoSourceName : "other";

export const normalizeSeoPageGroup = (value: unknown): SeoPageGroupName =>
  typeof value === "string" && SEO_PAGE_GROUP_NAMES.includes(value as SeoPageGroupName) ? value as SeoPageGroupName : "other";

export const normalizeSeoMetricDay = (date: string, data: Record<string, any>): SeoMetricDay => {
  const totals = data.totals && typeof data.totals === "object" ? data.totals : {};
  const sources = data.sources && typeof data.sources === "object" ? data.sources : {};
  const pageGroups = data.pageGroups && typeof data.pageGroups === "object" ? data.pageGroups : {};
  const sourceEntries = Object.fromEntries(SEO_SOURCE_NAMES.map((source) => [
    source,
    safeCount(sources[source]?.seo_search_entry),
  ])) as Record<SeoSourceName, number>;
  const pageGroupEntries = Object.fromEntries(SEO_PAGE_GROUP_NAMES.map((pageGroup) => [
    pageGroup,
    safeCount(pageGroups[pageGroup]?.seo_search_entry),
  ])) as Record<SeoPageGroupName, number>;
  return {
    date,
    detailViews: safeCount(totals.seo_detail_view),
    mapClicks: safeCount(totals.seo_app_cta_click),
    reportStarts: safeCount(totals.report_started),
    shares: safeCount(totals.share_started),
    calls112: safeCount(totals.call_112_click),
    calls182: safeCount(totals.call_182_click),
    returnVisits: safeCount(totals.seo_return_visit),
    searchEntries: safeCount(totals.seo_search_entry),
    detailStarts: safeCount(totals.seo_detail_started),
    sourceEntries,
    pageGroupEntries,
  };
};

const percentage = (numerator: number, denominator: number): number =>
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;

export const buildSeoMetricsSummary = (
  rows: SeoMetricDay[],
  rangeDays: number,
  startDate: string,
  endDate: string
): SeoMetricsSummary => {
  const sourceEntries = Object.fromEntries(SEO_SOURCE_NAMES.map((source) => [source, 0])) as Record<SeoSourceName, number>;
  const pageGroupEntries = Object.fromEntries(SEO_PAGE_GROUP_NAMES.map((pageGroup) => [pageGroup, 0])) as Record<SeoPageGroupName, number>;
  const totals = rows.reduce((acc, row) => {
    acc.detailViews += row.detailViews;
    acc.mapClicks += row.mapClicks;
    acc.reportStarts += row.reportStarts;
    acc.shares += row.shares;
    acc.calls112 += row.calls112;
    acc.calls182 += row.calls182;
    acc.returnVisits += row.returnVisits;
    acc.searchEntries += row.searchEntries;
    acc.detailStarts += row.detailStarts;
    SEO_SOURCE_NAMES.forEach((source) => { sourceEntries[source] += row.sourceEntries[source]; });
    SEO_PAGE_GROUP_NAMES.forEach((pageGroup) => { pageGroupEntries[pageGroup] += row.pageGroupEntries[pageGroup]; });
    return acc;
  }, {detailViews: 0, mapClicks: 0, reportStarts: 0, shares: 0, calls112: 0, calls182: 0, returnVisits: 0, searchEntries: 0, detailStarts: 0});
  const expansionEntries = pageGroupEntries.type + pageGroupEntries.recent + pageGroupEntries.statistics + pageGroupEntries.guide;
  return {
    rangeDays,
    startDate,
    endDate,
    totals: {...totals, sourceEntries, pageGroupEntries},
    rates: {
      mapViewRate: percentage(totals.mapClicks, totals.detailViews),
      shareRate: percentage(totals.shares, totals.detailViews),
      reportStartRate: percentage(totals.reportStarts, totals.detailViews),
      callRate: percentage(totals.calls112 + totals.calls182, totals.detailViews),
      searchToDetailRate: percentage(totals.detailStarts, totals.searchEntries),
      returnVisitRate: percentage(totals.returnVisits, totals.searchEntries),
      homeSearchShare: percentage(pageGroupEntries.home, totals.searchEntries),
      expansionSearchShare: percentage(expansionEntries, totals.searchEntries),
    },
    daily: [...rows].sort((a, b) => a.date.localeCompare(b.date)),
  };
};
