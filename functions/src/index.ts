import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import express, {NextFunction, Request, Response} from "express";
import cors from "cors";
import axios from "axios";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {defineSecret} from "firebase-functions/params";
import {
  CommentReport,
  CommentReportReason,
  CommentReportStatus,
  MissingPersonComment
} from "./types/missingPersonComments";
import {
  REGION_METADATA,
  REGION_ALIAS_LOOKUP,
  findRegionByName,
  RegionMetadata
} from "./regionMetadata";
import * as crypto from "crypto";
import {
  buildCaseNewsSearchPlan,
  cleanupExpiredNaverNews,
  DEFAULT_NAVER_NEWS_QUERY,
  listNaverNews,
  NAVER_NEWS_CACHE_DAYS,
  searchCaseNaverNews,
  syncNaverNews,
} from "./news";
import {
  buildCollectionSitemap,
  buildGoneHtml,
  buildMissingPersonCollectionHtml,
  buildMissingPersonHtml,
  buildMissingPersonsSitemap,
  buildSitemapIndex,
  getPublicMissingType,
  getPublicRegion,
  getPublicRegionForAddress,
  isSearchIndexableMissingPerson,
  PUBLIC_MISSING_TYPES,
  PUBLIC_REGIONS,
  toPublicMissingPerson,
} from "./missingPersonSeo";
import {
  loadReportingFeatureFlags,
  registerPublicRuntimeConfigRoute,
} from "./runtimeConfig";
import {registerPublicSearchRoutes} from "./search/routes";
import {getAlgoliaSearchConfig} from "./search/algolia-runtime";
import {registerReportRoutesV2} from "./reports/routes";
import {consumeReportingRateLimit} from "./reports/rate-limit";
import {registerAdminReportRoutes} from "./reports/admin-routes";
import {registerNotificationSubscriptionRoutes} from "./notifications/routes";
import {registerDashboardPreferenceRoutes} from "./dashboard/routes";
import {registerBannerRoutes} from "./banners/routes";
import {registerPublicExploreRoutes} from "./explore/routes";
export {processReportMediaUpload} from "./reports/media-pipeline";
export {enforceReportRetention} from "./reports/retention";
export {enforceClosedCasePolicy} from "./reports/case-lifecycle";
export {
  queueNotificationEvent,
  createNewMissingCaseNotification,
  targetNotificationEventTask,
  deliverNotificationTask,
  requeuePendingNotificationEvents,
} from "./notifications/dispatcher";
export {
  syncAlgoliaOfficialCase,
  syncAlgoliaPublicReport,
  syncAlgoliaNewsArticle,
} from "./search/algolia-sync";

// Firebase Admin 초기화
admin.initializeApp();

// Express 앱 생성
const app = express();
type AuthedRequest = Request & {user?: admin.auth.DecodedIdToken};
const db = admin.firestore();
const safe182EsntlId = defineSecret("SAFE182_ESNTL_ID");
const safe182AuthKey = defineSecret("SAFE182_AUTH_KEY");
const naverApiHubClientId = defineSecret("NAVER_API_HUB_CLIENT_ID");
const naverApiHubClientSecret = defineSecret("NAVER_API_HUB_CLIENT_SECRET");

const REGION_DAILY_DOC = () => db.collection("stats").doc("regionDaily");
const REGION_METADATA_DOC = () => db.collection("stats").doc("regionMetadata");

const DEFAULT_REGION = REGION_ALIAS_LOOKUP["기타/미상"] ?? REGION_METADATA.find((region) => region.id === "unknown")!;
const REGION_STATS_HISTORY_DAYS = 120;
const SUB_REGION_FALLBACK_NAME = "기타";

const formatDateKey = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateValue = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (/^\d{8}$/.test(trimmed)) {
      const year = trimmed.slice(0, 4);
      const month = trimmed.slice(4, 6);
      const day = trimmed.slice(6, 8);
      const formatted = `${year}-${month}-${day}T00:00:00Z`;
      const parsed = new Date(formatted);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (typeof value === "object" && value && "toDate" in value && typeof (value as any).toDate === "function") {
    try {
      const parsed = (value as any).toDate();
      return parsed instanceof Date && !isNaN(parsed.getTime()) ? parsed : null;
    } catch (error) {
      logger.warn("날짜 변환 실패", error);
      return null;
    }
  }

  return null;
};

const normalizeRegionToken = (token: string): string => {
  return token
    .replace(/\s+/g, "")
    .replace(/[^\u3131-\uD79D\w]/g, "")
    .trim();
};

const resolveRegionFromAddress = (address: unknown): RegionMetadata => {
  if (typeof address !== "string" || address.trim().length === 0) {
    return DEFAULT_REGION;
  }

  const tokens = address.trim().split(/\s+/);
  if (tokens.length === 0) {
    return DEFAULT_REGION;
  }

  const firstToken = normalizeRegionToken(tokens[0]);
  const firstMatch = REGION_ALIAS_LOOKUP[firstToken] || REGION_ALIAS_LOOKUP[tokens[0]] || findRegionByName(tokens[0]);
  if (firstMatch && firstMatch.id !== "unknown") {
    return firstMatch;
  }

  if (tokens.length > 1) {
    const combined = normalizeRegionToken(`${tokens[0]} ${tokens[1]}`);
    const combinedMatch = REGION_ALIAS_LOOKUP[combined] || REGION_ALIAS_LOOKUP[`${tokens[0]}${tokens[1]}`];
    if (combinedMatch && combinedMatch.id !== "unknown") {
      return combinedMatch;
    }
  }

  if (tokens.length > 1) {
    const secondToken = normalizeRegionToken(tokens[1]);
    const secondMatch = REGION_ALIAS_LOOKUP[secondToken] || REGION_ALIAS_LOOKUP[tokens[1]];
    if (secondMatch && secondMatch.id !== "unknown") {
      return secondMatch;
    }
  }

  return DEFAULT_REGION;
};

const buildSubRegionId = (parentId: string, name: string): string => {
  const normalized = normalizeRegionToken(name);
  const suffix = normalized.length > 0 ? normalized.toLowerCase() : "misc";
  return `${parentId}-${suffix}`;
};

const resolveSubRegionFromAddress = (address: unknown, parentRegion: RegionMetadata): {id: string; name: string} => {
  if (typeof address !== "string" || address.trim().length === 0) {
    return {id: buildSubRegionId(parentRegion.id, SUB_REGION_FALLBACK_NAME), name: SUB_REGION_FALLBACK_NAME};
  }

  const tokens = address.trim().split(/\s+/);
  if (tokens.length < 2) {
    return {id: buildSubRegionId(parentRegion.id, SUB_REGION_FALLBACK_NAME), name: SUB_REGION_FALLBACK_NAME};
  }

  let candidate = tokens[1];

  if (tokens.length >= 3) {
    const second = tokens[1];
    const third = tokens[2];
    if ((/시$/.test(second) || /군$/.test(second)) && (/구$/.test(third) || /군$/.test(third) || /동$/.test(third))) {
      candidate = `${second} ${third}`;
    }
  }

  if (normalizeRegionToken(candidate).length === 0 || candidate === parentRegion.name) {
    candidate = SUB_REGION_FALLBACK_NAME;
  }

  return {id: buildSubRegionId(parentRegion.id, candidate), name: candidate};
};

// CORS 설정
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // 개발 환경 origin 목록
    const devOrigins = [
      "http://localhost:5173",
      "http://localhost:3001",
      "http://localhost:4173",
      "https://localhost:5173",
    ];

    // 배포 환경 origin 목록
    const prodOrigins = [
      "https://missing-person-alram.web.app",
      "https://missing-person-alram.firebaseapp.com",
    ];

    const allowedOrigins = [...devOrigins, ...prodOrigins];

    // origin이 없는 경우 (서버 간 통신)
    if (!origin) {
      return callback(null, true);
    }

    // 허용된 origin인 경우
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // development 환경에서는 모든 origin 허용
    logger.warn(`CORS 요청: ${origin}`);
    callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-recaptcha-token", "x-guest-id"],
};

app.use(cors(corsOptions));
app.use(express.json());
registerPublicRuntimeConfigRoute(app, db);
registerPublicSearchRoutes(app, db, {getAlgoliaConfig: getAlgoliaSearchConfig});
registerPublicExploreRoutes(app, db);

const SEO_SITEMAP_PAGE_SIZE = 1000;
const SEO_SITEMAP_MAX_PAGES = 50;
const SEO_EVENT_NAMES = ["seo_app_cta_click", "share_started", "call_112_click", "call_182_click"] as const;
type SeoEventName = typeof SEO_EVENT_NAMES[number];

const isSeoEventName = (value: unknown): value is SeoEventName =>
  typeof value === "string" && SEO_EVENT_NAMES.includes(value as SeoEventName);

const isSafeCaseId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\/\u0000-\u001f\u007f]/.test(value);

const seoulDateKey = (date: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
};

