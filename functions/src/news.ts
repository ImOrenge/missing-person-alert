import axios from "axios";
import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import * as crypto from "crypto";

export const NEWS_COLLECTION = "newsArticles";
export const DEFAULT_NAVER_NEWS_QUERY = "실종";
export const NAVER_NEWS_CACHE_DAYS = 20;

const NAVER_API_HUB_NEWS_URL = "https://naverapihub.apigw.ntruss.com/search/v1/news";
const MAX_API_DISPLAY = 100;
const MAX_PUBLIC_PAGE_SIZE = 50;

interface NaverNewsApiItem {
  title?: unknown;
  originallink?: unknown;
  link?: unknown;
  description?: unknown;
  pubDate?: unknown;
}

interface NaverNewsApiResponse {
  lastBuildDate?: string;
  total?: number;
  start?: number;
  display?: number;
  items?: NaverNewsApiItem[];
}

export interface NaverNewsCredentials {
  clientId: string;
  clientSecret: string;
}

export interface PublicNewsItem {
  id: string;
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

export interface NewsCursor {
  pubDateMillis: number;
  id: string;
}

export interface ListNewsOptions {
  limit?: number;
  cursor?: string;
  from?: Date;
  to?: Date;
}

export interface ListNewsResult {
  items: PublicNewsItem[];
  nextCursor: string | null;
}

export interface DirectNaverNewsResult extends ListNewsResult {
  total: number;
}

export interface CaseNewsSearchCriteria {
  name: string;
  region: string | null;
  appearance: string | null;
}

export interface CaseNewsSearchPlan {
  criteria: CaseNewsSearchCriteria;
  queries: string[];
}

interface CaseNewsCursor {
  version: 1;
  fingerprint: string;
  starts: Array<number | null>;
}

const asString = (value: unknown): string => typeof value === "string" ? value : "";

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const createArticleId = (item: NaverNewsApiItem): string => {
  const link = asString(item.link) || asString(item.originallink);
  const fallback = `${asString(item.title)}\u0000${asString(item.pubDate)}`;
  return crypto.createHash("sha256").update(link || fallback).digest("hex");
};

const parsePublicationDate = (value: string, fallback: Date): Date => {
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis) : fallback;
};

const normalizeLimit = (value?: number): number => {
  if (!Number.isFinite(value)) return 20;
  return Math.min(MAX_PUBLIC_PAGE_SIZE, Math.max(1, Math.floor(value as number)));
};

const toBase64Url = (value: string): string => Buffer.from(value, "utf8")
  .toString("base64")
  .replace(/=/g, "")
  .replace(/\+/g, "-")
  .replace(/\//g, "_");

const fromBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
};

export const encodeNewsCursor = (cursor: NewsCursor): string => {
  return toBase64Url(JSON.stringify(cursor));
};

export const decodeNewsCursor = (value: string): NewsCursor => {
  try {
    const parsed = JSON.parse(fromBase64Url(value)) as Partial<NewsCursor>;
    if (!Number.isFinite(parsed.pubDateMillis) || typeof parsed.id !== "string" || parsed.id.length === 0 || parsed.id.length > 128) {
      throw new Error("invalid cursor payload");
    }
    return {pubDateMillis: parsed.pubDateMillis as number, id: parsed.id};
  } catch {
    throw new Error("INVALID_NEWS_CURSOR");
  }
};

export const fetchNaverNews = async (
  credentials: NaverNewsCredentials,
  query = DEFAULT_NAVER_NEWS_QUERY,
  display = MAX_API_DISPLAY,
  start = 1
): Promise<NaverNewsApiResponse> => {
  try {
    const response = await axios.get<NaverNewsApiResponse>(NAVER_API_HUB_NEWS_URL, {
      params: {
        query,
        display: Math.min(MAX_API_DISPLAY, Math.max(1, display)),
        start: Math.min(1000, Math.max(1, start)),
        sort: "date",
        format: "json",
      },
      headers: {
        "X-NCP-APIGW-API-KEY-ID": credentials.clientId,
        "X-NCP-APIGW-API-KEY": credentials.clientSecret,
      },
      timeout: 15000,
    });

    return response.data;
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    throw new Error(status ? `NAVER_NEWS_API_${status}` : "NAVER_NEWS_API_FAILED");
  }
};

