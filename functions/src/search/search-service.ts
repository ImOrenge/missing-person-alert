import * as admin from "firebase-admin";
import {listNaverNews} from "../news";
import {PublicSearchItem, PublicSearchTab} from "./contracts";
import {matchesKoreanQuery, normalizeKoreanSearchText} from "./normalize-korean";
import {projectNewsSearchItem, projectOfficialCaseSearchItem, projectPublicReportSearchItem} from "./project-public-record";

interface SearchOptions {
  query: string;
  tab: PublicSearchTab;
  region?: string;
  limit: number;
  includeReports?: boolean;
}

const CASE_CACHE_TTL_MS = 5 * 60 * 1000;
const AUXILIARY_CACHE_TTL_MS = 60 * 1000;

interface CandidateCache {
  expiresAt: number;
  items: PublicSearchItem[];
}

let caseCandidateCache: CandidateCache | null = null;
let reportCandidateCache: CandidateCache | null = null;
let newsCandidateCache: CandidateCache | null = null;
let caseCandidatePromise: Promise<PublicSearchItem[]> | null = null;
let reportCandidatePromise: Promise<PublicSearchItem[]> | null = null;
let newsCandidatePromise: Promise<PublicSearchItem[]> | null = null;

export const invalidatePublicSearchCache = (): void => {
  caseCandidateCache = null;
  reportCandidateCache = null;
  newsCandidateCache = null;
};

const loadCaseCandidates = async (db: admin.firestore.Firestore): Promise<PublicSearchItem[]> => {
  if (caseCandidateCache && caseCandidateCache.expiresAt > Date.now()) return caseCandidateCache.items;
  if (caseCandidatePromise) return caseCandidatePromise;
  caseCandidatePromise = (async () => {
    const snapshot = await db.collection("missingPersons").where("seoVisible", "==", true).limit(500).get();
    const items = snapshot.docs.flatMap((document) => {
      const item = projectOfficialCaseSearchItem(document.id, document.data());
      return item ? [item] : [];
    });
    caseCandidateCache = {expiresAt: Date.now() + CASE_CACHE_TTL_MS, items};
    return items;
  })().finally(() => {
    caseCandidatePromise = null;
  });
  return caseCandidatePromise;
};

const loadReportCandidates = async (db: admin.firestore.Firestore): Promise<PublicSearchItem[]> => {
  if (reportCandidateCache && reportCandidateCache.expiresAt > Date.now()) return reportCandidateCache.items;
  if (reportCandidatePromise) return reportCandidatePromise;
  reportCandidatePromise = (async () => {
    const snapshot = await db.collection("publicReports").limit(200).get();
    const items = snapshot.docs.flatMap((document) => {
      const item = projectPublicReportSearchItem(document.id, document.data());
      return item ? [item] : [];
    });
    reportCandidateCache = {expiresAt: Date.now() + AUXILIARY_CACHE_TTL_MS, items};
    return items;
  })().finally(() => {
    reportCandidatePromise = null;
  });
  return reportCandidatePromise;
};

const loadNewsCandidates = async (db: admin.firestore.Firestore): Promise<PublicSearchItem[]> => {
  if (newsCandidateCache && newsCandidateCache.expiresAt > Date.now()) return newsCandidateCache.items;
  if (newsCandidatePromise) return newsCandidatePromise;
  newsCandidatePromise = (async () => {
    const result = await listNaverNews(db, {limit: 50});
    const items = result.items.flatMap((article) => {
      const item = projectNewsSearchItem(article as unknown as Record<string, unknown>);
      return item ? [item] : [];
    });
    newsCandidateCache = {expiresAt: Date.now() + AUXILIARY_CACHE_TTL_MS, items};
    return items;
  })().finally(() => {
    newsCandidatePromise = null;
  });
  return newsCandidatePromise;
};

const itemMatches = (query: string, region: string, item: PublicSearchItem): boolean => {
  const queryMatch = matchesKoreanQuery(query, [item.title, item.summary, item.regionLabel, item.statusLabel]);
  const regionMatch = !region || normalizeKoreanSearchText(item.regionLabel).includes(region);
  return queryMatch && regionMatch;
};

export const searchPublicRecords = async (
  db: admin.firestore.Firestore,
  options: SearchOptions,
): Promise<{items: PublicSearchItem[]; capped: boolean}> => {
  const normalizedQuery = normalizeKoreanSearchText(options.query);
  const normalizedRegion = normalizeKoreanSearchText(options.region);
  const wantsCases = options.tab === "all" || options.tab === "cases";
  const wantsReports = options.includeReports !== false && (options.tab === "all" || options.tab === "reports");
  const wantsNews = options.tab === "all" || options.tab === "news";

  const [caseItems, reportItems, newsItems] = await Promise.all([
    wantsCases ? loadCaseCandidates(db) : Promise.resolve([]),
    wantsReports ? loadReportCandidates(db) : Promise.resolve([]),
    wantsNews ? loadNewsCandidates(db) : Promise.resolve([]),
  ]);

  const candidates: PublicSearchItem[] = [...caseItems, ...reportItems, ...newsItems];

  const matched = candidates
    .filter((item) => itemMatches(normalizedQuery, normalizedRegion, item))
    .sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  return {items: matched.slice(0, options.limit), capped: matched.length > options.limit};
};