const recordSeoEvent = async (event: SeoEventName, caseId: string): Promise<void> => {
  const day = seoulDateKey(new Date());
  const caseKey = crypto.createHash("sha256").update(caseId).digest("hex").slice(0, 24);
  const totalRef = db.collection("seoMetrics").doc(day);
  const caseRef = totalRef.collection("cases").doc(caseKey);
  const batch = db.batch();
  batch.set(totalRef, {
    day,
    totals: {[event]: FieldValue.increment(1)},
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  batch.set(caseRef, {
    caseKey,
    events: {[event]: FieldValue.increment(1)},
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  await batch.commit();
};

const loadIndexablePersons = async (limit = 5000) => {
  const snapshot = await db.collection("missingPersons").where("seoVisible", "==", true).limit(limit).get();
  return snapshot.docs
    .filter((doc) => isSearchIndexableMissingPerson(doc.data()))
    .map((doc) => toPublicMissingPerson(doc.id, doc.data()))
    .sort((a, b) => (b.missingDate || "").localeCompare(a.missingDate || ""));
};

const collectionResponseHeaders = (hasPersons: boolean) => ({
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "public, max-age=0, s-maxage=300, must-revalidate",
  "X-Robots-Tag": hasPersons ? "index, follow, max-image-preview:large" : "noindex, follow",
});

const activeRegionLinks = (persons: ReturnType<typeof toPublicMissingPerson>[], limit = PUBLIC_REGIONS.length) => {
  const slugs = new Set(persons.map((person) => getPublicRegionForAddress(person.address)?.slug).filter(Boolean));
  return PUBLIC_REGIONS.filter((region) => slugs.has(region.slug)).slice(0, limit)
    .map((region) => ({href: `/missing/region/${region.slug}`, label: `${region.name} 실종자 현황`}));
};

app.get("/missing", async (_req: Request, res: Response) => {
  try {
    const allPersons = await loadIndexablePersons();
    const persons = allPersons.slice(0, 100);
    const typeLinks = PUBLIC_MISSING_TYPES.filter((missingType) =>
      allPersons.some((person) => missingType.types.includes(person.type)))
      .map((missingType) => ({href: `/missing/type/${missingType.slug}`, label: missingType.name}));
    const html = buildMissingPersonCollectionHtml({
      title: "실종자 검색·조회·찾기 - 최신 실종자 현황",
      description: "경찰청 안전Dream에서 현재 공개 수색 중인 최근 실종자를 이름, 지역, 인상착의로 검색하고 사진, 실종 날짜와 마지막 확인 위치를 조회하세요.",
      canonicalPath: "/missing",
      eyebrow: "전국 실종자 공개 검색",
      supportingCopy: "경기·강원·충북·충남·전북·전남·경북·경남 8도와 제주, 서울·부산·대구·인천·광주·대전·울산·세종까지 전국 17개 시·도의 최근 실종자와 실종아동·치매환자·장애인 공개 수색 정보를 찾아볼 수 있습니다.",
      relatedLinks: [...typeLinks, ...activeRegionLinks(allPersons)],
      persons,
    });
    return res.status(persons.length ? 200 : 404).set(collectionResponseHeaders(persons.length > 0)).send(html);
  } catch (error) {
    logger.error("실종자 검색 SEO 페이지 생성 실패", error);
    return res.status(503).set({"Retry-After": "300", "X-Robots-Tag": "noindex, nofollow"}).send(buildGoneHtml());
  }
});

app.get("/missing/type/:typeSlug", async (req: Request, res: Response) => {
  const missingType = getPublicMissingType(req.params.typeSlug || "");
  if (!missingType) return res.status(404).set("X-Robots-Tag", "noindex, nofollow").send(buildGoneHtml());
  try {
    const persons = (await loadIndexablePersons()).filter((person) => missingType.types.includes(person.type)).slice(0, 100);
    const html = buildMissingPersonCollectionHtml({
      title: missingType.title,
      description: missingType.description,
      canonicalPath: `/missing/type/${missingType.slug}`,
      eyebrow: missingType.eyebrow,
      supportingCopy: "공식 출처에서 공개 중인 사건만 제공하며 이름, 지역, 실종 날짜와 인상착의를 확인해 수색 정보를 찾을 수 있습니다.",
      relatedLinks: [
        {href: "/missing", label: "전체 실종자 검색·조회"},
        ...activeRegionLinks(persons),
      ],
      persons,
    });
    return res.status(persons.length ? 200 : 404).set(collectionResponseHeaders(persons.length > 0)).send(html);
  } catch (error) {
    logger.error("대상별 실종자 SEO 페이지 생성 실패", {type: missingType.slug, error});
    return res.status(503).set({"Retry-After": "300", "X-Robots-Tag": "noindex, nofollow"}).send(buildGoneHtml());
  }
});

app.get("/missing/today", async (_req: Request, res: Response) => {
  try {
    const today = seoulDateKey(new Date());
    const persons = (await loadIndexablePersons()).filter((person) =>
      person.missingDate ? seoulDateKey(new Date(person.missingDate)) === today : false).slice(0, 100);
    const html = buildMissingPersonCollectionHtml({
      title: `오늘의 실종자 공개 정보 - ${today}`,
      description: `${today}가 실종일로 표시된 경찰청 안전Dream 공개 정보입니다. 사진, 인상착의와 마지막 확인 지역을 확인하세요.`,
      canonicalPath: "/missing/today",
      eyebrow: "오늘의 공개 수색 정보",
      supportingCopy: "오늘 실종된 것으로 공개된 사건을 확인하고 이름, 지역과 인상착의로 실종자 정보를 검색할 수 있습니다.",
      relatedLinks: [{href: "/missing", label: "전체 실종자 검색·조회"}, ...activeRegionLinks(persons)],
      persons,
    });
    return res.status(persons.length ? 200 : 404).set(collectionResponseHeaders(persons.length > 0)).send(html);
  } catch (error) {
    logger.error("오늘 실종자 SEO 페이지 생성 실패", error);
    return res.status(503).set({"Retry-After": "300", "X-Robots-Tag": "noindex, nofollow"}).send(buildGoneHtml());
  }
});

app.get("/missing/region/:regionSlug", async (req: Request, res: Response) => {
  const region = getPublicRegion(req.params.regionSlug || "");
  if (!region) return res.status(404).set("X-Robots-Tag", "noindex, nofollow").send(buildGoneHtml());
  try {
    const persons = (await loadIndexablePersons()).filter((person) =>
      getPublicRegionForAddress(person.address)?.slug === region.slug).slice(0, 100);
    const html = buildMissingPersonCollectionHtml({
      title: `${region.name} 실종자 현황·검색 - 최신 공개 정보`,
      description: `${region.name}에서 현재 공개 수색 중인 최근 실종자를 찾고 사진, 인상착의, 실종 날짜와 마지막 확인 지역을 조회하세요.`,
      canonicalPath: `/missing/region/${region.slug}`,
      eyebrow: `${region.name} 공개 수색 정보`,
      supportingCopy: `${region.name} 실종자 지도와 목록을 통해 최근 공개 수색 정보를 확인할 수 있습니다. 공식 출처에서 종결된 사건은 검색 결과에서 제외됩니다.`,
      relatedLinks: [
        {href: "/missing", label: "전체 실종자 검색·조회"},
        ...PUBLIC_MISSING_TYPES.filter((missingType) => persons.some((person) => missingType.types.includes(person.type)))
          .map((missingType) => ({href: `/missing/type/${missingType.slug}`, label: missingType.name})),
      ],
      persons,
    });
    return res.status(persons.length ? 200 : 404).set(collectionResponseHeaders(persons.length > 0)).send(html);
  } catch (error) {
    logger.error("지역 실종자 SEO 페이지 생성 실패", {region: region.slug, error});
    return res.status(503).set({"Retry-After": "300", "X-Robots-Tag": "noindex, nofollow"}).send(buildGoneHtml());
  }
});

app.get("/missing/:caseId", async (req: Request, res: Response) => {
  const caseId = req.params.caseId?.trim();
  if (!caseId || caseId.length > 200) {
    return res.status(400).set("X-Robots-Tag", "noindex, nofollow").send(buildGoneHtml());
  }

  try {
    const snapshot = await db.collection("missingPersons").doc(caseId).get();
    const data = snapshot.data();
    if (!snapshot.exists || !data) {
      return res
        .status(404)
        .set({
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=0, s-maxage=60, must-revalidate",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
        })
        .send(buildGoneHtml());
    }
    if (!isSearchIndexableMissingPerson(data)) {
      return res
        .status(410)
        .set({
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=0, s-maxage=60, must-revalidate",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
        })
        .send(buildGoneHtml());
    }

    const reportingFlags = await loadReportingFeatureFlags(db);
    const publicReports = reportingFlags.reports_public_timeline_enabled
      ? (await db.collection("publicReports").where("caseId", "==", caseId).limit(100).get()).docs
        .map((document) => ({id: document.id, ...document.data()} as Record<string, any>))
        .filter((report) => report.visibility === "public" && ["approved", "forwarded", "confirmed"].includes(report.status))
        .map((report) => ({
          id: String(report.id),
          reportType: String(report.reportType || "sighting"),
          occurredAt: String(report.occurredAt || ""),
          publicDescription: String(report.publicDescription || ""),
          publicLocationText: String(report.publicLocationText || "지역 비공개"),
          publicStatus: report.status as "approved" | "forwarded" | "confirmed",
        }))
      : [];

    return res
      .status(200)
      .set({
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": reportingFlags.reports_public_timeline_enabled
          ? "public, max-age=0, s-maxage=30, must-revalidate"
          : "public, max-age=0, s-maxage=300, must-revalidate",
        "X-Robots-Tag": "index, follow, max-image-preview:large",
      })
      .send(buildMissingPersonHtml(toPublicMissingPerson(snapshot.id, data), publicReports));
  } catch (error) {
    logger.error("실종자 SEO 상세 페이지 생성 실패", {caseId, error});
    return res
      .status(503)
      .set({"Retry-After": "300", "X-Robots-Tag": "noindex, nofollow"})
      .send(buildGoneHtml());
  }
});

app.post("/api/seo/events", async (req: Request, res: Response) => {
  const {event, caseId} = req.body || {};
  if (!isSeoEventName(event) || !isSafeCaseId(caseId)) {
    return res.status(400).json({success: false});
  }
  try {
    await recordSeoEvent(event, caseId);
    return res.status(204).send();
  } catch (error) {
    logger.warn("SEO 전환 이벤트 기록 실패", {event, error});
    return res.status(204).send();
  }
});

app.get("/sitemap-missing-persons.xml", async (_req: Request, res: Response) => {
  try {
    const countSnapshot = await db.collection("missingPersons").where("seoVisible", "==", true).count().get();
    const count = countSnapshot.data().count;
    const pageCount = Math.max(1, Math.min(SEO_SITEMAP_MAX_PAGES, Math.ceil(count / SEO_SITEMAP_PAGE_SIZE)));
    const paths = Array.from({length: pageCount}, (_, index) => `/sitemaps/public-cases-${index + 1}.xml`);
    paths.push("/sitemaps/missing-collections.xml");
    return res
      .status(200)
      .set({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=900, must-revalidate",
      })
      .send(buildSitemapIndex(paths));
  } catch (error) {
    logger.error("실종자 사이트맵 인덱스 생성 실패", error);
    return res.status(503).set("Retry-After", "300").send("Service Unavailable");
  }
});

const serveMissingPersonsSitemapPage = async (req: Request, res: Response) => {
  const page = Number(req.params.page);
  if (!Number.isInteger(page) || page < 1 || page > SEO_SITEMAP_MAX_PAGES) {
    return res.status(404).set("X-Robots-Tag", "noindex").send("Not Found");
  }
  try {
    const snapshot = await db.collection("missingPersons")
      .where("seoVisible", "==", true)
      .orderBy(admin.firestore.FieldPath.documentId())
      .offset((page - 1) * SEO_SITEMAP_PAGE_SIZE)
      .limit(SEO_SITEMAP_PAGE_SIZE)
      .get();
    const persons = snapshot.docs.filter((doc) => isSearchIndexableMissingPerson(doc.data()))
      .map((doc) => toPublicMissingPerson(doc.id, doc.data()));
    return res.status(200).set({
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=900, must-revalidate",
    }).send(buildMissingPersonsSitemap(persons));
  } catch (error) {
    logger.error("실종자 분할 사이트맵 생성 실패", {page, error});
    return res.status(503).set("Retry-After", "300").send("Service Unavailable");
  }
};

app.get("/sitemaps/public-cases-:page.xml", serveMissingPersonsSitemapPage);
// Keep the previous child URL available while crawlers transition to the new sitemap index.
app.get("/sitemaps/missing-persons-:page.xml", serveMissingPersonsSitemapPage);

app.get("/sitemaps/missing-collections.xml", async (_req: Request, res: Response) => {
  try {
    const persons = await loadIndexablePersons();
    const regionSlugs = new Set(persons.map((person) => getPublicRegionForAddress(person.address)?.slug).filter(Boolean));
    const today = seoulDateKey(new Date());
    const paths = PUBLIC_REGIONS.filter((region) => regionSlugs.has(region.slug))
      .map((region) => `/missing/region/${region.slug}`);
    PUBLIC_MISSING_TYPES.filter((missingType) => persons.some((person) => missingType.types.includes(person.type)))
      .reverse()
      .forEach((missingType) => paths.unshift(`/missing/type/${missingType.slug}`));
    if (persons.length) paths.unshift("/missing");
    if (persons.some((person) => person.missingDate && seoulDateKey(new Date(person.missingDate)) === today)) paths.unshift("/missing/today");
    return res.status(200).set({
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=900, must-revalidate",
    }).send(buildCollectionSitemap(paths));
  } catch (error) {
    logger.error("실종자 컬렉션 사이트맵 생성 실패", error);
    return res.status(503).set("Retry-After", "300").send("Service Unavailable");
  }
});

const ANONYMOUS_PREFIX = "익명";
const COMMENT_COLLECTION = "missingPersonComments";
const REPORT_COLLECTION = "commentReports";
const NOTIFICATION_COLLECTION = "commentNotifications";
const VIEW_LOG_COLLECTION = "viewLogs";
const MISSING_PERSON_COLLECTION = "missingPersons";
const DATA_DELETION_COLLECTION = "dataDeletionLogs";
const DATA_DELETION_SECRET = process.env.DATA_DELETION_SECRET;
const META_APP_SECRET = process.env.META_APP_SECRET || process.env.THREADS_APP_SECRET || process.env.FACEBOOK_APP_SECRET;

const rateLimitCache = new Map<string, {count: number; resetAt: number}>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5분

const isAdminUser = (user?: admin.auth.DecodedIdToken | null): boolean => {
  if (!user) return false;
  return ["reportModerator", "seniorModerator", "agencyOperator", "privacyOfficer", "systemAdmin"]
    .some((claim) => (user as Record<string, unknown>)[claim] === true);
};

const base64UrlDecode = (input: string): Buffer => {
  let normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  if (pad === 2) {
    normalized += "==";
  } else if (pad === 3) {
    normalized += "=";
  } else if (pad !== 0) {
    normalized += "=".repeat(4 - pad);
  }
  return Buffer.from(normalized, "base64");
};

const decodeMetaSignedRequest = (signedRequest: string, secret: string) => {
  const [encodedSig, payload] = signedRequest.split(".", 2);
  if (!encodedSig || !payload) {
    throw new Error("INVALID_SIGNED_REQUEST_FORMAT");
  }

  const signature = base64UrlDecode(encodedSig);
  const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest();

  if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(signature, expectedSignature)) {
    throw new Error("INVALID_SIGNED_REQUEST_SIGNATURE");
  }

  const decodedPayload = base64UrlDecode(payload).toString("utf8");
  try {
    return JSON.parse(decodedPayload);
  } catch (error) {
    throw new Error("INVALID_SIGNED_REQUEST_PAYLOAD");
  }
};

type DeletionTaskResult = {
  task: string;
  success: boolean;
  count?: number;
  skipped?: boolean;
  message?: string;
};

const performDeletionTask = async (
  task: string,
  fn: () => Promise<{count?: number; skipped?: boolean}>,
  results: DeletionTaskResult[]
) => {
  try {
    const outcome = await fn();
    results.push({
      task,
      success: true,
      count: outcome.count,
      skipped: outcome.skipped,
    });
  } catch (error: any) {
    results.push({
      task,
      success: false,
      message: error?.message || "unknown-error",
    });
  }
};

const deleteDocIfExists = async (ref: FirebaseFirestore.DocumentReference): Promise<boolean> => {
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    return false;
  }
  await ref.delete();
  return true;
};

const deleteDocsByQuery = async (
  collectionName: string,
  fieldPath: string,
  value: unknown
): Promise<number> => {
  const snapshot = await db.collection(collectionName).where(fieldPath, "==", value).get();
  if (snapshot.empty) {
    return 0;
  }

  let batch = db.batch();
  let writesInBatch = 0;
  let total = 0;
  const commits: Array<Promise<FirebaseFirestore.WriteResult[]>> = [];

  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
    writesInBatch += 1;
    total += 1;

    if (writesInBatch >= 400) {
      commits.push(batch.commit());
      batch = db.batch();
      writesInBatch = 0;
    }
  });

  if (writesInBatch > 0) {
    commits.push(batch.commit());
  }

  await Promise.all(commits);
  return total;
};

const removeUserFromCommentLikes = async (uid: string): Promise<number> => {
  const snapshot = await db.collection(COMMENT_COLLECTION).where("likedBy", "array-contains", uid).get();
  if (snapshot.empty) {
    return 0;
  }

  await Promise.all(
    snapshot.docs.map(async (doc) => {
      const data = doc.data() as MissingPersonComment;
      const newLikedBy = (data.likedBy || []).filter((likeUid) => likeUid !== uid);
      const newLikes = Math.max(0, newLikedBy.length);
      await doc.ref.update({
        likedBy: newLikedBy,
        likes: newLikes,
        updatedAt: Timestamp.now(),
      });
    })
  );

  return snapshot.size;
};