export const buildCaseNewsQuery = (name: unknown): string | null => {
  if (typeof name !== "string") return null;
  const normalized = name
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[^0-9A-Za-z가-힣·\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length < 2 || normalized.length > 40) return null;
  if (["미상", "신원불상", "알수없음"].includes(normalized.replace(/\s/g, ""))) return null;
  if (normalized.includes("가명") || /[*○◯●]/.test(name) || /(?:x|o){2,}/i.test(name) || /^[가-힣]모(?:\s*씨)?$/.test(normalized)) return null;
  return `${normalized} 실종`;
};

const normalizeCaseSearchFragment = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[^0-9A-Za-z가-힣·\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length < 2) return null;
  return normalized.slice(0, maxLength).trim() || null;
};

const buildCaseRegion = (caseData: Record<string, unknown>): string | null => {
  const location = caseData.location && typeof caseData.location === "object"
    ? caseData.location as Record<string, unknown>
    : {};
  const address = normalizeCaseSearchFragment(location.address ?? caseData.address, 80);
  if (!address || /^(?:주소|지역)\s*미상$/.test(address)) return null;
  const tokens = address.split(" ").filter((token) => token !== "대한민국");
  return tokens.slice(0, 2).join(" ").slice(0, 32).trim() || null;
};

const buildCaseAppearance = (caseData: Record<string, unknown>): string | null => {
  const candidates = [caseData.clothes, caseData.description];
  for (const candidate of candidates) {
    const normalized = normalizeCaseSearchFragment(candidate, 80);
    if (!normalized || /^(?:특이사항|인상착의|착의)\s*(?:없음|정보 없음)$/.test(normalized)) continue;
    const tokens = normalized.split(" ");
    const selected: string[] = [];
    for (const token of tokens) {
      if (selected.join(" ").length + token.length + 1 > 42) break;
      selected.push(token);
      if (selected.length >= 7) break;
    }
    const appearance = selected.join(" ").trim();
    if (appearance.length >= 2) return appearance;
  }
  return null;
};

export const buildCaseNewsSearchPlan = (caseData: Record<string, unknown>): CaseNewsSearchPlan | null => {
  const baseQuery = buildCaseNewsQuery(caseData.name);
  if (!baseQuery) return null;
  const name = baseQuery.replace(/\s+실종$/, "");
  const region = buildCaseRegion(caseData);
  const appearance = buildCaseAppearance(caseData);
  const queries = [
    baseQuery,
    region ? `${name} ${region} 실종` : null,
    appearance ? `${name} ${appearance} 실종` : null,
  ].filter((query): query is string => Boolean(query));

  return {
    criteria: {name, region, appearance},
    queries: Array.from(new Set(queries)),
  };
};

const createCaseSearchFingerprint = (queries: string[]): string => {
  return crypto.createHash("sha256").update(queries.join("\u0000")).digest("hex").slice(0, 16);
};

const encodeCaseNewsCursor = (cursor: CaseNewsCursor): string => toBase64Url(JSON.stringify(cursor));

const decodeCaseNewsCursor = (value: string, queries: string[]): CaseNewsCursor => {
  try {
    if (value.length > 512) throw new Error("cursor too long");
    const parsed = JSON.parse(fromBase64Url(value)) as Partial<CaseNewsCursor>;
    const starts = parsed.starts;
    if (parsed.version !== 1 || parsed.fingerprint !== createCaseSearchFingerprint(queries) || !Array.isArray(starts) || starts.length !== queries.length) {
      throw new Error("cursor metadata mismatch");
    }
    if (!starts.every((start) => start === null || (Number.isInteger(start) && (start as number) >= 1 && (start as number) <= 1000))) {
      throw new Error("invalid cursor starts");
    }
    return parsed as CaseNewsCursor;
  } catch {
    throw new Error("INVALID_CASE_NEWS_CURSOR");
  }
};

