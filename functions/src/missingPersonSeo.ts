const DEFAULT_SITE_ORIGIN = "https://missingalert.kr";

export const PUBLIC_SITE_ORIGIN = (process.env.PUBLIC_SITE_ORIGIN || DEFAULT_SITE_ORIGIN).replace(/\/+$/, "");

type TimestampLike = {toDate?: () => Date; seconds?: number};

export interface PublicMissingPerson {
  id: string;
  name: string;
  age: number | null;
  gender: string;
  address: string;
  missingDate: string | null;
  description: string;
  type: string;
  photo: string | null;
  height: number | null;
  clothes: string;
  updatedAt: Date | null;
}

export interface PublicRegion {slug: string; name: string; aliases: string[]}

export interface PublicMissingType {
  slug: string;
  name: string;
  types: string[];
  title: string;
  description: string;
  eyebrow: string;
}

export const PUBLIC_REGIONS: PublicRegion[] = [
  {slug: "seoul", name: "서울특별시", aliases: ["서울특별시", "서울"]},
  {slug: "busan", name: "부산광역시", aliases: ["부산광역시", "부산"]},
  {slug: "daegu", name: "대구광역시", aliases: ["대구광역시", "대구"]},
  {slug: "incheon", name: "인천광역시", aliases: ["인천광역시", "인천"]},
  {slug: "gwangju", name: "광주광역시", aliases: ["광주광역시", "광주"]},
  {slug: "daejeon", name: "대전광역시", aliases: ["대전광역시", "대전"]},
  {slug: "ulsan", name: "울산광역시", aliases: ["울산광역시", "울산"]},
  {slug: "sejong", name: "세종특별자치시", aliases: ["세종특별자치시", "세종"]},
  {slug: "gyeonggi", name: "경기도", aliases: ["경기도", "경기"]},
  {slug: "gangwon", name: "강원특별자치도", aliases: ["강원특별자치도", "강원도", "강원"]},
  {slug: "chungbuk", name: "충청북도", aliases: ["충청북도", "충북"]},
  {slug: "chungnam", name: "충청남도", aliases: ["충청남도", "충남"]},
  {slug: "jeonbuk", name: "전북특별자치도", aliases: ["전북특별자치도", "전라북도", "전북"]},
  {slug: "jeonnam", name: "전라남도", aliases: ["전라남도", "전남"]},
  {slug: "gyeongbuk", name: "경상북도", aliases: ["경상북도", "경북"]},
  {slug: "gyeongnam", name: "경상남도", aliases: ["경상남도", "경남"]},
  {slug: "jeju", name: "제주특별자치도", aliases: ["제주특별자치도", "제주도", "제주"]},
];

export const PUBLIC_MISSING_TYPES: PublicMissingType[] = [
  {
    slug: "child",
    name: "실종아동",
    types: ["missing_child"],
    title: "실종아동 찾기·검색 - 최신 공개 정보",
    description: "경찰청 안전Dream에서 현재 공개 수색 중인 실종아동 정보를 조회하고 사진, 인상착의, 실종 지역과 날짜를 확인하세요.",
    eyebrow: "실종아동 공개 수색 정보",
  },
  {
    slug: "dementia",
    name: "치매환자 실종",
    types: ["dementia"],
    title: "치매환자·노인 실종 현황 - 최신 공개 정보",
    description: "경찰청 안전Dream에서 치매환자로 분류해 현재 공개 수색 중인 실종 정보를 조회하고 마지막 확인 지역과 인상착의를 확인하세요.",
    eyebrow: "치매환자 공개 수색 정보",
  },
  {
    slug: "disability",
    name: "장애인 실종",
    types: ["disabled"],
    title: "장애인 실종 현황·검색 - 최신 공개 정보",
    description: "경찰청 안전Dream에서 장애인으로 분류해 현재 공개 수색 중인 실종 정보를 조회하고 사진, 인상착의와 마지막 확인 지역을 확인하세요.",
    eyebrow: "장애인 공개 수색 정보",
  },
];

const asText = (value: unknown, fallback = ""): string =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

const asNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const asDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object") {
    const timestamp = value as TimestampLike;
    if (typeof timestamp.toDate === "function") return timestamp.toDate();
    if (typeof timestamp.seconds === "number") return new Date(timestamp.seconds * 1000);
  }
  return null;
};

const asPublicImageUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