const removeUserFromCommentReports = async (uid: string): Promise<number> => {
  const snapshot = await db.collection(COMMENT_COLLECTION).where("reportedBy", "array-contains", uid).get();
  if (snapshot.empty) {
    return 0;
  }

  await Promise.all(
    snapshot.docs.map(async (doc) => {
      const data = doc.data() as MissingPersonComment;
      const newReportedBy = (data.reportedBy || []).filter((reportUid) => reportUid !== uid);
      const reportCount = newReportedBy.length;
      await doc.ref.update({
        reportedBy: newReportedBy,
        reportCount,
        reported: reportCount > 0,
        updatedAt: Timestamp.now(),
      });
    })
  );

  return snapshot.size;
};

const maskName = (name: unknown): string => {
  if (typeof name !== "string") {
    return "미상";
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return "미상";
  }
  if (trimmed.length === 1) {
    return `${trimmed}**`;
  }
  return `${trimmed[0]}**`;
};

const REGION_NAME_REGEX = /^([가-힣]+(?:특별시|광역시|특별자치시|도|특별자치도))$/;
const EXCLUDED_REGIONS = new Set(["대한민국"]);

const pickRegionFromAddress = (address: string): string | null => {
  if (typeof address !== "string") {
    return null;
  }

  const tokens = address.trim().split(/\s+/);
  for (const token of tokens) {
    if (!token || EXCLUDED_REGIONS.has(token)) {
      continue;
    }
    if (REGION_NAME_REGEX.test(token)) {
      return token;
    }
  }

  return null;
};

const extractRegionFromData = (data: FirebaseFirestore.DocumentData | undefined): string => {
  if (!data) return "미상";
  const location = data.location;
  if (location && typeof location === "object") {
    const address = (location as any).address;
    if (typeof address === "string" && address.trim().length > 0) {
      const regionFromAddress = pickRegionFromAddress(address);
      if (regionFromAddress) {
        return regionFromAddress;
      }
    }
    const region = (location as any).region;
    if (typeof region === "string") {
      const trimmed = region.trim();
      if (trimmed && !EXCLUDED_REGIONS.has(trimmed)) {
        return trimmed;
      }
    }
  }
  return "미상";
};

const normalizeDateValue = (value: unknown): number | null => {
  if (!value) return null;
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const getReportTimestamp = (report: any): number | null => {
  if (!report || typeof report !== "object") {
    return null;
  }

  const candidates: unknown[] = [
    report?.reportedBy?.reportedAt,
    report?.createdAt,
    report?.reportedAt,
    report?.syncedAt,
    report?.fetchedAt,
    report?.missingDate,
  ];

  for (const value of candidates) {
    const normalized = normalizeDateValue(value);
    if (normalized !== null) {
      return normalized;
    }
  }

  return null;
};

const getComparableSnapshot = (data: FirebaseFirestore.DocumentData | undefined) => {
  if (!data) {
    return null;
  }
  return {
    status: typeof data.status === "string" ? data.status : "unknown",
    type: typeof data.type === "string" ? data.type : "unknown",
    gender: typeof data.gender === "string" ? data.gender : "unknown",
    region: extractRegionFromData(data),
    missingDate: normalizeDateValue(data.missingDate),
  };
};

const shouldRecalculateMissingPersonStats = (
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData | undefined
): boolean => {
  if (!before && after) return true;
  if (before && !after) return true;
  if (!before || !after) return true;

  const prev = getComparableSnapshot(before);
  const next = getComparableSnapshot(after);
  if (!prev || !next) return true;

  return (
    prev.status !== next.status ||
    prev.type !== next.type ||
    prev.gender !== next.gender ||
    prev.region !== next.region ||
    prev.missingDate !== next.missingDate
  );
};

const aggregateMissingPersonSummary = async () => {
  const snapshot = await db.collection(MISSING_PERSON_COLLECTION).get();

  const totals = {
    total: snapshot.size,
    active: 0,
    found: 0,
    investigating: 0,
    other: 0,
  };

  const statusCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  const genderCounts: Record<string, number> = {};
  const regionCounts: Record<string, number> = {};

  const recentRecords: Array<{
    id: string;
    maskedName: string;
    status: string;
    type: string;
    gender: string;
    region: string;
    missingDateMs: number | null;
    missingDate: string | null;
    updatedAt: string | null;
    source: string;
  }> = [];

  snapshot.docs.forEach((doc) => {
    const data = doc.data() || {};

    const status = typeof data.status === "string" ? data.status : "unknown";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (status === "active") totals.active += 1;
    else if (status === "found") totals.found += 1;
    else if (status === "investigating") totals.investigating += 1;
    else totals.other += 1;

    const type = typeof data.type === "string" ? data.type : "unknown";
    typeCounts[type] = (typeCounts[type] || 0) + 1;

    const gender = typeof data.gender === "string" ? data.gender : "unknown";
    genderCounts[gender] = (genderCounts[gender] || 0) + 1;

    const region = extractRegionFromData(data);
    regionCounts[region] = (regionCounts[region] || 0) + 1;

    const missingDateMs = normalizeDateValue(data.missingDate);
    const updatedAtMs = normalizeDateValue(data.updatedAt);

    recentRecords.push({
      id: doc.id,
      maskedName: maskName(data.name),
      status,
      type,
      gender,
      region,
      missingDateMs,
      missingDate: missingDateMs ? new Date(missingDateMs).toISOString().slice(0, 10) : null,
      updatedAt: updatedAtMs ? new Date(updatedAtMs).toISOString() : null,
      source: typeof data.source === "string" ? data.source : "unknown",
    });
  });

  recentRecords.sort((a, b) => {
    const aValue = a.missingDateMs ?? 0;
    const bValue = b.missingDateMs ?? 0;
    return bValue - aValue;
  });

  const recent = recentRecords.slice(0, 20).map(({missingDateMs, ...rest}) => rest);

  const timestamp = Timestamp.now();

  const statusArray = Object.entries(statusCounts).map(([status, count]) => ({status, count}));
  statusArray.sort((a, b) => b.count - a.count);

  const typeArray = Object.entries(typeCounts).map(([type, count]) => ({type, count}));
  typeArray.sort((a, b) => b.count - a.count);

  const genderArray = Object.entries(genderCounts).map(([gender, count]) => ({gender, count}));
  genderArray.sort((a, b) => b.count - a.count);

  const regionArray = Object.entries(regionCounts).map(([region, count]) => ({region, count}));
  regionArray.sort((a, b) => b.count - a.count);

  const summaryDoc = {
    totals,
    statuses: statusArray,
    types: typeArray,
    genders: genderArray,
    regions: regionArray,
    recent,
    generatedAt: timestamp.toDate().toISOString(),
    updatedAt: timestamp,
  };

  await db.collection("stats").doc("summary").set(summaryDoc, {merge: false});
  return summaryDoc;
};

const serializeSummaryDocument = (data: FirebaseFirestore.DocumentData | null | undefined) => {
  if (!data) {
    return null;
  }

  const {updatedAt, ...rest} = data;
  let updatedAtIso: string | null = null;
  if (updatedAt instanceof Timestamp) {
    updatedAtIso = updatedAt.toDate().toISOString();
  } else if (updatedAt instanceof Date) {
    updatedAtIso = updatedAt.toISOString();
  } else if (typeof updatedAt === "string") {
    updatedAtIso = updatedAt;
  }

  return {
    ...rest,
    updatedAt: updatedAtIso,
  };
};

export const missingPersonSummaryUpdater = onDocumentWritten(
  {
    document: `${MISSING_PERSON_COLLECTION}/{personId}`,
    region: "asia-northeast3",
  },
  async (event) => {
    const beforeSnapshot = event.data?.before;
    const afterSnapshot = event.data?.after;

    const beforeData = beforeSnapshot && beforeSnapshot.exists ? beforeSnapshot.data() : undefined;
    const afterData = afterSnapshot && afterSnapshot.exists ? afterSnapshot.data() : undefined;

    if (!shouldRecalculateMissingPersonStats(beforeData, afterData)) {
      return;
    }

    try {
      await aggregateMissingPersonSummary();
    } catch (error: any) {
      logger.error("missingPersonSummaryUpdater 실패", error);
      throw error;
    }
  }
);

const authenticate = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({success: false, error: "인증이 필요합니다"});
    }

    const token = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (error: any) {
    logger.error("인증 실패", error);
    res.status(401).json({success: false, error: "인증 토큰이 유효하지 않습니다"});
  }
};

const requireAdmin = [
  authenticate,
  (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!isAdminUser(req.user)) {
      return res.status(403).json({success: false, error: "관리자 권한이 필요합니다"});
    }
    next();
  }
];

const rateLimit = (keyExtractor: (req: AuthedRequest) => string) => {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const key = keyExtractor(req);
    if (!key) {
      return res.status(400).json({success: false, error: "잘못된 요청입니다"});
    }

    const now = Date.now();
    const entry = rateLimitCache.get(key);
    if (!entry || entry.resetAt < now) {
      rateLimitCache.set(key, {count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS});
      return next();
    }

    if (entry.count >= RATE_LIMIT_MAX) {
      return res.status(429).json({success: false, error: "요청 한도를 초과했습니다"});
    }

    entry.count += 1;
    rateLimitCache.set(key, entry);
    next();
  };
};

const verifyRecaptchaToken = async (token: string, expectedAction: string): Promise<boolean> => {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  if (!secretKey || !token) {
    const emulator = process.env.FUNCTIONS_EMULATOR === "true" || String(process.env.GCLOUD_PROJECT || "").startsWith("demo-");
    logger.warn(emulator ? "reCAPTCHA 검증 건너뜀 (로컬 Emulator)" : "reCAPTCHA 설정 또는 토큰 누락으로 요청 차단");
    return emulator;
  }

  try {
    const response = await axios.post("https://www.google.com/recaptcha/api/siteverify", null, {
      params: {
        secret: secretKey,
        response: token,
      },
    });

    if (!response.data?.success) {
      logger.error("reCAPTCHA 검증 실패", response.data);
      return false;
    }

    if (response.data.action && response.data.action !== expectedAction) {
      logger.warn(`reCAPTCHA 액션 불일치: ${response.data.action} (예상: ${expectedAction})`);
      return false;
    }

    const minScore = parseFloat(process.env.RECAPTCHA_MIN_SCORE || "0.5");
    if (typeof response.data.score === "number" && response.data.score < minScore) {
      logger.warn(`reCAPTCHA 점수가 낮음: ${response.data.score}`);
      return false;
    }

    return true;
  } catch (error: any) {
    logger.error("reCAPTCHA 검증 오류", error);
    return process.env.NODE_ENV !== "production";
  }
};

const ensureRecaptcha = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  const token = req.headers["x-recaptcha-token"] as string | undefined;
  const expectedAction = (req.headers["x-recaptcha-action"] as string) || "comment";
  const valid = await verifyRecaptchaToken(token || "", expectedAction);
  if (!valid) {
    return res.status(403).json({success: false, error: "reCAPTCHA 인증에 실패했습니다"});
  }
  next();
};

registerReportRoutesV2(app, {
  db,
  authenticate,
  ensureRecaptcha,
  rateLimit: async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({success: false, error: "AUTH_REQUIRED"});
    try {
      const outcome = await consumeReportingRateLimit(db, uid);
      res.set("X-RateLimit-Remaining", String(outcome.remaining));
      if (!outcome.allowed) {
        res.set("Retry-After", String(outcome.retryAfterSeconds));
        return res.status(429).json({success: false, error: "REPORT_RATE_LIMITED"});
      }
      return next();
    } catch {
      return res.status(503).json({success: false, error: "RATE_LIMIT_UNAVAILABLE"});
    }
  },
});
registerAdminReportRoutes(app, {db, authenticate});
registerNotificationSubscriptionRoutes(app, {db, authenticate});
registerDashboardPreferenceRoutes(app, {db, authenticate});
registerBannerRoutes(app, {db, authenticate});

const buildAnonymousName = () => {
  const random = Math.floor(Math.random() * 900) + 100;
  return `${ANONYMOUS_PREFIX}${random}`;
};

const mapCommentDoc = (doc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>): MissingPersonComment => {
  const data = doc.data() as MissingPersonComment;
  return {
    ...data,
    commentId: doc.id,
  };
};

const normalizeCommentImageUrls = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 2048)
    .slice(0, 3);
};

const notifyCommentReply = async (parent: MissingPersonComment, reply: MissingPersonComment) => {
  if (!parent.userId || parent.userId === reply.userId) return;

  const notificationRef = db.collection(NOTIFICATION_COLLECTION).doc();
  await notificationRef.set({
    notificationId: notificationRef.id,
    userId: parent.userId,
    commentId: parent.commentId,
    missingPersonId: reply.missingPersonId,
    replyCommentId: reply.commentId,
    type: "reply",
    isRead: false,
    createdAt: Timestamp.now(),
  });

  try {
    const tokenSnap = await db.collection("userTokens").doc(parent.userId).get();
    const tokenData = tokenSnap.data() || {};
    const tokens = Object.keys((tokenData.tokens || {}) as Record<string, unknown>);
    if (tokens.length === 0) return;

    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: "새 답글이 달렸습니다",
        body: `${reply.nickname}: ${reply.content.slice(0, 80)}`,
      },
      data: {
        intent: "community-reply",
        commentId: parent.commentId,
        replyCommentId: reply.commentId,
        missingPersonId: reply.missingPersonId,
        url: `/?view=community&personId=${encodeURIComponent(reply.missingPersonId)}&commentId=${encodeURIComponent(parent.commentId)}`,
      },
    });
  } catch (error: any) {
    logger.warn("답글 푸시 알림 발송 실패 (인앱 알림은 유지)", error?.message || error);
  }
};