const serializeNaverApiItem = (item: NaverNewsApiItem): PublicNewsItem | null => {
  const title = asString(item.title);
  const originalLink = asString(item.originallink);
  const naverLink = asString(item.link);
  const publicLink = naverLink || originalLink;
  if (!title || !isHttpUrl(publicLink)) return null;

  return {
    id: createArticleId(item),
    title,
    originallink: isHttpUrl(originalLink) ? originalLink : "",
    link: publicLink,
    description: asString(item.description),
    pubDate: asString(item.pubDate),
  };
};

export const searchNaverNews = async (
  credentials: NaverNewsCredentials,
  query: string,
  display = 20,
  start = 1
): Promise<DirectNaverNewsResult> => {
  const normalizedDisplay = Math.min(MAX_API_DISPLAY, Math.max(1, Math.floor(display)));
  const normalizedStart = Math.min(1000, Math.max(1, Math.floor(start)));
  const response = await fetchNaverNews(credentials, query, normalizedDisplay, normalizedStart);
  const rawItems = Array.isArray(response.items) ? response.items : [];
  const items = rawItems
    .map(serializeNaverApiItem)
    .filter((item): item is PublicNewsItem => item !== null);
  const total = Number.isFinite(response.total) ? Math.max(0, response.total as number) : 0;
  const nextStart = normalizedStart + rawItems.length;
  const hasMore = rawItems.length === normalizedDisplay && nextStart <= 1000 && (total === 0 || nextStart <= total);

  return {
    items,
    nextCursor: hasMore ? String(nextStart) : null,
    total,
  };
};

export const searchCaseNaverNews = async (
  credentials: NaverNewsCredentials,
  queries: string[],
  display = 20,
  cursor?: string
): Promise<DirectNaverNewsResult & {requestCount: number}> => {
  const uniqueQueries = Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean))).slice(0, 3);
  if (uniqueQueries.length === 0) throw new Error("INVALID_CASE_NEWS_QUERIES");
  const normalizedDisplay = Math.min(MAX_PUBLIC_PAGE_SIZE, Math.max(uniqueQueries.length, Math.floor(display)));
  const previousCursor = cursor ? decodeCaseNewsCursor(cursor, uniqueQueries) : null;
  const baseAllocation = Math.floor(normalizedDisplay / uniqueQueries.length);
  const remainder = normalizedDisplay % uniqueQueries.length;
  const allocations = uniqueQueries.map((_query, index) => baseAllocation + (index < remainder ? 1 : 0));
  const starts = previousCursor?.starts ?? uniqueQueries.map(() => 1);
  const activeSearches = uniqueQueries
    .map((query, index) => ({query, index, start: starts[index], display: allocations[index]}))
    .filter((search): search is {query: string; index: number; start: number; display: number} => search.start !== null);
  const responses = await Promise.all(activeSearches.map((search) =>
    searchNaverNews(credentials, search.query, search.display, search.start)
  ));
  const nextStarts: Array<number | null> = uniqueQueries.map(() => null);
  const deduplicated = new Map<string, PublicNewsItem>();
  let total = 0;

  responses.forEach((response, responseIndex) => {
    const search = activeSearches[responseIndex];
    nextStarts[search.index] = response.nextCursor ? Number(response.nextCursor) : null;
    total += response.total;
    response.items.forEach((item) => {
      if (!deduplicated.has(item.id)) deduplicated.set(item.id, item);
    });
  });

  const items = Array.from(deduplicated.values())
    .sort((left, right) => {
      const rightDate = Date.parse(right.pubDate);
      const leftDate = Date.parse(left.pubDate);
      return (Number.isFinite(rightDate) ? rightDate : 0) - (Number.isFinite(leftDate) ? leftDate : 0);
    })
    .slice(0, normalizedDisplay);
  const nextCursor = nextStarts.some((start) => start !== null)
    ? encodeCaseNewsCursor({
      version: 1,
      fingerprint: createCaseSearchFingerprint(uniqueQueries),
      starts: nextStarts,
    })
    : null;

  return {items, nextCursor, total, requestCount: activeSearches.length};
};