export const isSearchIndexableMissingPerson = (data: Record<string, unknown>): boolean =>
  data.source === "api" && data.status === "active" && data.seoVisible === true;

export const toPublicMissingPerson = (id: string, data: Record<string, any>): PublicMissingPerson => {
  const location = data.location && typeof data.location === "object" ? data.location : {};
  return {
    id,
    name: asText(data.name, "이름 미상"),
    age: asNumber(data.age),
    gender: asText(data.gender, "U"),
    address: asText(location.address ?? data.address, "대한민국"),
    missingDate: asDate(data.missingDate)?.toISOString() ?? null,
    description: asText(data.description ?? data.clothes, "인상착의 정보 없음"),
    type: asText(data.type, "unknown"),
    photo: asPublicImageUrl(data.photo),
    height: asNumber(data.height),
    clothes: asText(data.clothes),
    updatedAt: asDate(data.updatedAt ?? data.sourceLastSeenAt),
  };
};

const escapeHtml = (value: unknown): string => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const escapeXml = escapeHtml;

const genderLabel = (gender: string): string => gender === "M" ? "남성" : gender === "F" ? "여성" : "성별 미상";
const typeLabel = (type: string): string => ({
  missing_child: "실종 아동", runaway: "실종자", disabled: "실종 장애인",
  dementia: "실종 치매환자", facility: "시설 보호 대상자", unknown: "신원불상자",
}[type] || "실종자");