// 헬스 체크
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    service: "missing-person-firebase-functions",
    timestamp: new Date().toISOString(),
  });
});

// 서버 상태
app.get("/api/status", (req: Request, res: Response) => {
  res.json({
    server: "running",
    service: "missing-person-reports",
    environment: "production",
    platform: "firebase-functions",
  });
});

const parseNewsDateQuery = (value: unknown, endOfDay = false): Date | undefined => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const suffix = endOfDay ? "T23:59:59.999+09:00" : "T00:00:00.000+09:00";
  const parsed = new Date(`${value}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const NAVER_CASE_SEARCH_DAILY_LIMIT = 5000;
const NAVER_CASE_SEARCH_PER_CASE_DAILY_LIMIT = 20;

const consumeCaseNewsSearchQuota = async (caseId: string, requestCost: number): Promise<"OK" | "CASE_LIMIT" | "DAILY_LIMIT"> => {
  const dayKey = formatDateKey(new Date(Date.now() + 9 * 60 * 60 * 1000));
  const caseKey = crypto.createHash("sha256").update(caseId).digest("hex").slice(0, 32);
  const quotaRef = db.collection("serviceQuotas").doc(`naver-case-search-${dayKey}`);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(quotaRef);
    const data = snapshot.exists ? snapshot.data() as Record<string, any> : {};
    const total = Number.isFinite(data.total) ? Number(data.total) : 0;
    const cases = data.cases && typeof data.cases === "object" ? {...data.cases} : {};
    const caseCount = Number.isFinite(cases[caseKey]) ? Number(cases[caseKey]) : 0;

    if (total + requestCost > NAVER_CASE_SEARCH_DAILY_LIMIT) return "DAILY_LIMIT";
    if (caseCount >= NAVER_CASE_SEARCH_PER_CASE_DAILY_LIMIT) return "CASE_LIMIT";

    cases[caseKey] = caseCount + 1;
    transaction.set(quotaRef, {
      source: "NAVER_API_HUB",
      purpose: "CASE_CONTEXT_SEARCH_RATE_LIMIT",
      dayKey,
      total: total + requestCost,
      cases,
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 8 * 24 * 60 * 60 * 1000),
    }, {merge: false});
    return "OK";
  });
};

const cleanupExpiredCaseNewsSearchQuotas = async (): Promise<number> => {
  const snapshot = await db.collection("serviceQuotas")
    .where("expiresAt", "<=", Timestamp.now())
    .limit(400)
    .get();
  if (snapshot.empty) return 0;
  const batch = db.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
  return snapshot.size;
};

app.get("/api/news", async (req: Request, res: Response) => {
  try {
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const from = parseNewsDateQuery(req.query.from);
    const to = parseNewsDateQuery(req.query.to, true);

    if (req.query.from && !from) {
      return res.status(400).json({success: false, error: "from은 YYYY-MM-DD 형식이어야 합니다"});
    }
    if (req.query.to && !to) {
      return res.status(400).json({success: false, error: "to는 YYYY-MM-DD 형식이어야 합니다"});
    }
    if (from && to && from.getTime() > to.getTime()) {
      return res.status(400).json({success: false, error: "from은 to보다 늦을 수 없습니다"});
    }

    const result = await listNaverNews(db, {limit, cursor, from, to});
    res.set("Cache-Control", "no-store");
    return res.json({
      success: true,
      source: "NAVER_API_HUB",
      sourceLabel: "NAVER 검색 결과",
      mode: "HISTORY_CACHE",
      query: process.env.NAVER_NEWS_QUERY?.trim() || DEFAULT_NAVER_NEWS_QUERY,
      retentionDays: NAVER_NEWS_CACHE_DAYS,
      ...result,
    });
  } catch (error: any) {
    if (error?.message === "INVALID_NEWS_CURSOR") {
      return res.status(400).json({success: false, error: "뉴스 cursor가 유효하지 않습니다"});
    }
    logger.error("뉴스 목록 조회 실패", error);
    return res.status(500).json({success: false, error: "뉴스 목록을 불러오지 못했습니다"});
  }
});

app.get("/api/missing-persons/:caseId/news-search", async (req: Request, res: Response) => {
  const {caseId} = req.params;
  try {
    if (!caseId || caseId.length > 128 || /[\/\u0000-\u001f\u007f]/.test(caseId)) {
      return res.status(400).json({success: false, error: "유효한 실종자 식별코드가 필요합니다"});
    }

    const requestedLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
    const limit = Number.isFinite(requestedLimit) ? Math.min(20, Math.max(1, Math.floor(requestedLimit))) : 20;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

    const caseSnapshot = await db.collection("missingPersons").doc(caseId).get();
    if (!caseSnapshot.exists) {
      return res.status(404).json({success: false, error: "실종자 정보를 찾을 수 없습니다"});
    }

    const caseData = caseSnapshot.data() as Record<string, unknown>;
    const searchPlan = buildCaseNewsSearchPlan(caseData);
    if (!searchPlan) {
      return res.status(422).json({
        success: false,
        error: "이름이 비공개이거나 불명확해 개별 뉴스 검색을 제공할 수 없습니다",
      });
    }

    const quota = await consumeCaseNewsSearchQuota(caseId, searchPlan.queries.length);
    if (quota !== "OK") {
      return res.status(429).json({
        success: false,
        error: quota === "CASE_LIMIT"
          ? "이 실종자에 대한 오늘의 뉴스 검색 한도를 초과했습니다"
          : "오늘의 뉴스 검색 한도를 초과했습니다",
      });
    }

    const clientId = naverApiHubClientId.value();
    const clientSecret = naverApiHubClientSecret.value();
    if (!clientId || !clientSecret) {
      return res.status(503).json({success: false, error: "NAVER 뉴스 검색 설정이 완료되지 않았습니다"});
    }

    const result = await searchCaseNaverNews({clientId, clientSecret}, searchPlan.queries, limit, cursor);
    res.set("Cache-Control", "private, no-store");
    return res.json({
      success: true,
      source: "NAVER_API_HUB",
      sourceLabel: "NAVER 검색 결과",
      mode: "CASE_CONTEXT_SEARCH",
      query: searchPlan.queries[0],
      queries: searchPlan.queries,
      searchCriteria: searchPlan.criteria,
      retentionDays: 0,
      associationStored: false,
      caseContext: {
        id: caseSnapshot.id,
        name: searchPlan.criteria.name,
        verification: "UNVERIFIED_SEARCH_RESULTS",
      },
      ...result,
    });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "UNKNOWN";
    logger.error("실종자별 NAVER 뉴스 검색 실패", {caseId, code: message});
    if (message === "INVALID_CASE_NEWS_CURSOR") {
      return res.status(400).json({success: false, error: "뉴스 cursor가 유효하지 않습니다"});
    }
    if (message.startsWith("NAVER_NEWS_API_")) {
      return res.status(502).json({success: false, error: "NAVER 뉴스 검색에 일시적으로 실패했습니다"});
    }
    return res.status(500).json({success: false, error: "실종자별 뉴스 검색에 실패했습니다"});
  }
});

app.get("/api/admin/reports/summary", requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const docSnap = await db.collection("stats").doc("summary").get();
    if (!docSnap.exists) {
      const summary = await aggregateMissingPersonSummary();
      return res.json({
        success: true,
        summary: serializeSummaryDocument(summary),
        regenerated: true,
      });
    }

    res.json({
      success: true,
      summary: serializeSummaryDocument(docSnap.data()),
      regenerated: false,
    });
  } catch (error: any) {
    logger.error("요약 리포트 조회 실패", error);
    res.status(500).json({
      success: false,
      error: "리포트 데이터를 불러오지 못했습니다",
    });
  }
});

app.post("/api/admin/reports/summary/recalculate", requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const summary = await aggregateMissingPersonSummary();
    res.json({
      success: true,
      summary: serializeSummaryDocument(summary),
    });
  } catch (error: any) {
    logger.error("요약 리포트 재계산 실패", error);
    res.status(500).json({
      success: false,
      error: "리포트를 재계산하지 못했습니다",
    });
  }
});

app.get("/api/auth/data-deletion", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Submit a POST request to this endpoint with a user identifier (uid) to remove user data.",
    requirements: {
      tokenHeader: DATA_DELETION_SECRET ? "x-deletion-token" : null,
      supportedBodyFields: ["uid", "user_id", "userId", "signed_request"],
      statusEndpoint: "/api/auth/data-deletion/status?code={confirmation_code}",
    },
  });
});

app.get("/api/auth/data-deletion/status", async (req: Request, res: Response) => {
  try {
    const {code} = req.query;
    if (typeof code !== "string" || code.trim().length === 0) {
      return res.status(400).json({success: false, error: "code 파라미터가 필요합니다"});
    }

    const docRef = db.collection(DATA_DELETION_COLLECTION).doc(code.trim());
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      return res.status(404).json({success: false, error: "삭제 요청을 찾을 수 없습니다"});
    }

    res.json({
      success: true,
      ...snapshot.data(),
    });
  } catch (error: any) {
    logger.error("데이터 삭제 상태 조회 실패", error);
    res.status(500).json({
      success: false,
      error: "데이터 삭제 상태 조회 중 오류가 발생했습니다",
    });
  }
});

app.post("/api/auth/data-deletion", async (req: Request, res: Response) => {
  try {
    const results: DeletionTaskResult[] = [];
    const tokenFromHeader = req.headers["x-deletion-token"] as string | undefined;
    const tokenFromQuery = typeof req.query.token === "string" ? req.query.token : undefined;
    const tokenFromBody = typeof req.body?.token === "string" ? req.body.token : undefined;
    const providedToken = tokenFromHeader || tokenFromQuery || tokenFromBody;

    if (DATA_DELETION_SECRET && DATA_DELETION_SECRET !== providedToken) {
      return res.status(403).json({success: false, error: "삭제 토큰이 유효하지 않습니다"});
    }

    let uidCandidate: unknown =
      req.body?.uid ??
      req.body?.user_id ??
      req.body?.userId ??
      req.query?.uid ??
      req.query?.user_id ??
      req.query?.userId;

    let signedRequestPayload: any = null;
    const signedRequest = typeof req.body?.signed_request === "string" ? req.body.signed_request : undefined;

    if (!uidCandidate && signedRequest) {
      if (!META_APP_SECRET) {
        return res.status(400).json({
          success: false,
          error: "signed_request를 처리하려면 META_APP_SECRET 환경 변수가 필요합니다",
        });
      }

      try {
        signedRequestPayload = decodeMetaSignedRequest(signedRequest, META_APP_SECRET);
        uidCandidate = signedRequestPayload?.user_id ?? signedRequestPayload?.userId ?? signedRequestPayload?.uid;
      } catch (error: any) {
        return res.status(400).json({
          success: false,
          error: "SIGNED_REQUEST_INVALID",
          details: error?.message || "Failed to verify signed_request",
        });
      }
    }

    if (typeof uidCandidate !== "string" || uidCandidate.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "삭제할 사용자 uid가 필요합니다",
      });
    }

    const uid = uidCandidate.trim();

    await performDeletionTask(
      "auth.deleteUser",
      async () => {
        try {
          await admin.auth().deleteUser(uid);
          return {count: 1};
        } catch (error: any) {
          if (error?.code === "auth/user-not-found") {
            return {count: 0, skipped: true};
          }
          throw error;
        }
      },
      results
    );

    await performDeletionTask(
      "firestore.users",
      async () => {
        const deleted = await deleteDocIfExists(db.collection("users").doc(uid));
        return {count: deleted ? 1 : 0, skipped: !deleted};
      },
      results
    );

    await performDeletionTask(
      "firestore.userTokens",
      async () => {
        const deleted = await deleteDocIfExists(db.collection("userTokens").doc(uid));
        return {count: deleted ? 1 : 0, skipped: !deleted};
      },
      results
    );

    await performDeletionTask(
      "firestore.missing_persons",
      async () => {
        const count = await deleteDocsByQuery("missing_persons", "reportedBy.uid", uid);
        return {count};
      },
      results
    );

    await performDeletionTask(
      "firestore.missingPersonComments",
      async () => {
        const count = await deleteDocsByQuery(COMMENT_COLLECTION, "userId", uid);
        return {count};
      },
      results
    );

    await performDeletionTask(
      "firestore.commentNotifications",
      async () => {
        const count = await deleteDocsByQuery(NOTIFICATION_COLLECTION, "userId", uid);
        return {count};
      },
      results
    );

    await performDeletionTask(
      "firestore.commentReports",
      async () => {
        const count = await deleteDocsByQuery(REPORT_COLLECTION, "reportedBy", uid);
        return {count};
      },
      results
    );

    await performDeletionTask(
      "firestore.activeSessions",
      async () => {
        const count = await deleteDocsByQuery("activeSessions", "userId", uid);
        return {count};
      },
      results
    );

    await performDeletionTask(
      "firestore.viewLogs",
      async () => {
        const count = await deleteDocsByQuery(VIEW_LOG_COLLECTION, "viewerId", uid);
        return {count};
      },
      results
    );

    await performDeletionTask(
      "firestore.commentLikesArrayCleanup",
      async () => {
        const count = await removeUserFromCommentLikes(uid);
        return {count};
      },
      results
    );

    await performDeletionTask(
      "firestore.commentReportsArrayCleanup",
      async () => {
        const count = await removeUserFromCommentReports(uid);
        return {count};
      },
      results
    );

    const allSuccessful = results.every((task) => task.success);
    const timestamp = Timestamp.now();
    const deletionCode = `${uid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    const protocolHeader = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
    const hostHeader = (req.headers["x-forwarded-host"] as string) || req.get("host") || "";
    const statusUrl = `${protocolHeader}://${hostHeader}/api/auth/data-deletion/status?code=${encodeURIComponent(deletionCode)}`;

    await db.collection(DATA_DELETION_COLLECTION).doc(deletionCode).set({
      code: deletionCode,
      uid,
      processedAt: timestamp,
      success: allSuccessful,
      tasks: results,
      signedRequest: !!signedRequest,
      requester: {
        ip: req.ip,
        userAgent: req.get("user-agent") || null,
        tokenProvided: !!providedToken,
      },
      metaPayload: signedRequestPayload || null,
    });

    res.json({
      url: statusUrl,
      confirmation_code: deletionCode,
      success: allSuccessful,
      tasks: results,
    });
  } catch (error: any) {
    logger.error("데이터 삭제 처리 실패", error);
    res.status(500).json({
      success: false,
      error: "데이터 삭제 처리 중 오류가 발생했습니다",
      details: error?.message || "unknown-error",
    });
  }
});