export const syncNaverNews = async (
  db: FirebaseFirestore.Firestore,
  credentials: NaverNewsCredentials,
  query = DEFAULT_NAVER_NEWS_QUERY
): Promise<{received: number; stored: number; skipped: number;}> => {
  const response = await fetchNaverNews(credentials, query);
  const items = Array.isArray(response.items) ? response.items : [];
  const fetchedAtDate = new Date();
  const fetchedAt = Timestamp.fromDate(fetchedAtDate);
  const expiresAt = Timestamp.fromMillis(
    fetchedAtDate.getTime() + NAVER_NEWS_CACHE_DAYS * 24 * 60 * 60 * 1000
  );
  const batchId = fetchedAtDate.toISOString();
  const batch = db.batch();
  let stored = 0;
  let skipped = 0;

  items.forEach((item, index) => {
    const title = asString(item.title);
    const originalLink = asString(item.originallink);
    const naverLink = asString(item.link);
    const publicLink = naverLink || originalLink;

    if (!title || !isHttpUrl(publicLink)) {
      skipped += 1;
      return;
    }

    const articleId = createArticleId(item);
    const rawPubDate = asString(item.pubDate);
    const pubDateAt = Timestamp.fromDate(parsePublicationDate(rawPubDate, fetchedAtDate));
    const docRef = db.collection(NEWS_COLLECTION).doc(articleId);

    batch.set(docRef, {
      source: "NAVER_API_HUB",
      query,
      resultRank: index + 1,
      batchId,
      title,
      originallink: isHttpUrl(originalLink) ? originalLink : "",
      link: publicLink,
      description: asString(item.description),
      pubDate: rawPubDate,
      pubDateAt,
      fetchedAt,
      expiresAt,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    stored += 1;
  });

  if (stored > 0) {
    await batch.commit();
  }

  return {received: items.length, stored, skipped};
};

export const cleanupExpiredNaverNews = async (
  db: FirebaseFirestore.Firestore,
  batchSize = 400
): Promise<number> => {
  let deleted = 0;
  const now = Timestamp.now();

  while (true) {
    const snapshot = await db.collection(NEWS_COLLECTION)
      .where("expiresAt", "<=", now)
      .limit(batchSize)
      .get();

    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;

    if (snapshot.size < batchSize) break;
  }

  return deleted;
};

const serializeNewsDocument = (doc: FirebaseFirestore.QueryDocumentSnapshot): PublicNewsItem | null => {
  const data = doc.data();
  const title = asString(data.title);
  const link = asString(data.link);
  if (!title || !isHttpUrl(link)) return null;

  return {
    id: doc.id,
    title,
    originallink: asString(data.originallink),
    link,
    description: asString(data.description),
    pubDate: asString(data.pubDate),
  };
};

export const listNaverNews = async (
  db: FirebaseFirestore.Firestore,
  options: ListNewsOptions = {}
): Promise<ListNewsResult> => {
  const limit = normalizeLimit(options.limit);
  let query: FirebaseFirestore.Query = db.collection(NEWS_COLLECTION);

  if (options.from) {
    query = query.where("pubDateAt", ">=", Timestamp.fromDate(options.from));
  }
  if (options.to) {
    query = query.where("pubDateAt", "<=", Timestamp.fromDate(options.to));
  }

  query = query
    .orderBy("pubDateAt", "desc")
    .orderBy(admin.firestore.FieldPath.documentId(), "desc");

  if (options.cursor) {
    const cursor = decodeNewsCursor(options.cursor);
    query = query.startAfter(Timestamp.fromMillis(cursor.pubDateMillis), cursor.id);
  }

  const snapshot = await query.limit(limit + 1).get();
  const now = Date.now();
  const visibleDocs = snapshot.docs.filter((doc) => {
    const expiresAt = doc.get("expiresAt");
    return expiresAt instanceof Timestamp && expiresAt.toMillis() > now;
  });
  const pageDocs = visibleDocs.slice(0, limit);
  const items = pageDocs
    .map(serializeNewsDocument)
    .filter((item): item is PublicNewsItem => item !== null);

  const hasMore = snapshot.size > limit;
  const lastDoc = snapshot.docs[Math.min(limit, snapshot.docs.length) - 1];
  const pubDateAt = lastDoc?.get("pubDateAt");
  const nextCursor = hasMore && lastDoc && pubDateAt instanceof Timestamp
    ? encodeNewsCursor({pubDateMillis: pubDateAt.toMillis(), id: lastDoc.id})
    : null;

  return {items, nextCursor};
};