const formatKoreanDate = (value: string | Date | null): string => !value ? "일시 미상" :
  new Intl.DateTimeFormat("ko-KR", {year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul"}).format(new Date(value));
const formatShortKoreanDate = (value: string | null): string => !value ? "" :
  new Intl.DateTimeFormat("ko-KR", {month: "numeric", day: "numeric", timeZone: "Asia/Seoul"}).format(new Date(value));
const compactAddress = (address: string): string => address.trim().split(/\s+/).slice(0, 3).join(" ");

export interface PublicReportTimelineItem {
  id: string;
  reportType: string;
  occurredAt: string;
  publicDescription: string;
  publicLocationText: string;
  publicStatus: "approved" | "forwarded" | "confirmed";
}

export const buildMissingPersonTitle = (person: PublicMissingPerson): string => {
  const age = person.age === null ? "" : `(${person.age}세)`;
  const address = person.address === "대한민국" ? "" : ` - ${compactAddress(person.address)}`;
  const date = formatShortKoreanDate(person.missingDate);
  return `[${typeLabel(person.type)} 찾습니다] ${person.name}${age}${address}${date ? ` · ${date}` : ""}`;
};

export const getPublicRegion = (slug: string): PublicRegion | undefined => PUBLIC_REGIONS.find((region) => region.slug === slug);
export const getPublicRegionForAddress = (address: string): PublicRegion | undefined => {
  const normalized = address.trim().replace(/^대한민국\s*/, "");
  return PUBLIC_REGIONS.find((region) => region.aliases.some((alias) => normalized === alias || normalized.startsWith(`${alias} `)));
};
export const getPublicMissingType = (slug: string): PublicMissingType | undefined =>
  PUBLIC_MISSING_TYPES.find((missingType) => missingType.slug === slug);
export const getPublicMissingTypeForType = (type: string): PublicMissingType | undefined =>
  PUBLIC_MISSING_TYPES.find((missingType) => missingType.types.includes(type));

const buildAppUrl = (personId: string): string => {
  const params = new URLSearchParams({
    personId,
    utm_source: "organic",
    utm_medium: "seo",
    utm_campaign: "missing_detail",
    utm_content: "primary_cta",
  });
  return `${PUBLIC_SITE_ORIGIN}/map?${params.toString()}`;
};

const baseStyles = `
:root{font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;color:#172033;background:#f5f7fa;--navy:#173554;--red:#c9403a;--line:#dfe5ec;--muted:#617085;--paper:#fff;--soft:#f6f8fb}*{box-sizing:border-box}body{margin:0;padding-bottom:76px}.wrap{max-width:780px;margin:auto;padding:22px 16px 48px}.brand{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.brand a{color:var(--navy);font-weight:900;text-decoration:none}.status{display:inline-flex;align-items:center;gap:7px;border-radius:999px;background:#fff0ef;color:#a92f2a;font-size:.8rem;font-weight:900;padding:7px 10px}.status:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--red)}.card{background:var(--paper);border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(19,32,51,.08)}.photo{width:100%;max-height:520px;object-fit:contain;background:#edf0f4}.content{padding:22px}.eyebrow{color:var(--red);font-size:.8rem;font-weight:900;letter-spacing:.04em;margin:0}h1{font-size:clamp(1.65rem,5vw,2.3rem);line-height:1.25;margin:.45rem 0 .8rem}h2{font-size:1.08rem;margin:24px 0 8px}.summary{color:#425168;line-height:1.7;margin:0}.supporting{margin-top:14px;color:#425168;line-height:1.75}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:18px 0}.fact{padding:13px;border-radius:10px;background:var(--soft)}.label{display:block;color:var(--muted);font-size:.78rem;margin-bottom:4px}.notice{border-left:4px solid var(--red);padding:12px 14px;background:#fff5f4;line-height:1.65}.actions{display:grid;gap:10px;margin-top:20px}.cta{display:flex;align-items:center;justify-content:center;min-height:48px;border:0;border-radius:10px;background:var(--navy);color:#fff;text-align:center;text-decoration:none;font:inherit;font-weight:900;padding:13px 18px;cursor:pointer}.cta.secondary{background:#fff;color:var(--navy);border:1px solid #b9c6d5}.call-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sticky{position:fixed;z-index:10;left:16px;right:16px;bottom:max(12px,env(safe-area-inset-bottom));box-shadow:0 8px 24px rgba(15,36,60,.3)}.related{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.related a{border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--navy);font-size:.84rem;font-weight:800;padding:8px 11px;text-decoration:none}.source{margin:18px 0 0;color:var(--muted);font-size:.84rem;line-height:1.65}.updated{color:var(--muted);font-size:.82rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-top:22px}.person-card{display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;color:inherit;text-decoration:none}.person-card img{width:100%;height:220px;object-fit:contain;background:#edf0f4}.person-card .placeholder{display:grid;height:160px;place-items:center;background:#edf0f4;color:var(--muted);font-weight:800}.person-card .body{padding:16px}.person-card h2{margin:0 0 8px;font-size:1.05rem}.person-card p{margin:4px 0;color:#4c5b70;font-size:.88rem;line-height:1.5}.back{display:inline-flex;margin-top:22px;color:var(--navy);font-weight:800}.empty{padding:28px;border:1px solid var(--line);border-radius:14px;background:#fff;color:var(--muted)}@media(min-width:640px){body{padding-bottom:0}.wrap{padding-top:32px}.content{padding:28px}.actions{grid-template-columns:1.35fr .65fr}.call-grid{grid-column:1/-1}.sticky{display:none}}`;

const timelineStyles = `.timeline{margin-top:26px;padding-top:2px}.timeline ol{list-style:none;margin:14px 0;padding:0;display:grid;gap:12px}.report{border:1px solid var(--line);border-left:4px solid var(--navy);border-radius:12px;padding:14px;background:var(--soft)}.report-head{display:flex;justify-content:space-between;gap:10px;font-size:.82rem;color:var(--navy)}.report-head span{border-radius:999px;background:#e6edf5;padding:4px 8px}.safe-location{font-size:.86rem;font-weight:800;color:var(--navy)}.report .source{margin-top:8px}`;

export const buildMissingPersonHtml = (person: PublicMissingPerson, publicReports: PublicReportTimelineItem[] = []): string => {
  const canonicalUrl = `${PUBLIC_SITE_ORIGIN}/missing/${encodeURIComponent(person.id)}`;
  const ageLabel = person.age === null ? "나이 미상" : `${person.age}세`;
  const title = buildMissingPersonTitle(person);
  const dateLabel = formatKoreanDate(person.missingDate);
  const reviewedReportSummary = publicReports.length > 0 ? ` 운영자 검토를 마친 사용자 제보 ${publicReports.length}건도 함께 확인할 수 있습니다.` : "";
  const summary = `${dateLabel} ${person.address}에서 실종된 ${person.name}님(${ageLabel}, ${genderLabel(person.gender)})의 안전Dream 공개 정보입니다. 사진과 인상착의, 마지막 확인 위치를 확인하고 목격 시 112 또는 182로 제보해 주세요.${reviewedReportSummary}`;
  const imageMeta = person.photo ? `<meta property="og:image" content="${escapeHtml(person.photo)}" /><meta property="og:image:alt" content="${escapeHtml(`${person.name}님 실종 당시 공개 사진`)}" /><meta name="twitter:card" content="summary_large_image" />` : `<meta name="twitter:card" content="summary" />`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org", "@type": "WebPage", name: title, url: canonicalUrl,
    description: summary, inLanguage: "ko-KR", dateModified: person.updatedAt?.toISOString(),
    isPartOf: {"@type": "WebSite", name: "실종자알림", url: PUBLIC_SITE_ORIGIN},
    about: {"@type": "Person", name: person.name, gender: genderLabel(person.gender), image: person.photo || undefined, description: person.description},
  }).replace(/</g, "\\u003c");
  const sharePayload = JSON.stringify({title, text: summary, url: canonicalUrl}).replace(/</g, "\\u003c");
  const region = getPublicRegionForAddress(person.address);
  const missingType = getPublicMissingTypeForType(person.type);
  const relatedLinks = [
    `<a href="${PUBLIC_SITE_ORIGIN}/missing">실종자 검색·조회</a>`,
    missingType ? `<a href="${PUBLIC_SITE_ORIGIN}/missing/type/${missingType.slug}">${escapeHtml(missingType.name)} 현황</a>` : "",
    region ? `<a href="${PUBLIC_SITE_ORIGIN}/missing/region/${region.slug}">${escapeHtml(region.name)} 실종자 현황</a>` : "",
  ].filter(Boolean).join("");
  const reportPriority = {confirmed: 0, forwarded: 1, approved: 2};
  const reportTimeline = [...publicReports]
    .sort((a, b) => reportPriority[a.publicStatus] - reportPriority[b.publicStatus] || b.occurredAt.localeCompare(a.occurredAt))
    .map((report) => `<li class="report"><div class="report-head"><strong>사용자 제보 · 운영 검토 완료</strong><span>${escapeHtml(report.publicStatus === "confirmed" ? "기관 확인" : report.publicStatus === "forwarded" ? "기관 전달" : "공개 승인")}</span></div><p class="updated">목격 시각 ${escapeHtml(formatKoreanDate(report.occurredAt))}</p><p class="summary">${escapeHtml(report.publicDescription)}</p><p class="safe-location">공개 위치 · ${escapeHtml(report.publicLocationText)}</p><p class="source">공식 확인 정보와 다를 수 있으며 정확한 좌표·연락처·원문은 공개하지 않습니다.</p></li>`).join("");
  const reportSection = publicReports.length > 0
    ? `<section class="timeline" aria-labelledby="public-report-title"><h2 id="public-report-title">검토된 사용자 제보 ${publicReports.length}건</h2><p class="summary">운영자가 개인정보와 공개 위치를 검토한 제보만 목격 시각 순으로 표시합니다.</p><ol>${reportTimeline}</ol></section>`
    : `<section class="timeline" aria-labelledby="public-report-title"><h2 id="public-report-title">검토된 사용자 제보</h2><p class="summary">현재 공개 승인된 사용자 제보가 없습니다. 미검토 제보는 이 페이지에 표시되지 않습니다.</p></section>`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(summary)}" /><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" /><link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