const incrementViewHandler = async (req: Request, res: Response) => {
  try {
    const {id} = req.params;
    const {guestId, userId} = req.body || {};

    if (!id) {
      return res.status(400).json({error: "실종자 ID가 필요합니다."});
    }

    const now = Date.now();
    const safeGuestId = typeof guestId === "string" && guestId.trim().length > 0 ? guestId.trim() : undefined;
    const safeUserId = typeof userId === "string" && userId.trim().length > 0 ? userId.trim() : undefined;
    const viewId = safeUserId || safeGuestId || `anonymous_${now}`;
    const personRef = db.collection(MISSING_PERSON_COLLECTION).doc(id);
    const viewLogRef = db.collection(VIEW_LOG_COLLECTION).doc(`${id}_${viewId}`);

    const personDoc = await personRef.get();
    if (!personDoc.exists) {
      return res.status(404).json({error: "실종자 정보를 찾을 수 없습니다."});
    }

    const existingLogSnap = await viewLogRef.get();
    const existingLog = existingLogSnap.data() as {lastViewed?: number | Timestamp} | undefined;
    const lastViewed = existingLog?.lastViewed instanceof Timestamp
      ? existingLog.lastViewed.toMillis()
      : typeof existingLog?.lastViewed === "number"
        ? existingLog.lastViewed
        : undefined;

    const oneHourAgo = now - 60 * 60 * 1000;
    if (existingLogSnap.exists && lastViewed && lastViewed > oneHourAgo) {
      const personData = personDoc.data() || {};
      return res.json({
        viewCount: personData.viewCount || 0,
        viewStats: personData.viewStats || {total: personData.viewCount || 0},
        alreadyViewed: true,
      });
    }

    const result = await db.runTransaction(async (transaction) => {
      const freshPersonSnap = await transaction.get(personRef);
      if (!freshPersonSnap.exists) {
        throw new Error("실종자 정보를 찾을 수 없습니다.");
      }

      const freshLogSnap = await transaction.get(viewLogRef);
      const personData = freshPersonSnap.data() || {};
      const currentViewCount = personData.viewCount || 0;
      const currentViewStats = personData.viewStats || {};

      const newViewCount = currentViewCount + 1;
      const newViewStats = {
        total: newViewCount,
        lastViewed: now,
        uniqueViewers: currentViewStats.uniqueViewers || 0,
      };

      if (!freshLogSnap.exists) {
        newViewStats.uniqueViewers += 1;
      }

      transaction.update(personRef, {
        viewCount: newViewCount,
        viewStats: newViewStats,
        updatedAt: now,
      });

      const previousViewCount = freshLogSnap.exists ? (freshLogSnap.data()?.viewCount || 0) : 0;
      transaction.set(viewLogRef, {
        personId: id,
        viewerId: viewId,
        viewerType: safeUserId ? "user" : "guest",
        lastViewed: now,
        viewCount: previousViewCount + 1,
        updatedAt: now,
      }, {merge: true});

      return {
        viewCount: newViewCount,
        viewStats: newViewStats,
      };
    });

    res.json({
      success: true,
      viewCount: result.viewCount,
      viewStats: result.viewStats,
    });
  } catch (error: any) {
    logger.error("조회수 증가 실패", error);
    res.status(500).json({
      error: "조회수 증가에 실패했습니다.",
      details: error?.message || "unknown-error",
    });
  }
};

app.post("/api/views/:id/increment", incrementViewHandler);
app.post("/views/:id/increment", incrementViewHandler);

const getTopViewsHandler = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 50);

    const snapshot = await db.collection(MISSING_PERSON_COLLECTION)
      .where("status", "==", "active")
      .orderBy("viewCount", "desc")
      .limit(limit)
      .get();

    const persons = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      persons,
      count: persons.length,
    });
  } catch (error: any) {
    logger.error("상위 조회수 목록 조회 실패", error);
    res.status(500).json({
      error: "상위 조회수 목록 조회에 실패했습니다.",
      details: error?.message || "unknown-error",
    });
  }
};

app.get("/api/views/top", getTopViewsHandler);
app.get("/views/top", getTopViewsHandler);

const getViewHandler = async (req: Request, res: Response) => {
  try {
    const {id} = req.params;
    if (!id) {
      return res.status(400).json({error: "실종자 ID가 필요합니다."});
    }

    const personSnap = await db.collection(MISSING_PERSON_COLLECTION).doc(id).get();
    if (!personSnap.exists) {
      return res.status(404).json({error: "실종자 정보를 찾을 수 없습니다."});
    }

    const data = personSnap.data() || {};
    res.json({
      viewCount: data.viewCount || 0,
      viewStats: data.viewStats || {total: data.viewCount || 0},
    });
  } catch (error: any) {
    logger.error("조회수 조회 실패", error);
    res.status(500).json({
      error: "조회수 조회에 실패했습니다.",
      details: error?.message || "unknown-error",
    });
  }
};

app.get("/api/views/:id", getViewHandler);
app.get("/views/:id", getViewHandler);

app.get("/api/community/feed", async (req: Request, res: Response) => {
  try {
    const {type, order = "latest", missingPersonId, limit = "100"} = req.query;
    const size = Math.min(parseInt(limit as string, 10) || 100, 200);
    let queryRef = db.collection(COMMENT_COLLECTION) as FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;

    if (order === "popular") {
      queryRef = queryRef.orderBy("likes", "desc");
    } else {
      queryRef = queryRef.orderBy("createdAt", "desc");
    }

    const snapshot = await queryRef.limit(size).get();
    const comments = snapshot.docs
      .map(mapCommentDoc)
      .filter((comment) => !comment.isDeleted && !comment.isHidden)
      .filter((comment) => !type || comment.type === type)
      .filter((comment) => !missingPersonId || comment.missingPersonId === missingPersonId);

    res.json({success: true, count: comments.length, comments});
  } catch (error: any) {
    logger.error("소통 피드 조회 실패", error);
    res.status(500).json({success: false, error: "소통 피드를 불러오지 못했습니다"});
  }
});

app.get("/api/comments/:missingPersonId", async (req: Request, res: Response) => {
  try {
    const {missingPersonId} = req.params;
    const {type, order = "latest", limit = "50"} = req.query;

    if (!missingPersonId) {
      return res.status(400).json({success: false, error: "missingPersonId가 필요합니다"});
    }

    let queryRef = db.collection(COMMENT_COLLECTION)
      .where("missingPersonId", "==", missingPersonId) as FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;

    if (type && typeof type === "string") {
      queryRef = queryRef.where("type", "==", type);
    }

    if (order === "popular") {
      queryRef = queryRef.orderBy("likes", "desc").orderBy("createdAt", "desc");
    } else {
      queryRef = queryRef.orderBy("createdAt", "desc");
    }

    const size = Math.min(parseInt(limit as string, 10) || 50, 100);
    queryRef = queryRef.limit(size);

    const snapshot = await queryRef.get();
    const comments = snapshot.docs
      .map(mapCommentDoc)
      .filter((comment) => !comment.isDeleted && !comment.isHidden);

    res.json({success: true, count: comments.length, comments});
  } catch (error: any) {
    logger.error("댓글 조회 실패", error);
    res.status(500).json({success: false, error: "댓글을 불러오지 못했습니다"});
  }
});

app.post(
  "/api/comments",
  authenticate,
  ensureRecaptcha,
  rateLimit((req) => req.user?.uid ?? "anonymous"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const {missingPersonId, content, type, isAnonymous = false, imageUrls} = req.body || {};

      if (!missingPersonId || typeof missingPersonId !== "string") {
        return res.status(400).json({success: false, error: "missingPersonId가 필요합니다"});
      }
      if (!content || typeof content !== "string" || content.trim().length < 10) {
        return res.status(400).json({success: false, error: "내용은 10자 이상이어야 합니다"});
      }
      const commentType = (type || "support") as string;
      if (!["sighting", "question", "support"].includes(commentType)) {
        return res.status(400).json({success: false, error: "지원하지 않는 댓글 유형입니다"});
      }

      if (Array.isArray(imageUrls) && imageUrls.length > 3) {
        return res.status(400).json({success: false, error: "사진은 최대 3장까지 첨부할 수 있습니다"});
      }
      const safeImageUrls = normalizeCommentImageUrls(imageUrls);

      const userId = req.user?.uid as string;
      const userRecord = await admin.auth().getUser(userId);

      const nickname = isAnonymous
        ? buildAnonymousName()
        : (userRecord.displayName || userRecord.email || userRecord.phoneNumber || buildAnonymousName());

      const now = Timestamp.now();
      const docRef = db.collection(COMMENT_COLLECTION).doc();

      const comment: MissingPersonComment = {
        commentId: docRef.id,
        missingPersonId,
        userId,
        nickname,
        isAnonymous,
        content: content.trim(),
        type: commentType as any,
        parentCommentId: null,
        imageUrls: safeImageUrls,
        replyCount: 0,
        createdAt: now,
        updatedAt: now,
        likes: 0,
        likedBy: [],
        isEdited: false,
        isDeleted: false,
        reported: false,
        reportCount: 0,
        reportedBy: [],
        isHidden: false,
      };

      await docRef.set(comment);

      res.status(201).json({success: true, comment});
    } catch (error: any) {
      logger.error("댓글 작성 실패", error);
      res.status(500).json({success: false, error: "댓글 작성 중 오류가 발생했습니다"});
    }
  }
);

app.post(
  "/api/comments/:commentId/replies",
  authenticate,
  ensureRecaptcha,
  rateLimit((req) => req.user?.uid ?? "anonymous"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const {commentId} = req.params;
      const {content, isAnonymous = false, imageUrls} = req.body || {};

      if (!content || typeof content !== "string" || content.trim().length < 10) {
        return res.status(400).json({success: false, error: "답글은 10자 이상이어야 합니다"});
      }
      if (Array.isArray(imageUrls) && imageUrls.length > 3) {
        return res.status(400).json({success: false, error: "사진은 최대 3장까지 첨부할 수 있습니다"});
      }

      const parentRef = db.collection(COMMENT_COLLECTION).doc(commentId);
      const parentSnap = await parentRef.get();
      if (!parentSnap.exists) {
        return res.status(404).json({success: false, error: "원문을 찾을 수 없습니다"});
      }

      const parent = mapCommentDoc(parentSnap as any);
      if (parent.isDeleted || parent.isHidden) {
        return res.status(410).json({success: false, error: "숨겨진 글에는 답글을 작성할 수 없습니다"});
      }
      if (parent.parentCommentId) {
        return res.status(400).json({success: false, error: "답글에는 다시 답글을 달 수 없습니다"});
      }

      const userId = req.user?.uid as string;
      const userRecord = await admin.auth().getUser(userId);
      const nickname = isAnonymous
        ? buildAnonymousName()
        : (userRecord.displayName || userRecord.email || userRecord.phoneNumber || buildAnonymousName());
      const now = Timestamp.now();
      const replyRef = db.collection(COMMENT_COLLECTION).doc();
      const reply: MissingPersonComment = {
        commentId: replyRef.id,
        missingPersonId: parent.missingPersonId,
        userId,
        nickname,
        isAnonymous,
        content: content.trim(),
        type: parent.type,
        parentCommentId: parent.commentId,
        imageUrls: normalizeCommentImageUrls(imageUrls),
        replyCount: 0,
        createdAt: now,
        updatedAt: now,
        likes: 0,
        likedBy: [],
        isEdited: false,
        isDeleted: false,
        reported: false,
        reportCount: 0,
        reportedBy: [],
        isHidden: false,
      };

      await db.runTransaction(async (tx) => {
        const currentParentSnap = await tx.get(parentRef);
        if (!currentParentSnap.exists) throw new Error("PARENT_NOT_FOUND");
        const currentParent = currentParentSnap.data() as MissingPersonComment;
        tx.set(replyRef, reply);
        tx.update(parentRef, {replyCount: (currentParent.replyCount || 0) + 1, updatedAt: now});
      });

      void notifyCommentReply(parent, reply);
      res.status(201).json({success: true, comment: reply});
    } catch (error: any) {
      if (error?.message === "PARENT_NOT_FOUND") {
        return res.status(404).json({success: false, error: "원문을 찾을 수 없습니다"});
      }
      logger.error("답글 작성 실패", error);
      res.status(500).json({success: false, error: "답글 작성 중 오류가 발생했습니다"});
    }
  }
);

