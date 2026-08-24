import axios, {AxiosInstance} from "axios";
import {
  PUBLIC_SEARCH_ITEM_KEYS,
  PublicSearchItem,
  PublicSearchKind,
  PublicSearchTab,
} from "./contracts";

export interface AlgoliaConfig {
  applicationId: string;
  apiKey: string;
  indexPrefix: string;
}

export interface AlgoliaSearchInput {
  query: string;
  tab: PublicSearchTab;
  region?: string;
  limit: number;
  includeReports: boolean;
}

export interface AlgoliaSearchResult {
  items: PublicSearchItem[];
  capped: boolean;
}

const SEARCH_KINDS: PublicSearchKind[] = ["case", "report", "news"];
const INDEX_SUFFIX: Record<PublicSearchKind, string> = {
  case: "cases_public_v1",
  report: "reports_public_v1",
  news: "news_public_v1",
};

const asNonEmptyString = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
};

const asOptionalHttpOrRelativeUrl = (value: unknown): string | undefined => {
  const candidate = asNonEmptyString(value, 2048);
  if (!candidate) return undefined;
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
};

export const normalizeAlgoliaConfig = (config: Partial<AlgoliaConfig>): AlgoliaConfig | null => {
  const applicationId = asNonEmptyString(config.applicationId, 128);
  const apiKey = asNonEmptyString(config.apiKey, 512);
  const indexPrefix = asNonEmptyString(config.indexPrefix, 80);
  if (!applicationId || !apiKey || !indexPrefix || !/^[A-Za-z0-9_-]+$/.test(indexPrefix)) return null;
  return {applicationId, apiKey, indexPrefix};
};

export const algoliaIndexName = (prefix: string, kind: PublicSearchKind): string =>
  `${prefix}_${INDEX_SUFFIX[kind]}`;

export const sanitizeAlgoliaHit = (hit: Record<string, unknown>): PublicSearchItem | null => {
  const id = asNonEmptyString(hit.id || hit.objectID, 200);
  const kind = asNonEmptyString(hit.kind, 16) as PublicSearchKind | undefined;
  const title = asNonEmptyString(hit.title, 200);
  const summary = asNonEmptyString(hit.summary, kind === "report" ? 2000 : 240);
  const sourceLabel = asNonEmptyString(hit.sourceLabel, 120);
  const href = asOptionalHttpOrRelativeUrl(hit.href);
  if (!id || !kind || !SEARCH_KINDS.includes(kind) || !title || summary === undefined || !sourceLabel || !href) return null;

  const item: PublicSearchItem = {id, kind, title, summary, sourceLabel, href};
  const regionLabel = asNonEmptyString(hit.regionLabel, kind === "report" ? 300 : 200);
  const thumbnailUrl = asOptionalHttpOrRelativeUrl(hit.thumbnailUrl);
  const statusLabel = asNonEmptyString(hit.statusLabel, 80);
  const publishedAt = asNonEmptyString(hit.publishedAt, 64);
  if (regionLabel) item.regionLabel = regionLabel;
  if (thumbnailUrl) item.thumbnailUrl = thumbnailUrl;
  if (statusLabel) item.statusLabel = statusLabel;
  if (publishedAt && Number.isFinite(Date.parse(publishedAt))) item.publishedAt = new Date(publishedAt).toISOString();
  return item;
};

const kindsForTab = (tab: PublicSearchTab, includeReports: boolean): PublicSearchKind[] => {
  if (tab === "cases") return ["case"];
  if (tab === "reports") return includeReports ? ["report"] : [];
  if (tab === "news") return ["news"];
  return includeReports ? SEARCH_KINDS : ["case", "news"];
};

const createClient = (config: AlgoliaConfig): AxiosInstance => axios.create({
  baseURL: `https://${config.applicationId}-dsn.algolia.net`,
  timeout: 4000,
  headers: {
    "X-Algolia-Application-Id": config.applicationId,
    "X-Algolia-API-Key": config.apiKey,
    "Content-Type": "application/json",
  },
});

export const buildAlgoliaSearchRequests = (
  config: AlgoliaConfig,
  input: AlgoliaSearchInput,
): Array<Record<string, unknown>> => {
  const kinds = kindsForTab(input.tab, input.includeReports);
  const query = [input.query, input.region].filter(Boolean).join(" ");
  const attributesToRetrieve = ["objectID", ...PUBLIC_SEARCH_ITEM_KEYS];
  const perIndexLimit = Math.min(50, Math.max(1, input.limit));
  return kinds.map((kind) => ({
    indexName: algoliaIndexName(config.indexPrefix, kind),
    query,
    hitsPerPage: perIndexLimit,
    analytics: false,
    clickAnalytics: false,
    attributesToRetrieve,
    attributesToHighlight: [],
    attributesToSnippet: [],
    getRankingInfo: false,
  }));
};

export const searchAlgoliaPublicRecords = async (
  rawConfig: Partial<AlgoliaConfig>,
  input: AlgoliaSearchInput,
): Promise<AlgoliaSearchResult> => {
  const config = normalizeAlgoliaConfig(rawConfig);
  if (!config) throw new Error("ALGOLIA_CONFIG_UNAVAILABLE");
  const requests = buildAlgoliaSearchRequests(config, input);
  if (requests.length === 0) return {items: [], capped: false};

  const response = await createClient(config).post("/1/indexes/*/queries", {
    requests,
  });
  const results = Array.isArray(response.data?.results) ? response.data.results : [];
  const candidates = results.flatMap((result: Record<string, unknown>) =>
    Array.isArray(result.hits) ? result.hits : []);
  const items = candidates
    .map((hit: unknown) => hit && typeof hit === "object" ? sanitizeAlgoliaHit(hit as Record<string, unknown>) : null)
    .filter((item: PublicSearchItem | null): item is PublicSearchItem => item !== null)
    .slice(0, input.limit);
  const totalHits = results.reduce((sum: number, result: Record<string, unknown>) =>
    sum + (typeof result.nbHits === "number" ? result.nbHits : 0), 0);
  return {items, capped: totalHits > items.length};
};
