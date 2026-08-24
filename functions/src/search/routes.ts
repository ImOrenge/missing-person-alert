import * as admin from "firebase-admin";
import * as crypto from "crypto";
import {Express, Request, Response} from "express";
import {PublicSearchTab} from "./contracts";
import {AlgoliaConfig, searchAlgoliaPublicRecords} from "./algolia-client";
import {normalizeKoreanSearchText} from "./normalize-korean";
import {searchPublicRecords} from "./search-service";
import {loadReportingFeatureFlags, loadSearchFeatureFlags} from "../runtimeConfig";

const SEARCH_TABS: PublicSearchTab[] = ["all", "cases", "reports", "news"];
const SENSITIVE_QUERY = /(?:\b\d{2,3}-?\d{3,4}-?\d{4}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b\d{6}-?[1-4]\d{6}\b)/;

const parseSearchInput = (source: Record<string, unknown>) => {
  const rawQuery = typeof source.q === "string" ? source.q : "";
  const query = normalizeKoreanSearchText(rawQuery);
  const tab = typeof source.tab === "string" && SEARCH_TABS.includes(source.tab as PublicSearchTab)
    ? source.tab as PublicSearchTab
    : "all";
  const filters = source.filters && typeof source.filters === "object" ? source.filters as Record<string, unknown> : {};
  const region = normalizeKoreanSearchText(source.region || filters.region);
  const requestedLimit = Number(source.limit);
  const limit = Number.isFinite(requestedLimit) ? Math.min(50, Math.max(1, Math.floor(requestedLimit))) : 30;
  return {query, rawQuery, tab, region, limit};
};

const validateQuery = (query: string, rawQuery = query): string | null => {
  if (query.length < 2 && !/^[ㄱ-ㅎ]{2,}$/.test(query)) return "검색어는 2자 이상 입력해 주세요";
  if (query.length > 80) return "검색어는 80자 이하로 입력해 주세요";
  if (SENSITIVE_QUERY.test(rawQuery)) return "연락처·주민번호는 검색할 수 없습니다";
  return null;
};

export interface PublicSearchRouteOptions {
  getAlgoliaConfig?: () => Partial<AlgoliaConfig> | Promise<Partial<AlgoliaConfig>>;
}

export const registerPublicSearchRoutes = (
  app: Express,
  db: admin.firestore.Firestore,
  options: PublicSearchRouteOptions = {},
): void => {
  const executeSearch = async (input: {
    query: string;
    tab: PublicSearchTab;
    region?: string;
    limit: number;
  }) => {
    const [reportingFlags, searchFlags] = await Promise.all([
      loadReportingFeatureFlags(db),
      loadSearchFeatureFlags(db),
    ]);
    const includeReports = reportingFlags.reports_public_indexing_enabled;
    if (searchFlags.algolia_search_enabled && options.getAlgoliaConfig) {
      try {
        const result = await searchAlgoliaPublicRecords(await options.getAlgoliaConfig(), {...input, includeReports});
        return {...result, provider: "algolia" as const};
      } catch (error) {
        const status = typeof error === "object" && error !== null && "response" in error ?
          Number((error as {response?: {status?: unknown}}).response?.status) || undefined : undefined;
        console.warn("Algolia public search unavailable; using Firestore fallback", {status});
      }
    }
    const result = await searchPublicRecords(db, {...input, includeReports});
    return {...result, provider: "firestore-fallback" as const};
  };

  const runSearch = async (source: Record<string, unknown>, res: Response) => {
    const startedAt = Date.now();
    const {query, rawQuery, tab, region, limit} = parseSearchInput(source);
    const validationError = validateQuery(query, rawQuery);
    if (validationError) return res.status(400).json({success: false, error: validationError});

    try {
      const result = await executeSearch({query, tab, region, limit});
      const counts = result.items.reduce((value, item) => {
        value[item.kind === "case" ? "cases" : item.kind === "report" ? "reports" : "news"] += 1;
        return value;
      }, {cases: 0, reports: 0, news: 0});
      res.set("Cache-Control", "private, no-store");
      return res.json({
        success: true,
        requestId: crypto.randomUUID(),
        provider: result.provider,
        tab,
        items: result.items,
        total: result.items.length,
        capped: result.capped,
        page: {hasMore: result.capped, limit},
        counts,
        appliedFilters: {region},
        processingMs: Date.now() - startedAt,
        freshness: {indexedAt: new Date().toISOString()},
      });
    } catch (_error) {
      return res.status(503).json({success: false, error: "검색 서비스를 잠시 사용할 수 없습니다"});
    }
  };

  app.post("/api/search/query", async (req: Request, res: Response) => runSearch(req.body || {}, res));

  app.post("/api/search/suggestions", async (req: Request, res: Response) => {
    const rawQuery = typeof req.body?.q === "string" ? req.body.q : "";
    const query = normalizeKoreanSearchText(rawQuery);
    const validationError = validateQuery(query, rawQuery);
    if (validationError) return res.status(400).json({success: false, error: validationError});
    const requestedLimit = Number(req.body?.limit);
    const limit = Number.isFinite(requestedLimit) ? Math.min(8, Math.max(1, Math.floor(requestedLimit))) : 8;
    try {
      const result = await executeSearch({query, tab: "cases", limit});
      const suggestions = result.items.slice(0, limit).map((item) => ({
        id: item.id,
        kind: item.kind,
        label: item.title,
        regionLabel: item.regionLabel,
        href: item.href,
      }));
      res.set("Cache-Control", "private, no-store");
      return res.json({success: true, provider: result.provider, suggestions});
    } catch {
      return res.status(503).json({success: false, error: "검색 제안을 잠시 사용할 수 없습니다"});
    }
  });

  // 기존 공유 URL과 클라이언트의 무중단 전환을 위한 읽기 호환 경로다.
  app.get("/api/search", async (req: Request, res: Response) => runSearch({
    q: req.query.q,
    tab: req.query.tab,
    region: req.query.region,
    limit: req.query.limit,
  }, res));
};