app.patch(
  "/api/comments/:commentId",
  authenticate,
  rateLimit((req) => req.user?.uid ?? "anonymous"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const {commentId} = req.params;
      const {content} = req.body || {};

      if (!content || typeof content !== "string" || content.trim().length < 10) {
        return res.status(400).json({success: false, error: "내용은 10자 이상이어야 합니다"});
      }

      const docRef = db.collection(COMMENT_COLLECTION).doc(commentId);
      const snapshot = await docRef.get();

      if (!snapshot.exists) {
        return res.status(404).json({success: false, error: "댓글을 찾을 수 없습니다"});
      }

      const comment = snapshot.data() as MissingPersonComment;
      const isOwner = comment.userId === req.user?.uid;

      if (!isOwner && !isAdminUser(req.user)) {
        return res.status(403).json({success: false, error: "수정 권한이 없습니다"});
      }

      await docRef.update({
        content: content.trim(),
        updatedAt: Timestamp.now(),
        isEdited: true,
      });

      const updatedSnap = await docRef.get();
      res.json({success: true, comment: mapCommentDoc(updatedSnap as any)});
    } catch (error: any) {
      logger.error("댓글 수정 실패", error);
      res.status(500).json({success: false, error: "댓글 수정 중 오류가 발생했습니다"});
    }
  }
);

app.delete(
  "/api/comments/:commentId",
  authenticate,
  rateLimit((req) => req.user?.uid ?? "anonymous"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const {commentId} = req.params;
      const docRef = db.collection(COMMENT_COLLECTION).doc(commentId);
      const snapshot = await docRef.get();

      if (!snapshot.exists) {
        return res.status(404).json({success: false, error: "댓글을 찾을 수 없습니다"});
      }

      const comment = snapshot.data() as MissingPersonComment;
      const isOwner = comment.userId === req.user?.uid;

      if (!isOwner && !isAdminUser(req.user)) {
        return res.status(403).json({success: false, error: "삭제 권한이 없습니다"});
      }

      await docRef.update({
        isDeleted: true,
        isHidden: true,
        updatedAt: Timestamp.now(),
      });

      res.json({success: true});
    } catch (error: any) {
      logger.error("댓글 삭제 실패", error);
      res.status(500).json({success: false, error: "댓글 삭제 중 오류가 발생했습니다"});
    }
  }
);

app.post(
  "/api/comments/:commentId/like",
  authenticate,
  rateLimit((req) => `like:${req.user?.uid ?? "anonymous"}`),
  async (req: AuthedRequest, res: Response) => {
    try {
      const {commentId} = req.params;
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({success: false, error: "인증이 필요합니다"});
      }
      const docRef = db.collection(COMMENT_COLLECTION).doc(commentId);

      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        if (!snap.exists) {
          throw new Error("NOT_FOUND");
        }

        const comment = snap.data() as MissingPersonComment;
        const likedSet = new Set(comment.likedBy || []);
        let liked = false;

        if (likedSet.has(userId!)) {
          likedSet.delete(userId!);
          liked = false;
        } else {
          likedSet.add(userId!);
          liked = true;
        }

        const likes = likedSet.size;
        tx.update(docRef, {
          likedBy: Array.from(likedSet),
          likes,
        });

        return {liked, likes};
      });

      res.json({success: true, ...result});
    } catch (error: any) {
      if (error.message === "NOT_FOUND") {
        return res.status(404).json({success: false, error: "댓글을 찾을 수 없습니다"});
      }
      logger.error("댓글 공감 실패", error);
      res.status(500).json({success: false, error: "공감 처리 중 오류가 발생했습니다"});
    }
  }
);

app.post(
  "/api/comments/:commentId/report",
  authenticate,
  ensureRecaptcha,
  rateLimit((req) => `report:${req.user?.uid ?? "anonymous"}`),
  async (req: AuthedRequest, res: Response) => {
    try {
      const {commentId} = req.params;
      const {reason, description} = req.body || {};
      const userId = req.user?.uid;

      if (!userId) {
        return res.status(401).json({success: false, error: "인증이 필요합니다"});
      }

      if (!reason || !["spam", "inappropriate", "false", "other"].includes(reason)) {
        return res.status(400).json({success: false, error: "유효한 신고 사유가 필요합니다"});
      }

      const commentRef = db.collection(COMMENT_COLLECTION).doc(commentId);
      const reportRef = db.collection(REPORT_COLLECTION).doc();

      await db.runTransaction(async (tx) => {
        const commentSnap = await tx.get(commentRef);
        if (!commentSnap.exists) {
          throw new Error("NOT_FOUND");
        }

        const comment = commentSnap.data() as MissingPersonComment;
        const reportedBy = new Set(comment.reportedBy || []);
        if (reportedBy.has(userId)) {
          throw new Error("ALREADY_REPORTED");
        }

        reportedBy.add(userId);
        const reportCount = reportedBy.size;
        const isHidden = comment.isHidden || reportCount >= 3;

        const reportDoc: CommentReport = {
          reportId: reportRef.id,
          commentId,
          reportedBy: userId,
          reason: reason as CommentReportReason,
          description: typeof description === "string" ? description : undefined,
          createdAt: Timestamp.now(),
          status: "pending",
        };

        tx.set(reportRef, reportDoc);
        tx.update(commentRef, {
          reported: true,
          reportCount,
          reportedBy: Array.from(reportedBy),
          isHidden,
          updatedAt: Timestamp.now(),
        });
      });

      res.json({success: true});
    } catch (error: any) {
      if (error.message === "NOT_FOUND") {
        return res.status(404).json({success: false, error: "댓글을 찾을 수 없습니다"});
      }
      if (error.message === "ALREADY_REPORTED") {
        return res.status(409).json({success: false, error: "이미 신고한 댓글입니다"});
      }
      logger.error("댓글 신고 실패", error);
      res.status(500).json({success: false, error: "신고 처리 중 오류가 발생했습니다"});
    }
  }
);

app.get("/api/comment-reports", requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const {status = "pending", limit = "100"} = req.query;
    const validStatuses = ["pending", "resolved", "dismissed"];
    if (typeof status !== "string" || !validStatuses.includes(status)) {
      return res.status(400).json({success: false, error: "잘못된 상태 값입니다"});
    }

    let queryRef = db.collection(REPORT_COLLECTION)
      .where("status", "==", status)
      .orderBy("createdAt", "desc") as FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;

    queryRef = queryRef.limit(Math.min(parseInt(limit as string, 10) || 100, 200));

    const snapshot = await queryRef.get();
    const reports = snapshot.docs.map((doc) => ({reportId: doc.id, ...doc.data()}));

    res.json({success: true, count: reports.length, reports});
  } catch (error: any) {
    logger.error("신고 목록 조회 실패", error);
    res.status(500).json({success: false, error: "신고 목록을 불러오지 못했습니다"});
  }
});

app.post("/api/comment-reports/:reportId/resolve", requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const {reportId} = req.params;
    const {status, hideComment = false} = req.body || {};
    const validStatuses: CommentReportStatus[] = ["resolved", "dismissed"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({success: false, error: "유효한 상태가 필요합니다"});
    }

    const reportRef = db.collection(REPORT_COLLECTION).doc(reportId);
    const reportSnap = await reportRef.get();
    if (!reportSnap.exists) {
      return res.status(404).json({success: false, error: "신고를 찾을 수 없습니다"});
    }

    const report = reportSnap.data() as CommentReport;
    const commentRef = db.collection(COMMENT_COLLECTION).doc(report.commentId);

    const updates: any = {status};
    updates.resolvedAt = Timestamp.now();
    updates.resolvedBy = req.user?.uid || "admin";

    await db.runTransaction(async (tx) => {
      tx.update(reportRef, updates);

      if (hideComment) {
        tx.update(commentRef, {
          isHidden: true,
          updatedAt: Timestamp.now(),
        });
      } else if (status === "dismissed") {
        tx.update(commentRef, {
          isHidden: false,
          updatedAt: Timestamp.now(),
        });
      }
    });

    res.json({success: true});
  } catch (error: any) {
    logger.error("신고 처리 실패", error);
    res.status(500).json({success: false, error: "신고 처리 중 오류가 발생했습니다"});
  }
});

app.post("/api/comments/:commentId/moderation", requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const {commentId} = req.params;
    const {isHidden = true} = req.body || {};

    const docRef = db.collection(COMMENT_COLLECTION).doc(commentId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return res.status(404).json({success: false, error: "댓글을 찾을 수 없습니다"});
    }

    await docRef.update({
      isHidden: !!isHidden,
      updatedAt: Timestamp.now(),
    });

    res.json({success: true});
  } catch (error: any) {
    logger.error("댓글 숨김 처리 실패", error);
    res.status(500).json({success: false, error: "댓글 상태 변경 중 오류가 발생했습니다"});
  }
});

// Firestore에서 실종자 데이터 조회
app.get("/api/safe182/missing-persons", async (req: Request, res: Response) => {
  try {
    logger.info("Firestore에서 실종자 데이터 조회");

    const db = admin.firestore();
    const limit = parseInt(req.query.limit as string) || 100;

    // Firestore에서 최신순으로 데이터 조회
    const snapshot = await db
      .collection("missingPersons")
      .orderBy("updatedAt", "desc")
      .limit(limit)
      .get();

    if (snapshot.empty) {
      logger.info("Firestore에 저장된 데이터 없음");
      return res.json({
        result: "00",
        msg: "조회 성공",
        list: [],
        totalCount: 0,
      });
    }

    const persons: any[] = [];
    snapshot.forEach((doc) => {
      persons.push(doc.data());
    });

    logger.info(`Firestore 조회 성공: ${persons.length}건`);

    // 안전드림 API 응답 형식과 동일하게 반환
    res.json({
      result: "00",
      msg: "조회 성공",
      list: persons,
      totalCount: persons.length,
    });
  } catch (error: any) {
    logger.error("Firestore 조회 오류", error);
    res.status(500).json({
      error: "데이터 조회 실패",
      message: error.message,
      list: [],
    });
  }
});

// 안전드림 이미지 프록시
app.get("/api/safe182/photo/:id", async (req: Request, res: Response) => {
  try {
    const {id} = req.params;

    if (!id) {
      return res.status(400).json({error: "식별코드가 필요합니다"});
    }

    const axios = require("axios");
    const response = await axios.get(
      `https://www.safe182.go.kr/api/lcm/imgView.do?msspsnIdntfccd=${id}`,
      {
        responseType: "arraybuffer",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 10000,
      }
    );

    const contentType = response.headers["content-type"] || "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(response.data);
  } catch (error: any) {
    logger.error("이미지 로드 실패", error);
    res.status(404).json({
      error: "이미지를 찾을 수 없습니다",
      message: error.message,
    });
  }
});

// Admin endpoints
app.get("/api/admin/users", requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    // Firebase Auth에서 모든 사용자 가져오기
    const listUsersResult = await admin.auth().listUsers();

    // Firestore에서 각 사용자의 제보 수 가져오기
    const usersWithStats = await Promise.all(
      listUsersResult.users.map(async (userRecord) => {
        const reportsSnapshot = await db
          .collection("missing_persons")
          .where("reportedBy.uid", "==", userRecord.uid)
          .get();

        return {
          uid: userRecord.uid,
          email: userRecord.email || null,
          phoneNumber: userRecord.phoneNumber || null,
          displayName: userRecord.displayName || null,
          createdAt: userRecord.metadata.creationTime,
          lastSignInTime: userRecord.metadata.lastSignInTime || null,
          disabled: userRecord.disabled || false,
          reportCount: reportsSnapshot.size,
          isAdmin: isAdminUser(req.user),
        };
      })
    );

    res.json({
      success: true,
      users: usersWithStats,
      total: usersWithStats.length,
    });
  } catch (error: any) {
    logger.error("유저 목록 조회 실패", error);
    res.status(500).json({
      success: false,
      error: "유저 목록 조회 중 오류가 발생했습니다",
    });
  }
});

app.post("/api/admin/users/:uid/toggle-status", requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const {uid} = req.params;
    const {disable} = req.body;

    // Firebase Auth에서 사용자 상태 업데이트
    await admin.auth().updateUser(uid, {
      disabled: disable,
    });

    res.json({
      success: true,
      message: `사용자가 ${disable ? "비활성화" : "활성화"}되었습니다`,
    });
  } catch (error: any) {
    logger.error("사용자 상태 변경 실패", error);
    res.status(500).json({
      success: false,
      error: "사용자 상태 변경 중 오류가 발생했습니다",
    });
  }
});

