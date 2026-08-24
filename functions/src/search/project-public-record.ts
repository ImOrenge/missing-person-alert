import {PublicSearchItem} from "./contracts";

const asString = (value: unknown, maxLength: number): string =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength) : "";

const asHttpUrl = (value: unknown): string | undefined => {
  const candidate = asString(value, 2048);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

const coarseRegion = (value: unknown): string | undefined => {
  const address = asString(value, 200);
  if (!address) return undefined;
  const tokens = address.split(" ").filter(Boolean);
  return tokens.slice(0, Math.min(2, tokens.length)).join(" ");
};

const toIsoString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
  }
  if (value && typeof value === "object" && "toDate" in value && typeof (value as {toDate: () => Date}).toDate === "function") {
    const date = (value as {toDate: () => Date}).toDate();
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }
  return undefined;
};

export const projectOfficialCaseSearchItem = (id: string, data: Record<string, unknown>): PublicSearchItem | null => {
  if (data.source !== "api" || data.status !== "active" || data.seoVisible !== true) return null;
  const title = asString(data.name, 80);
  if (!title) return null;
  const location = data.location && typeof data.location === "object" ? data.location as Record<string, unknown> : {};
  const photos = Array.isArray(data.photos) ? data.photos : [];
  return {
    id,
    kind: "case",
    title,
    summary: asString(data.clothes || data.description, 240) || "공식 공개 수색 정보",
    regionLabel: coarseRegion(location.address),
    thumbnailUrl: asHttpUrl(photos[0] || data.photo),
    statusLabel: "수색 중",
    sourceLabel: "경찰청 안전Dream 공식정보",
    publishedAt: toIsoString(data.updatedAt || data.missingDate),
    href: `/missing/${encodeURIComponent(id)}`,
  };
};

export const projectPublicReportSearchItem = (id: string, data: Record<string, unknown>): PublicSearchItem | null => {
  if (data.visibility !== "public" || !["approved", "forwarded", "confirmed"].includes(String(data.status))) return null;
  const expiresAt = toIsoString(data.expiresAt);
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) return null;
  const publicSummary = data.publicSummary && typeof data.publicSummary === "object" ? data.publicSummary as Record<string, unknown> : {};
  const caseId = asString(data.caseId, 200);
  const title = asString(publicSummary.title || data.title, 100);
  if (!title) return null;
  return {
    id,
    kind: "report",
    title,
    summary: asString(data.publicDescription || publicSummary.summary, 2000) || "운영자 검토를 마친 공개 제보",
    regionLabel: asString(data.publicLocationText || publicSummary.regionLabel, 300) || undefined,
    thumbnailUrl: asHttpUrl(publicSummary.thumbnailUrl),
    statusLabel: data.status === "confirmed" ? "확인된 제보" : data.status === "forwarded" ? "기관 전달" : "승인 제보",
    sourceLabel: "사용자 제보 · 운영 검토 완료",
    publishedAt: toIsoString(data.publishedAt),
    href: caseId
      ? `/missing/${encodeURIComponent(caseId)}#public-report-${encodeURIComponent(id)}`
      : `/map?publicReportId=${encodeURIComponent(id)}`,
  };
};

export const projectNewsSearchItem = (data: Record<string, unknown>): PublicSearchItem | null => {
  const id = asString(data.id, 128);
  const title = asString(data.title, 200);
  const href = asHttpUrl(data.originallink || data.link);
  if (!id || !title || !href) return null;
  return {
    id,
    kind: "news",
    title,
    summary: asString(data.description, 240),
    sourceLabel: "NAVER 뉴스 검색 결과",
    publishedAt: toIsoString(data.pubDate),
    href,
  };
};