<meta property="og:type" content="article" /><meta property="og:locale" content="ko_KR" /><meta property="og:site_name" content="실종자알림" /><meta property="og:title" content="${escapeHtml(title)}" /><meta property="og:description" content="${escapeHtml(summary)}" /><meta property="og:url" content="${escapeHtml(canonicalUrl)}" />${imageMeta}<meta name="twitter:title" content="${escapeHtml(title)}" /><meta name="twitter:description" content="${escapeHtml(summary)}" />
<script type="application/ld+json">${jsonLd}</script><style>${baseStyles}${timelineStyles}</style></head><body><main class="wrap">
<nav class="brand" aria-label="현재 위치"><a href="${PUBLIC_SITE_ORIGIN}/">실종자알림</a><span class="status">현재 수색 중</span></nav><section class="card">
${person.photo ? `<img class="photo" src="${escapeHtml(person.photo)}" alt="${escapeHtml(person.name)}님 실종 당시 공개 사진" />` : ""}<div class="content"><p class="eyebrow">경찰청 안전Dream 공개 데이터</p><h1>${escapeHtml(`${compactAddress(person.address)} ${typeLabel(person.type)} ${person.name}님을 찾습니다`)}</h1><p class="summary">${escapeHtml(summary)}</p>
<div class="facts"><div class="fact"><span class="label">인적 사항</span>${escapeHtml(`${ageLabel} · ${genderLabel(person.gender)} · ${typeLabel(person.type)}`)}</div><div class="fact"><span class="label">실종 일자</span>${escapeHtml(dateLabel)}</div><div class="fact"><span class="label">마지막 확인 지역</span>${escapeHtml(person.address)}</div>${person.height === null ? "" : `<div class="fact"><span class="label">신장</span>${escapeHtml(`${person.height}cm`)}</div>`}</div>
<h2>인상착의 및 특징</h2><p class="summary">${escapeHtml(person.clothes || person.description)}</p>${reportSection}<p class="notice"><strong>목격하거나 관련 정보를 알고 계시면 즉시 경찰 112 또는 안전Dream 182로 제보해 주세요.</strong> 사실 확인이 되지 않은 정보나 개인정보는 온라인에 재게시하지 마세요.</p>
<div class="actions"><a class="cta" data-seo-event="seo_app_cta_click" rel="nofollow" href="${escapeHtml(buildAppUrl(person.id))}">사진·인상착의와 지도에서 확인</a><a class="cta secondary" rel="nofollow" href="${PUBLIC_SITE_ORIGIN}/reports/new?personId=${encodeURIComponent(person.id)}">이 사건에 온라인 제보</a><button class="cta secondary" id="share-case" type="button">공식 페이지 공유</button><div class="call-grid"><a class="cta secondary" data-seo-event="call_112_click" rel="nofollow" href="tel:112">경찰 112 전화</a><a class="cta secondary" data-seo-event="call_182_click" rel="nofollow" href="tel:182">안전Dream 182 전화</a></div></div>
<nav class="related" aria-label="관련 실종자 정보">${relatedLinks}</nav>${person.updatedAt ? `<p class="updated">정보 업데이트: ${escapeHtml(formatKoreanDate(person.updatedAt))}</p>` : ""}<p class="source">이 페이지는 경찰청 안전Dream 공개 데이터를 바탕으로 제공합니다. 사건이 종결되거나 공식 출처에서 내려가면 검색 노출에서 제외됩니다. 클릭 측정은 사건별·일자별 합계만 저장하며 방문자 식별정보는 저장하지 않습니다.</p></div></section></main><a class="cta sticky" data-seo-event="seo_app_cta_click" rel="nofollow" href="${escapeHtml(buildAppUrl(person.id))}">지도에서 바로 확인</a>
<script>(()=>{const p=${sharePayload},b=document.getElementById("share-case"),track=(event)=>navigator.sendBeacon("/api/seo/events",new Blob([JSON.stringify({event,caseId:${JSON.stringify(person.id)}})],{type:"application/json"}));document.querySelectorAll("[data-seo-event]").forEach((link)=>link.addEventListener("click",()=>track(link.dataset.seoEvent)));if(!b)return;b.addEventListener("click",async()=>{try{if(navigator.share)await navigator.share(p);else await navigator.clipboard.writeText(p.url);track("share_started");b.textContent=navigator.share?"공유 완료":"링크 복사 완료"}catch(e){if(e&&e.name!=="AbortError")b.textContent="공유하지 못했습니다"}})})();</script></body></html>`;
};

export interface MissingPersonCollectionLink {href: string; label: string}
export interface MissingPersonCollectionOptions {
  title: string;
  description: string;
  canonicalPath: string;
  eyebrow: string;
  persons: PublicMissingPerson[];
  supportingCopy?: string;
  relatedLinks?: MissingPersonCollectionLink[];
}

export const buildMissingPersonCollectionHtml = (options: MissingPersonCollectionOptions): string => {
  const canonicalUrl = `${PUBLIC_SITE_ORIGIN}${options.canonicalPath}`;
  const list = options.persons.map((person) => `<a class="person-card" href="${PUBLIC_SITE_ORIGIN}/missing/${encodeURIComponent(person.id)}">${person.photo ? `<img src="${escapeHtml(person.photo)}" alt="${escapeHtml(person.name)}님 실종 당시 공개 사진" loading="lazy" />` : `<div class="placeholder">공개 사진 없음</div>`}<div class="body"><h2>${escapeHtml(person.name)}님 · ${escapeHtml(person.age === null ? "나이 미상" : `${person.age}세`)}</h2><p>${escapeHtml(formatKoreanDate(person.missingDate))}</p><p>${escapeHtml(person.address)}</p><p><strong>사진과 인상착의 확인</strong></p></div></a>`).join("");
  const jsonLd = JSON.stringify({"@context": "https://schema.org", "@type": "CollectionPage", name: options.title, url: canonicalUrl, description: options.description, inLanguage: "ko-KR", mainEntity: {"@type": "ItemList", numberOfItems: options.persons.length, itemListElement: options.persons.map((person, index) => ({"@type": "ListItem", position: index + 1, url: `${PUBLIC_SITE_ORIGIN}/missing/${encodeURIComponent(person.id)}`, name: buildMissingPersonTitle(person)}))}}).replace(/</g, "\\u003c");
  const mapParams = new URLSearchParams({utm_source: "organic", utm_medium: "seo", utm_campaign: "missing_collection"});
  const relatedLinks = (options.relatedLinks || []).map((link) =>
    `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(options.title)}</title><meta name="description" content="${escapeHtml(options.description)}" /><meta name="robots" content="${options.persons.length ? "index,follow,max-image-preview:large" : "noindex,follow"}" /><link rel="canonical" href="${escapeHtml(canonicalUrl)}" /><meta property="og:type" content="website" /><meta property="og:locale" content="ko_KR" /><meta property="og:title" content="${escapeHtml(options.title)}" /><meta property="og:description" content="${escapeHtml(options.description)}" /><meta property="og:url" content="${escapeHtml(canonicalUrl)}" /><script type="application/ld+json">${jsonLd}</script><style>${baseStyles}</style></head><body><main class="wrap"><nav class="brand" aria-label="현재 위치"><a href="${PUBLIC_SITE_ORIGIN}/">실종자알림</a><span class="status">공개 수색 정보 ${options.persons.length}건</span></nav><p class="eyebrow">${escapeHtml(options.eyebrow)}</p><h1>${escapeHtml(options.title)}</h1><p class="summary">${escapeHtml(options.description)}</p>${options.supportingCopy ? `<p class="supporting">${escapeHtml(options.supportingCopy)}</p>` : ""}<a class="cta" style="margin-top:18px" rel="nofollow" href="${PUBLIC_SITE_ORIGIN}/map?${escapeHtml(mapParams.toString())}">이름·지역·인상착의로 검색하기</a>${relatedLinks ? `<nav class="related" aria-label="관련 실종자 정보">${relatedLinks}</nav>` : ""}<section class="grid" aria-label="현재 공개 중인 실종자">${list || `<p class="empty">현재 공개 중인 정보가 없습니다.</p>`}</section><a class="back" href="${PUBLIC_SITE_ORIGIN}/map">전국 실종자 지도 확인 →</a><p class="source">공식 출처에서 공개 중인 수색 정보만 표시합니다. 종결되거나 내려간 정보는 목록과 검색 노출에서 제외됩니다.</p></main></body></html>`;
};

export const buildGoneHtml = (): string => `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>더 이상 공개되지 않는 실종자 정보</title><meta name="robots" content="noindex,nofollow,noarchive" /></head><body><main><h1>더 이상 공개되지 않는 정보입니다</h1><p>사건이 종결되었거나 공식 출처에서 내려간 정보는 검색 노출 대상에서 즉시 제외합니다.</p><a href="${PUBLIC_SITE_ORIGIN}/">현재 실종자 정보 확인</a></main></body></html>`;

export const buildMissingPersonsSitemap = (persons: PublicMissingPerson[]): string => {
  const urls = persons.map((person) => `<url><loc>${escapeXml(`${PUBLIC_SITE_ORIGIN}/missing/${encodeURIComponent(person.id)}`)}</loc>${person.updatedAt ? `<lastmod>${person.updatedAt.toISOString()}</lastmod>` : ""}</url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
};

export const buildCollectionSitemap = (paths: string[]): string => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${escapeXml(`${PUBLIC_SITE_ORIGIN}${path}`)}</loc></url>`).join("")}</urlset>`;
export const buildSitemapIndex = (paths: string[]): string => `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<sitemap><loc>${escapeXml(`${PUBLIC_SITE_ORIGIN}${path}`)}</loc></sitemap>`).join("")}</sitemapindex>`;