app.get("/api/admin/statistics", requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const {range = "week"} = req.query;

    // 시간 범위 계산
    const now = new Date();
    let startDate: Date;

    switch (range) {
      case "day":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // 전체 제보 가져오기
    const reportsSnapshot = await db.collection(MISSING_PERSON_COLLECTION).get();
    const allReports = reportsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const reportsWithTimestamp = allReports.map((report: any) => ({
      report,
      timestamp: getReportTimestamp(report),
    }));

    // 제보 통계
    const userReports = reportsWithTimestamp.filter(({report}) => report.source === "user_report");
    const apiReports = reportsWithTimestamp.filter(({report}) => report.source !== "user_report");
    const activeReports = reportsWithTimestamp.filter(({report}) => report.status === "active");
    const resolvedReports = reportsWithTimestamp.filter(({report}) => report.status === "resolved");

    // 오늘, 이번 주, 이번 달, 올해 제보
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const yearStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    const todayStartMs = todayStart.getTime();
    const weekStartMs = weekStart.getTime();
    const monthStartMs = monthStart.getTime();
    const yearStartMs = yearStart.getTime();

    const todayReports = reportsWithTimestamp.filter(
      ({timestamp}) => timestamp !== null && timestamp >= todayStartMs
    );
    const weekReports = reportsWithTimestamp.filter(
      ({timestamp}) => timestamp !== null && timestamp >= weekStartMs
    );
    const monthReports = reportsWithTimestamp.filter(
      ({timestamp}) => timestamp !== null && timestamp >= monthStartMs
    );
    const yearReports = reportsWithTimestamp.filter(
      ({timestamp}) => timestamp !== null && timestamp >= yearStartMs
    );

    // 사용자 통계
    const listUsersResult = await admin.auth().listUsers();
    const allUsers = listUsersResult.users;
    const activeUsers = allUsers.filter((u) => !u.disabled);

    const usersWithReports = new Set(
      allReports.filter((r: any) => r.reportedBy?.uid).map((r: any) => r.reportedBy.uid)
    );

    const todayUsers = allUsers.filter((u) => new Date(u.metadata.creationTime) >= todayStart);
    const weekUsers = allUsers.filter((u) => new Date(u.metadata.creationTime) >= weekStart);

    // 지역별 제보 통계
    const locationCounts: {[key: string]: number} = {};
    allReports.forEach((report: any) => {
      const location = report.location;
      if (!location || typeof location !== "object") {
        return;
      }

      let regionName: string | null = null;
      if (typeof location.address === "string" && location.address.trim().length > 0) {
        regionName = pickRegionFromAddress(location.address);
      }

      if (!regionName && typeof location.region === "string") {
        const trimmed = location.region.trim();
        if (trimmed && !EXCLUDED_REGIONS.has(trimmed)) {
          regionName = trimmed;
        }
      }

      if (!regionName) {
        regionName = "기타";
      }

      locationCounts[regionName] = (locationCounts[regionName] || 0) + 1;
    });

    const locations = Object.entries(locationCounts)
      .map(([name, count]) => ({name, count}))
      .sort((a, b) => b.count - a.count);

    // 최근 활동
    const recentActivity: any[] = [];

    // 최근 제보 추가
    const recentReports = reportsWithTimestamp
      .filter(({timestamp}) => timestamp !== null)
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      .slice(0, 5);

    recentReports.forEach(({report, timestamp}) => {
      recentActivity.push({
        type: "report",
        description: `${report.name || "실종자"}${typeof report.age === "number" ? ` (${report.age}세)` : ""} 실종자 제보`,
        timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
      });
    });

    // 최근 가입 사용자 추가
    const recentUsers = allUsers
      .sort((a, b) => new Date(b.metadata.creationTime).getTime() - new Date(a.metadata.creationTime).getTime())
      .slice(0, 5);

    recentUsers.forEach((user) => {
      recentActivity.push({
        type: "user",
        description: `${user.displayName || user.email || "사용자"} 가입`,
        timestamp: user.metadata.creationTime,
      });
    });

    // 시간순 정렬
    recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // 실시간 세션 정보
    const activeSessionThresholdMinutes = 5;
    const activeSessionThresholdMs = activeSessionThresholdMinutes * 60 * 1000;

    const [activeSessionsSnapshot, visitorStatsDoc] = await Promise.all([
      db.collection("activeSessions").get(),
      db.collection("appMetrics").doc("visitorStats").get(),
    ]);

    const visitorStatsData: any = visitorStatsDoc.exists ? visitorStatsDoc.data() : {};
    const visitorUpdatedAt = typeof visitorStatsData?.updatedAt === "number"
      ? visitorStatsData.updatedAt
      : visitorStatsData?.updatedAt?.toMillis?.() ?? null;

    const totalSessionsValue = [
      visitorStatsData?.totalSessions,
      visitorStatsData?.totalVisitors,
    ].find((value) => typeof value === "number" && Number.isFinite(value));

    const todaySessionsValue = [
      visitorStatsData?.todaySessions,
      visitorStatsData?.todayVisitors,
    ].find((value) => typeof value === "number" && Number.isFinite(value));

    const activeSessionsRaw = activeSessionsSnapshot.docs.map((doc) => {
      const session = doc.data() || {};
      const lastActive = typeof session.lastActive === "number" ? session.lastActive : 0;
      const createdAt = typeof session.createdAt === "number"
        ? session.createdAt
        : session.createdAt?.toMillis?.() ?? null;
      const updatedAt = typeof session.updatedAt === "number"
        ? session.updatedAt
        : session.updatedAt?.toMillis?.() ?? null;

      const inferredActive = lastActive > 0 && now.getTime() - lastActive <= activeSessionThresholdMs;
      const explicitActive = typeof session.isActive === "boolean" ? session.isActive : null;
      const isActive = explicitActive ?? inferredActive;

      return {
        sessionId: session.sessionId || doc.id,
        userId: session.userId ?? null,
        userEmail: session.userEmail ?? null,
        displayName: session.displayName ?? null,
        userAgent: session.userAgent ?? null,
        platform: session.platform ?? null,
        createdAt,
        updatedAt,
        lastActive,
        isActive,
        lastActiveAgoMs: lastActive > 0 ? now.getTime() - lastActive : null,
      };
    });

    const liveSessions = activeSessionsRaw
      .filter((session) => session.isActive && (!session.lastActive || now.getTime() - session.lastActive <= activeSessionThresholdMs))
      .sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));

    const activeSessionsCount = liveSessions.length;
    const authenticatedSessionsCount = liveSessions.filter((session) => !!session.userId).length;
    const guestSessionsCount = liveSessions.filter((session) => !session.userId).length;
    const liveSessionsLimited = liveSessions.slice(0, 25);

    res.json({
      success: true,
      statistics: {
        reports: {
          total: allReports.length,
          userReports: userReports.length,
          apiReports: apiReports.length,
          activeReports: activeReports.length,
          resolvedReports: resolvedReports.length,
          todayReports: todayReports.length,
          weekReports: weekReports.length,
          monthReports: monthReports.length,
          yearReports: yearReports.length,
        },
        users: {
          total: allUsers.length,
          active: activeUsers.length,
          withReports: usersWithReports.size,
          todayRegistered: todayUsers.length,
          weekRegistered: weekUsers.length,
        },
        sessions: {
          totalSessions: typeof totalSessionsValue === "number" ? totalSessionsValue : activeSessionsSnapshot.size,
          todaySessions: typeof todaySessionsValue === "number" ? todaySessionsValue : 0,
          activeSessions: activeSessionsCount,
          activeAuthenticated: authenticatedSessionsCount,
          activeGuests: guestSessionsCount,
          liveSessions: liveSessionsLimited,
          lastUpdated: visitorUpdatedAt ?? now.getTime(),
          activeThresholdMinutes: activeSessionThresholdMinutes,
        },
        locations,
        recentActivity: recentActivity.slice(0, 10),
      },
    });
  } catch (error: any) {
    logger.error("통계 조회 실패", error);
    res.status(500).json({
      success: false,
      error: "통계 조회 중 오류가 발생했습니다",
    });
  }
});

// Reports endpoints
// Legacy reporting stored exact locations and reporter profile fields in a public-shaped
// document. Keep the route signature only as a fail-closed compatibility tombstone while
// clients migrate to the reviewed V2 reporting domain.
app.all(
  ["/api/reports", "/api/reports/my", "/api/reports/all", "/api/reports/:reportId"],
  authenticate,
  (_req: AuthedRequest, res: Response) => {
    res.set("Cache-Control", "no-store");
    res.set("Link", "</api/v2/reports>; rel=successor-version");
    return res.status(410).json({
      success: false,
      error: "LEGACY_REPORTING_RETIRED",
      message: "기존 제보 경로가 종료되었습니다. 안전한 신규 제보 경로를 이용해주세요.",
      replacement: "/api/v2/reports",
    });
  },
);

// Firebase Functions로 export
export const api = onRequest({
  region: "asia-northeast3", // 서울 리전
  cors: true,
  memory: "512MiB",
  timeoutSeconds: 60,
  secrets: [naverApiHubClientId, naverApiHubClientSecret],
}, app);

interface SubRegionAccumulator {
  id: string;
  name: string;
  parent: RegionMetadata;
  totalCases: number;
  activeCases: number;
  latestCaseAt?: number;
  daily: Record<string, {totalCases: number; activeCases: number;}>;
}

interface RegionAccumulator {
  region: RegionMetadata;
  totalCases: number;
  activeCases: number;
  latestCaseAt?: number;
  daily: Record<string, {totalCases: number; activeCases: number;}>;
  subRegions: Map<string, SubRegionAccumulator>;
}

const ensureRegionAccumulator = (map: Map<string, RegionAccumulator>, region: RegionMetadata): RegionAccumulator => {
  const existing = map.get(region.id);
  if (existing) {
    return existing;
  }
  const accumulator: RegionAccumulator = {
    region,
    totalCases: 0,
    activeCases: 0,
    latestCaseAt: undefined,
    daily: {},
    subRegions: new Map<string, SubRegionAccumulator>(),
  };
  map.set(region.id, accumulator);
  return accumulator;
};

const ensureSubRegionAccumulator = (regionAccumulator: RegionAccumulator, subRegionId: string, name: string): SubRegionAccumulator => {
  const existing = regionAccumulator.subRegions.get(subRegionId);
  if (existing) {
    return existing;
  }
  const accumulator: SubRegionAccumulator = {
    id: subRegionId,
    name,
    parent: regionAccumulator.region,
    totalCases: 0,
    activeCases: 0,
    latestCaseAt: undefined,
    daily: {},
  };
  regionAccumulator.subRegions.set(subRegionId, accumulator);
  return accumulator;
};

const collectRegionStats = async (): Promise<{
  regions: Map<string, RegionAccumulator>;
  totalCases: number;
  activeCases: number;
}> => {
  const snapshot = await db.collection("missingPersons").get();
  const regions = new Map<string, RegionAccumulator>();
  let totalCases = 0;
  let activeCases = 0;

  snapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data() as Record<string, any>;
    totalCases += 1;
    const status = typeof data.status === "string" ? data.status : (typeof data.state === "string" ? data.state : "active");
    const isActive = status === "active" || status === "미발견" || status === "missing";
    if (isActive) {
      activeCases += 1;
    }

    const address = data.location?.address ?? data.address ?? data.occrrncAdres ?? data.occrrncAdresDetail ?? "";
    const resolvedRegion = resolveRegionFromAddress(address);
    const accumulator = ensureRegionAccumulator(regions, resolvedRegion);
    accumulator.totalCases += 1;
    if (isActive) {
      accumulator.activeCases += 1;
    }

    const {id: subRegionId, name: subRegionName} = resolveSubRegionFromAddress(address, resolvedRegion);
    const subAccumulator = ensureSubRegionAccumulator(accumulator, subRegionId, subRegionName);
    subAccumulator.totalCases += 1;
    if (isActive) {
      subAccumulator.activeCases += 1;
    }

    const candidateDates = [
      data.missingDate,
      data.missing_date,
      data.occrrncDe,
      data.occurDate,
      data.reportedAt,
      data.createdAt,
      data.updatedAt,
    ];

    let pickedDate: Date | null = null;
    for (const candidate of candidateDates) {
      const parsed = parseDateValue(candidate);
      if (parsed) {
        pickedDate = parsed;
        break;
      }
    }

    if (pickedDate) {
      const utcDate = new Date(Date.UTC(pickedDate.getUTCFullYear(), pickedDate.getUTCMonth(), pickedDate.getUTCDate()));
      const dateKey = formatDateKey(utcDate);
      const dailyEntry = accumulator.daily[dateKey] ?? {totalCases: 0, activeCases: 0};
      dailyEntry.totalCases += 1;
      if (isActive) {
        dailyEntry.activeCases += 1;
      }
      accumulator.daily[dateKey] = dailyEntry;
      const epoch = utcDate.getTime();
      if (!accumulator.latestCaseAt || epoch > accumulator.latestCaseAt) {
        accumulator.latestCaseAt = epoch;
      }

      const subDailyEntry = subAccumulator.daily[dateKey] ?? {totalCases: 0, activeCases: 0};
      subDailyEntry.totalCases += 1;
      if (isActive) {
        subDailyEntry.activeCases += 1;
      }
      subAccumulator.daily[dateKey] = subDailyEntry;
      if (!subAccumulator.latestCaseAt || epoch > subAccumulator.latestCaseAt) {
        subAccumulator.latestCaseAt = epoch;
      }
    }
  });

  return {regions, totalCases, activeCases};
};

const buildRegionDailyPayload = (map: Map<string, RegionAccumulator>) => {
  const regionEntries: Record<string, any> = {};
  map.forEach((entry, regionId) => {
    const dailyArray = Object.entries(entry.daily)
      .map(([date, stats]) => ({
        date,
        totalCases: stats.totalCases,
        activeCases: stats.activeCases,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-REGION_STATS_HISTORY_DAYS);

    const subRegionArray = Array.from(entry.subRegions.values()).map((sub) => {
      const subDaily = Object.entries(sub.daily)
        .map(([date, stats]) => ({
          date,
          totalCases: stats.totalCases,
          activeCases: stats.activeCases,
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-REGION_STATS_HISTORY_DAYS);

      return {
        subRegionId: sub.id,
        parentRegionId: entry.region.id,
        name: sub.name,
        totalCases: sub.totalCases,
        activeCases: sub.activeCases,
        latestCaseDate: sub.latestCaseAt ? formatDateKey(new Date(sub.latestCaseAt)) : null,
        daily: subDaily,
      };
    }).sort((a, b) => b.totalCases - a.totalCases || a.name.localeCompare(b.name));

    regionEntries[regionId] = {
      regionId: entry.region.id,
      regionName: entry.region.name,
      code: entry.region.code,
      totalCases: entry.totalCases,
      activeCases: entry.activeCases,
      latestCaseDate: entry.latestCaseAt ? formatDateKey(new Date(entry.latestCaseAt)) : null,
      daily: dailyArray,
      subRegions: subRegionArray,
    };
  });
  return regionEntries;
};

const sendSlackNotification = async (message: string) => {
  const webhookUrl = process.env.REGION_STATS_SLACK_WEBHOOK;
  if (!webhookUrl) {
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({text: message}),
    });
  } catch (error) {
    logger.error("Slack 알림 전송 실패", error);
  }
};

export const aggregateRegionStatistics = onSchedule({
  schedule: "0 * * * *", // 매시 정각
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
  memory: "256MiB",
  timeoutSeconds: 300,
}, async () => {
  try {
    logger.info("📊 지역별 실종자 통계 집계 시작");
    const {regions, totalCases, activeCases} = await collectRegionStats();
    const generatedAt = Timestamp.now();

    const payload = {
      updatedAt: FieldValue.serverTimestamp(),
      generatedAt,
      totals: {
        regions: regions.size,
        totalCases,
        activeCases,
      },
      historyDays: REGION_STATS_HISTORY_DAYS,
      regions: buildRegionDailyPayload(regions),
    };

    await REGION_DAILY_DOC().set(payload, {merge: false});
    await REGION_METADATA_DOC().set({
      lastUpdatedAt: FieldValue.serverTimestamp(),
      regions: REGION_METADATA.map((region) => ({
        id: region.id,
        name: region.name,
        code: region.code,
        parentId: region.parentId,
        center: region.center,
      })),
    }, {merge: true});

    logger.info("✅ 지역별 실종자 통계 집계 완료", {
      regions: regions.size,
      totalCases,
      activeCases,
    });

    await sendSlackNotification(`✅ 지역 통계 집계 완료: 총 ${totalCases}건 / 활성 ${activeCases}건 (${regions.size}개 권역)`);
  } catch (error: any) {
    logger.error("❌ 지역별 실종자 통계 집계 실패", error);
    await sendSlackNotification(`❌ 지역 통계 집계 실패: ${error?.message ?? error}`);
    throw error;
  }
});

export const syncNaverNewsJob = onSchedule({
  schedule: "*/30 * * * *",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
  memory: "256MiB",
  timeoutSeconds: 120,
  secrets: [naverApiHubClientId, naverApiHubClientSecret],
}, async () => {
  const clientId = naverApiHubClientId.value();
  const clientSecret = naverApiHubClientSecret.value();
  if (!clientId || !clientSecret) {
    throw new Error("NAVER API HUB credentials are not configured");
  }

  const query = process.env.NAVER_NEWS_QUERY?.trim() || DEFAULT_NAVER_NEWS_QUERY;
  const result = await syncNaverNews(db, {clientId, clientSecret}, query);
  logger.info("NAVER 뉴스 동기화 완료", {...result, query});
});

export const cleanupExpiredNaverNewsJob = onSchedule({
  schedule: "15 3 * * *",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
  memory: "256MiB",
  timeoutSeconds: 120,
}, async () => {
  const deleted = await cleanupExpiredNaverNews(db);
  const quotaDocumentsDeleted = await cleanupExpiredCaseNewsSearchQuotas();
  logger.info("NAVER 뉴스 보관 기간 만료 정리 완료", {deleted, quotaDocumentsDeleted});
});

/**
 * 안전드림 API에서 실종자 데이터를 가져와서 Firestore에 저장
 * 30분마다 자동 실행
 */
export const pollMissingPersonsAPI = onSchedule({
  schedule: "*/30 * * * *", // 30분마다 실행
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
  memory: "512MiB",
  timeoutSeconds: 540, // 9분
  secrets: [safe182EsntlId, safe182AuthKey],
}, async () => {
  try {
    logger.info("🔍 안전드림 182 API 정기 폴링 시작...");

    const esntlId = safe182EsntlId.value();
    const authKey = safe182AuthKey.value();

    if (!esntlId || !authKey) {
      throw new Error("SAFE182 credentials are not configured");
    }

    let allItems: any[] = [];
    let currentPage = 1;
    const rowSize = 100;
    const maxPages = 100;
    let hasMoreData = true;
    let sourceSnapshotComplete = false;

    // 페이지네이션으로 모든 데이터 수집
    while (hasMoreData) {
      const params = new URLSearchParams({
        esntlId: esntlId,
        authKey: authKey,
        rowSize: rowSize.toString(),
        page: currentPage.toString(),
      });

      // 대상 구분 추가
      params.append("writngTrgetDscds", "010"); // 아동
      params.append("writngTrgetDscds", "020"); // 일반가출
      params.append("writngTrgetDscds", "040"); // 시설보호자
      params.append("writngTrgetDscds", "060"); // 지적장애
      params.append("writngTrgetDscds", "061"); // 18세미만 지적장애
      params.append("writngTrgetDscds", "062"); // 18세이상 지적장애
      params.append("writngTrgetDscds", "070"); // 치매
      params.append("writngTrgetDscds", "080"); // 신원불상

      const response = await axios.post(
        "https://www.safe182.go.kr/api/lcm/findChildList.do",
        params.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          timeout: 15000,
        }
      );

      if (!response.data || (response.data.result !== "00" && response.data.result !== "true")) {
        logger.warn("⚠️ API 호출 실패:", response.data?.msg || "알 수 없는 오류");
        break;
      }

      const apiList = response.data.list || [];
      const parsedTotalCount = Number(response.data.totalCount);
      const totalCount = Number.isInteger(parsedTotalCount) && parsedTotalCount > 0 ? parsedTotalCount : null;

      if (apiList.length === 0) {
        logger.info(currentPage === 1 ? "📭 실종자 정보 없음" : `마지막 페이지 도달`);
        if (currentPage > 1 && allItems.length > 0) {
          sourceSnapshotComplete = true;
        }
        hasMoreData = false;
        break;
      }

      logger.info(`✓ ${apiList.length}건 수신 (전체 ${totalCount ?? "미상"}건 중, 페이지 ${currentPage})`);
      allItems = allItems.concat(apiList);

      if ((totalCount !== null && allItems.length >= totalCount) || apiList.length < rowSize) {
        hasMoreData = false;
        sourceSnapshotComplete = true;
      } else if (currentPage >= maxPages) {
        logger.warn("안전드림 API 최대 페이지 제한에 도달했습니다", {maxPages});
        hasMoreData = false;
      } else {
        currentPage++;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (allItems.length === 0) {
      logger.info("수집된 데이터 없음");
      return;
    }

    logger.info(`📊 총 ${allItems.length}건 수집 완료`);

    // 공식 API의 현재 목록을 일괄 반영한다. 검색 노출은 이 동기화에서
    // 실제로 확인된 공식 데이터에만 허용한다.
    const db = admin.firestore();
    const missingPersonsRef = db.collection("missingPersons");
    const currentIds = new Set<string>();
    const transformedItems = allItems.map((item) => {
      const transformed = transformAPIData(item);
      currentIds.add(transformed.id);
      return transformed;
    });

    for (let offset = 0; offset < transformedItems.length; offset += 400) {
      const batch = db.batch();
      for (const item of transformedItems.slice(offset, offset + 400)) {
        batch.set(missingPersonsRef.doc(item.id), item, {merge: true});
      }
      await batch.commit();
    }

    const previouslyVisible = sourceSnapshotComplete ?
      await missingPersonsRef.where("seoVisible", "==", true).get() : null;
    const noLongerPublished = previouslyVisible ? previouslyVisible.docs.filter((doc) => {
      const data = doc.data();
      return data.source === "api" && !currentIds.has(doc.id);
    }) : [];

    if (!sourceSnapshotComplete) {
      logger.warn("안전드림 전체 페이지 수집이 확인되지 않아 기존 검색 노출 종료를 건너뜁니다", {
        collected: transformedItems.length,
      });
    }

    for (let offset = 0; offset < noLongerPublished.length; offset += 400) {
      const batch = db.batch();
      for (const doc of noLongerPublished.slice(offset, offset + 400)) {
        batch.update(doc.ref, {
          seoVisible: false,
          status: "found",
          foundReason: "official_source_removed",
          removedFromSourceAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    logger.info(`✅ 폴링 완료: ${transformedItems.length}건 동기화, ${noLongerPublished.length}건 검색 노출 종료`);
  } catch (error: any) {
    logger.error("❌ 안전드림 API 폴링 오류:", error);
    throw error;
  }
});

/**
 * 안전드림 API 데이터를 Firestore 형식으로 변환
 */
function transformAPIData(apiData: any) {
  const id = String(apiData.msspsnIdntfccd || `safe182_${apiData.nm}_${apiData.age}`);

  // 성별 변환
  const gender = apiData.sexdstnDscd === "남자" ? "M" :
    apiData.sexdstnDscd === "여자" ? "F" : "U";

  // 나이
  const age = parseInt(apiData.ageNow) || parseInt(apiData.age) || 0;

  // 타입 결정
  let type = "runaway";
  switch (apiData.writngTrgetDscd) {
    case "010":
      type = "missing_child";
      break;
    case "020":
      type = "runaway";
      break;
    case "040":
      type = "facility";
      break;
    case "060":
    case "061":
    case "062":
      type = "disabled";
      break;
    case "070":
      type = "dementia";
      break;
    case "080":
      type = "unknown";
      break;
    default:
      type = age < 18 ? "missing_child" : "runaway";
  }

  // 실종일시 파싱
  let missingDate: string;
  try {
    if (apiData.occrde) {
      const dateStr = apiData.occrde.toString();
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      missingDate = new Date(`${year}-${month}-${day}`).toISOString();
    } else {
      missingDate = new Date().toISOString();
    }
  } catch (error) {
    missingDate = new Date().toISOString();
  }

  // 주소에서 좌표 가져오기
  const location = getKoreanCityCoordinates(apiData.occrAdres || "주소 미상");

  // 사진 URL
  const photo = apiData.tknphotolength !== "0" && apiData.msspsnIdntfccd ?
    `https://www.safe182.go.kr/api/lcm/imgView.do?msspsnIdntfccd=${apiData.msspsnIdntfccd}` :
    null;

  return {
    id,
    name: apiData.nm || "미상",
    age: age,
    gender,
    location,
    photo,
    description: apiData.alldressingDscd || "특이사항 없음",
    missingDate,
    type,
    status: "active",
    source: "api",
    seoVisible: true,
    sourceLastSeenAt: FieldValue.serverTimestamp(),
    height: apiData.height || null,
    weight: apiData.bdwgh || null,
    clothes: apiData.alldressingDscd || null,
    bodyType: apiData.frmDscd || null,
    faceShape: apiData.faceshpeDscd || null,
    hairShape: apiData.hairshpeDscd || null,
    hairColor: apiData.haircolrDscd || null,
    apiTargetCode: apiData.writngTrgetDscd || null,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/**
 * 한국 주요 도시 좌표 반환
 */
function getKoreanCityCoordinates(address: string) {
  const cityCoordinates: {[key: string]: {lat: number; lng: number}} = {
    "서울특별시": {lat: 37.5665, lng: 126.9780},
    "서울": {lat: 37.5665, lng: 126.9780},
    "부산광역시": {lat: 35.1796, lng: 129.0756},
    "부산": {lat: 35.1796, lng: 129.0756},
    "대구광역시": {lat: 35.8714, lng: 128.6014},
    "대구": {lat: 35.8714, lng: 128.6014},
    "인천광역시": {lat: 37.4563, lng: 126.7052},
    "인천": {lat: 37.4563, lng: 126.7052},
    "광주광역시": {lat: 35.1595, lng: 126.8526},
    "광주": {lat: 35.1595, lng: 126.8526},
    "대전광역시": {lat: 36.3504, lng: 127.3845},
    "대전": {lat: 36.3504, lng: 127.3845},
    "울산광역시": {lat: 35.5384, lng: 129.3114},
    "울산": {lat: 35.5384, lng: 129.3114},
    "세종특별자치시": {lat: 36.4800, lng: 127.2890},
    "세종": {lat: 36.4800, lng: 127.2890},
    "경기도": {lat: 37.4138, lng: 127.5183},
    "경기": {lat: 37.4138, lng: 127.5183},
    "강원특별자치도": {lat: 37.8228, lng: 128.1555},
    "강원도": {lat: 37.8228, lng: 128.1555},
    "강원": {lat: 37.8228, lng: 128.1555},
    "충청북도": {lat: 36.8000, lng: 127.7000},
    "충북": {lat: 36.8000, lng: 127.7000},
    "충청남도": {lat: 36.5184, lng: 126.8000},
    "충남": {lat: 36.5184, lng: 126.8000},
    "전북특별자치도": {lat: 35.7175, lng: 127.1530},
    "전라북도": {lat: 35.7175, lng: 127.1530},
    "전북": {lat: 35.7175, lng: 127.1530},
    "전라남도": {lat: 34.8679, lng: 126.9910},
    "전남": {lat: 34.8679, lng: 126.9910},
    "경상북도": {lat: 36.4919, lng: 128.8889},
    "경북": {lat: 36.4919, lng: 128.8889},
    "경상남도": {lat: 35.4606, lng: 128.2132},
    "경남": {lat: 35.4606, lng: 128.2132},
    "제주특별자치도": {lat: 33.4890, lng: 126.4983},
    "제주": {lat: 33.4890, lng: 126.4983},
  };

  // 주소에서 시/도 찾기
  for (const [city, coords] of Object.entries(cityCoordinates)) {
    if (address.includes(city)) {
      return {...coords, address};
    }
  }

  // 매칭 없으면 서울 기본값
  return {lat: 37.5665, lng: 126.9780, address};
}
