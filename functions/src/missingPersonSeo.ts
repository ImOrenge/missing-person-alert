const DEFAULT_SITE_ORIGIN = "https://missingalert.kr";

export const PUBLIC_SITE_ORIGIN = (process.env.PUBLIC_SITE_ORIGIN || DEFAULT_SITE_ORIGIN).replace(/\/+$/, "");

type TimestampLike = {toDate?: () => Date; seconds?: number};

export interface PublicMissingPerson {
  id: string;
  name: string;
  age: number | null;
  ageAtMissing: number | null;
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

export interface PublicSubRegionCandidate {
  regionSlug: string;
  regionName: string;
  name: string;
  slug: string;
  persons: PublicMissingPerson[];
}

export interface PublicMissingType {
  slug: string;
  name: string;
  types: string[];
  title: string;
  description: string;
  eyebrow: string;
}

export interface PublicGuide {
  slug: string;
  title: string;
  description: string;
  heading: string;
  intro: string;
  steps: string[];
  cautions: string[];
  relatedLinks: MissingPersonCollectionLink[];
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
    description: "경찰청 안전Dream에서 치매환자로 분류해 현재 공개 수색 중인 실종 정보를 조회하고 실종 발생 지역과 인상착의를 확인하세요.",
    eyebrow: "치매환자 공개 수색 정보",
  },
  {
    slug: "disability",
    name: "장애인 실종",
    types: ["disabled"],
    title: "장애인 실종 현황·검색 - 최신 공개 정보",
    description: "경찰청 안전Dream에서 장애인으로 분류해 현재 공개 수색 중인 실종 정보를 조회하고 사진, 인상착의와 실종 발생 지역을 확인하세요.",
    eyebrow: "장애인 공개 수색 정보",
  },
];

export const PUBLIC_GUIDES: PublicGuide[] = [
  {
    slug: "missing-report",
    title: "실종 신고 방법과 신고 조회 | 112·182 안내",
    description: "실종 발생 시 112·182 신고, 최근 사진과 발생 정보를 준비하는 순서, 안전Dream 신고 확인 방법을 안내합니다.",
    heading: "실종 신고 방법과 신고 후 확인",
    intro: "실종 발생 시에는 기다리지 말고 경찰에 신속히 알리는 것이 우선입니다. 긴급 출동이 필요한 상황은 112, 실종아동등 신고·상담은 국번 없이 182를 이용하세요.",
    steps: ["긴급한 위험이나 즉시 출동이 필요하면 112에 신고합니다.", "국번 없이 182에 실종 사실을 알리고 담당 경찰관의 안내를 따릅니다.", "최근 사진, 발생 시각·장소, 옷차림과 신체 특징을 준비해 가까운 경찰관서에 제출합니다.", "안전Dream의 실종·보호아동등 신고 확인에서 본인 인증과 신고 정보를 이용해 접수 내용을 확인합니다."],
    cautions: ["신고를 미루며 가족끼리만 장시간 찾지 마세요.", "주민등록번호·연락처·정확한 사적 동선은 공개 게시물에 올리지 마세요."],
    relatedLinks: [{href: "/missing", label: "현재 실종자 조회"}, {href: "/missing/recent", label: "최근 실종자 현황"}, {href: "/missing/type/child", label: "실종아동 공개정보"}, {href: "/missing/type/dementia", label: "치매환자 실종 현황"}, {href: "/missing/type/disability", label: "장애인 실종 현황"}],
  },
  {
    slug: "missing-alert-message",
    title: "실종경보문자 확인과 목격 제보 방법",
    description: "실종경보문자를 받았을 때 공개 사진·인상착의·발생 지역을 확인하고 112·182·#0182로 제보하는 방법입니다.",
    heading: "실종경보문자를 받았을 때 확인할 것",
    intro: "실종경보문자는 공개된 사진, 인상착의와 발생 지역을 시민에게 알리는 수색 정보입니다. 기억에 의존해 단정하지 말고 공식 공개정보와 현재 상황을 함께 확인하세요.",
    steps: ["문자의 이름·사진·인상착의·발생 지역과 시간을 확인합니다.", "비슷한 사람을 목격했다면 현재 위치, 이동 방향, 옷차림과 목격 시각을 기록합니다.", "긴급하면 112, 실종 제보는 182 또는 문자 수신번호 #0182로 알립니다.", "공유할 때는 공식 상세 URL만 사용하고 임의로 개인정보를 덧붙이지 않습니다."],
    cautions: ["대상자에게 무리하게 접근하거나 뒤쫓지 마세요.", "확인되지 않은 신원 추정이나 가족 정보를 온라인에 확산하지 마세요."],
    relatedLinks: [{href: "/missing/recent", label: "최근 공개 정보 확인"}, {href: "/map", label: "전국 지도 확인"}, {href: "/missing/type/child", label: "실종아동 공개정보"}, {href: "/missing/type/dementia", label: "치매환자 실종 현황"}, {href: "/missing/type/disability", label: "장애인 실종 현황"}],
  },
  {
    slug: "missing-child-response",
    title: "아이가 실종됐을 때 즉시 해야 할 일",
    description: "아동 실종 발생 직후 182 신고, 경찰관서 사진 제출, 발생 장소·옷차림 정리 순서를 안내합니다.",
    heading: "아이가 실종됐을 때 즉시 해야 할 일",
    intro: "경찰청 안전Dream은 빠른 초기 조치와 지체 없는 신고를 안내합니다. 국번 없이 182에 신고하고 담당 경찰관의 요청에 협조하세요.",
    steps: ["국번 없이 182 또는 긴급 상황이면 112에 즉시 신고합니다.", "아이의 최근 사진을 가까운 경찰서에 신속히 제출합니다.", "마지막으로 확인한 시각·장소, 옷차림, 이동 가능 장소를 정확히 정리합니다.", "경찰 수색과 정보 공개 범위에 관한 안내를 따릅니다."],
    cautions: ["초기 신고를 늦추지 마세요.", "아동의 민감한 개인정보를 공개 커뮤니티에 과도하게 게시하지 마세요."],
    relatedLinks: [{href: "/missing/type/child", label: "실종아동 공개정보"}, {href: "/missing", label: "전국 실종자 조회"}],
  },
  {
    slug: "dementia-missing-response",
    title: "치매환자 실종 시 신고와 대응 방법",
    description: "치매환자 실종 시 112·182 신고, 최근 사진·옷차림·마지막 위치 준비와 안전한 정보 공유 원칙을 안내합니다.",
    heading: "치매환자가 실종됐을 때 대응 순서",
    intro: "치매환자는 안전Dream의 실종아동등 신고·사전등록 대상에 포함됩니다. 실종을 확인하면 신속히 112·182로 신고하고 경찰 안내를 따르세요.",
    steps: ["긴급 출동이 필요하면 112, 실종 신고·상담은 182로 연락합니다.", "최근 사진, 옷차림, 보행 특성, 마지막 확인 시각과 위치를 정리합니다.", "자주 가던 장소와 이동 수단을 경찰에 알립니다.", "발견 전에는 공식 공개정보 링크를 중심으로 공유하고, 발견·종결 후에는 게시물을 내립니다."],
    cautions: ["보호자의 연락처나 환자의 상세 의료정보를 공개 게시물에 적지 마세요.", "혼자 장거리 수색을 계속하며 경찰 신고를 미루지 마세요."],
    relatedLinks: [{href: "/missing/type/dementia", label: "치매환자 실종 현황"}, {href: "/missing/recent", label: "최근 실종자 현황"}],
  },
  {
    slug: "report-sighting",
    title: "실종자 목격 제보 방법 | 위치·시간·이동 방향",
    description: "실종자로 보이는 사람을 목격했을 때 안전을 지키며 위치·시간·이동 방향을 112·182·#0182로 제보하는 방법입니다.",
    heading: "실종자를 목격했을 때 제보하는 방법",
    intro: "목격 제보는 빠르고 구체적일수록 도움이 됩니다. 본인의 안전을 우선하고, 긴급하면 112, 실종 제보는 182 또는 #0182를 이용하세요.",
    steps: ["현재 위치와 목격 시각을 먼저 확인합니다.", "이동 방향, 옷차림, 동행자·이동 수단 등 눈으로 확인한 사실만 기록합니다.", "긴급하면 112, 실종 제보는 182 또는 문자 #0182로 알립니다.", "MissingAlert 온라인 제보를 이용할 때도 연락처나 정확한 개인 위치는 공개 글에 쓰지 않습니다."],
    cautions: ["대상자를 붙잡거나 위험한 상황에 개입하지 마세요.", "사진 촬영·온라인 확산보다 경찰 제보를 우선하고, 추측을 사실처럼 쓰지 마세요."],
    relatedLinks: [{href: "/missing", label: "현재 실종자 조회"}, {href: "/reports/new", label: "안전한 온라인 제보"}, {href: "/missing/type/child", label: "실종아동 공개정보"}, {href: "/missing/type/dementia", label: "치매환자 실종 현황"}, {href: "/missing/type/disability", label: "장애인 실종 현황"}],
  },
];

export const getPublicGuide = (slug: string): PublicGuide | undefined => PUBLIC_GUIDES.find((guide) => guide.slug === slug);

const asText = (value: unknown, fallback = ""): string =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

const asPublicAddress = (value: unknown): string => {
  const address = asText(value);
  return /^(?:대한민국|미상|주소\s*미상|지역\s*미상)$/.test(address) ? "" : address;
};

const asNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const asPositiveNumber = (value: unknown): number | null => {
  const parsed = asNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
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
    age: asPositiveNumber(data.currentAge ?? data.age),
    ageAtMissing: asPositiveNumber(data.ageAtMissing),
    gender: asText(data.gender, "U"),
    address: asPublicAddress(location.address ?? data.address),
    missingDate: asDate(data.missingDate)?.toISOString() ?? null,
    description: asText(data.description ?? data.clothes, "인상착의 정보 없음"),
    type: asText(data.type, "unknown"),
    photo: asPublicImageUrl(data.photo),
    height: asPositiveNumber(data.height),
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
const formatKoreanDateTime = (value: Date): string =>
  new Intl.DateTimeFormat("ko-KR", {year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul"}).format(value);

export const isMissingPersonWithinDays = (person: PublicMissingPerson, days: number, now = new Date()): boolean => {
  if (!person.missingDate || !Number.isFinite(days) || days <= 0) return false;
  const occurredAt = new Date(person.missingDate).getTime();
  if (!Number.isFinite(occurredAt)) return false;
  const elapsed = now.getTime() - occurredAt;
  return elapsed >= 0 && elapsed < days * 24 * 60 * 60 * 1000;
};

const publicAgeLabels = (person: PublicMissingPerson): string[] => {
  if (person.type === "missing_child") {
    if (person.ageAtMissing !== null && person.age !== null) {
      return [`실종 당시 ${person.ageAtMissing}세`, `현재 ${person.age}세 추정`];
    }
    if (person.ageAtMissing !== null) return [`실종 당시 ${person.ageAtMissing}세`];
    if (person.age !== null) return [`현재 공개 연령 ${person.age}세`, "실종 당시 아동으로 분류된 사건"];
    return ["실종 당시 아동으로 분류된 사건"];
  }
  return [person.age === null ? "공개 연령 정보 없음" : `현재 공개 연령 ${person.age}세`];
};
const publicAgeLabel = (person: PublicMissingPerson): string => publicAgeLabels(person).join(" · ");

export interface PublicReportTimelineItem {
  id: string;
  reportType: string;
  occurredAt: string;
  publicDescription: string;
  publicLocationText: string;
  publicStatus: "approved" | "forwarded" | "confirmed";
}

export const buildMissingPersonTitle = (person: PublicMissingPerson): string => {
  const age = person.type === "missing_child"
    ? (person.ageAtMissing === null ? "" : `(실종 당시 ${person.ageAtMissing}세)`)
    : (person.age === null ? "" : `(현재 ${person.age}세)`);
  const address = person.address ? ` - ${compactAddress(person.address)}` : "";
  const date = formatShortKoreanDate(person.missingDate);
  return `[${typeLabel(person.type)} 찾습니다] ${person.name}${age}${address}${date ? ` · ${date}` : ""}`;
};

export const getPublicRegion = (slug: string): PublicRegion | undefined => PUBLIC_REGIONS.find((region) => region.slug === slug);
export const getPublicRegionForAddress = (address: string): PublicRegion | undefined => {
  const normalized = address.trim().replace(/^대한민국\s*/, "");
  return PUBLIC_REGIONS.find((region) => region.aliases.some((alias) => normalized === alias || normalized.startsWith(`${alias} `)));
};

export const getPublicSubRegionName = (address: string, region: PublicRegion): string | null => {
  const normalizedAddress = address.trim().replace(/^대한민국\s*/, "");
  const matchedRegion = getPublicRegionForAddress(normalizedAddress);
  if (matchedRegion?.slug !== region.slug) return null;
  const tokens = normalizedAddress.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const second = tokens[1];
  const third = tokens[2] || "";
  const candidate = /(?:시|군)$/.test(second) && /구$/.test(third) ? `${second} ${third}` : second;
  return /(?:시|군|구)$/.test(candidate) ? candidate : null;
};

export const buildPublicSubRegionCandidates = (
  persons: PublicMissingPerson[],
  minimumActiveCases = 3,
  limit = 10
): PublicSubRegionCandidate[] => {
  const groups = new Map<string, PublicSubRegionCandidate>();
  persons.forEach((person) => {
    const region = getPublicRegionForAddress(person.address);
    if (!region) return;
    const name = getPublicSubRegionName(person.address, region);
    if (!name) return;
    const slug = name.normalize("NFKC").replace(/\s+/g, "-");
    const key = `${region.slug}:${slug}`;
    const existing = groups.get(key);
    if (existing) existing.persons.push(person);
    else groups.set(key, {regionSlug: region.slug, regionName: region.name, name, slug, persons: [person]});
  });
  return [...groups.values()]
    .filter((candidate) => candidate.persons.length >= minimumActiveCases)
    .map((candidate) => ({
      ...candidate,
      persons: [...candidate.persons].sort((a, b) => (b.missingDate || "").localeCompare(a.missingDate || "")),
    }))
    .sort((a, b) => b.persons.length - a.persons.length || `${a.regionSlug}:${a.slug}`.localeCompare(`${b.regionSlug}:${b.slug}`))
    .slice(0, Math.max(0, limit));
};
export const getPublicMissingType = (slug: string): PublicMissingType | undefined =>
  PUBLIC_MISSING_TYPES.find((missingType) => missingType.slug === slug);
export const getPublicMissingTypeForType = (type: string): PublicMissingType | undefined =>
  PUBLIC_MISSING_TYPES.find((missingType) => missingType.types.includes(type));

const buildAppUrl = (personId: string): string => {
  const params = new URLSearchParams({personId});
  return `${PUBLIC_SITE_ORIGIN}/map?${params.toString()}`;
};

const baseStyles = `
:root{font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;color:#172033;background:#f5f7fa;--navy:#173554;--red:#c9403a;--line:#dfe5ec;--muted:#617085;--paper:#fff;--soft:#f6f8fb}*{box-sizing:border-box}body{margin:0;padding-bottom:76px}.wrap{max-width:780px;margin:auto;padding:22px 16px 48px}.brand{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.brand a{color:var(--navy);font-weight:900;text-decoration:none}.status{display:inline-flex;align-items:center;gap:7px;border-radius:999px;background:#fff0ef;color:#a92f2a;font-size:.8rem;font-weight:900;padding:7px 10px}.status:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--red)}.card{background:var(--paper);border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(19,32,51,.08)}.photo{width:100%;max-height:520px;object-fit:contain;background:#edf0f4}.content{padding:22px}.eyebrow{color:var(--red);font-size:.8rem;font-weight:900;letter-spacing:.04em;margin:0}h1{font-size:clamp(1.65rem,5vw,2.3rem);line-height:1.25;margin:.45rem 0 .8rem}h2{font-size:1.08rem;margin:24px 0 8px}.summary{color:#425168;line-height:1.7;margin:0}.supporting{margin-top:14px;color:#425168;line-height:1.75}.count-note{margin:14px 0 0;padding:12px 14px;border-radius:10px;background:#eef4fa;color:#294866;font-weight:800;line-height:1.6}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:18px 0}.fact{padding:13px;border-radius:10px;background:var(--soft)}.label{display:block;color:var(--muted);font-size:.78rem;margin-bottom:4px}.notice{border-left:4px solid var(--red);padding:12px 14px;background:#fff5f4;line-height:1.65}.actions{display:grid;gap:10px;margin-top:20px}.cta{display:flex;align-items:center;justify-content:center;min-height:48px;border:0;border-radius:10px;background:var(--navy);color:#fff;text-align:center;text-decoration:none;font:inherit;font-weight:900;padding:13px 18px;cursor:pointer}.cta.secondary{background:#fff;color:var(--navy);border:1px solid #b9c6d5}.call-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sticky{position:fixed;z-index:10;left:16px;right:16px;bottom:max(12px,env(safe-area-inset-bottom));box-shadow:0 8px 24px rgba(15,36,60,.3)}.related,.link-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.related a,.link-grid a{border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--navy);font-size:.84rem;font-weight:800;padding:8px 11px;text-decoration:none}.link-section{margin-top:24px}.link-section h2{margin-bottom:6px}.source{margin:18px 0 0;color:var(--muted);font-size:.84rem;line-height:1.65}.updated{color:var(--muted);font-size:.82rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-top:16px}.person-card{display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;color:inherit;text-decoration:none}.person-card img{width:100%;height:220px;object-fit:contain;background:#edf0f4}.person-card .placeholder{display:grid;height:160px;place-items:center;background:#edf0f4;color:var(--muted);font-weight:800}.person-card .body{padding:16px}.person-card h2{margin:0 0 8px;font-size:1.05rem}.person-card p{margin:4px 0;color:#4c5b70;font-size:.88rem;line-height:1.5}.back{display:inline-flex;margin-top:22px;color:var(--navy);font-weight:800}.empty{padding:28px;border:1px solid var(--line);border-radius:14px;background:#fff;color:var(--muted)}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:20px 0}.stat{padding:16px;border:1px solid var(--line);border-radius:12px;background:#fff}.stat strong{display:block;font-size:1.4rem;color:var(--navy)}@media(min-width:640px){body{padding-bottom:0}.wrap{padding-top:32px}.content{padding:28px}.actions{grid-template-columns:1.35fr .65fr}.call-grid{grid-column:1/-1}.sticky{display:none}}`;

const timelineStyles = `.timeline{margin-top:26px;padding-top:2px}.timeline ol{list-style:none;margin:14px 0;padding:0;display:grid;gap:12px}.report{border:1px solid var(--line);border-left:4px solid var(--navy);border-radius:12px;padding:14px;background:var(--soft)}.report-head{display:flex;justify-content:space-between;gap:10px;font-size:.82rem;color:var(--navy)}.report-head span{border-radius:999px;background:#e6edf5;padding:4px 8px}.safe-location{font-size:.86rem;font-weight:800;color:var(--navy)}.report .source{margin-top:8px}`;

const buildSearchEntryTrackingScript = (pageGroup: string): string => `<script>(()=>{const source=(()=>{try{const h=new URL(document.referrer).hostname.toLowerCase();if(!h||h===location.hostname||h.endsWith("missingalert.kr"))return"direct";if(h.includes("google."))return"google";if(h.includes("naver."))return"naver";if(h.includes("bing."))return"bing";if(h.includes("daum.")||h.includes("kakao."))return"daum";return"other"}catch{return"direct"}})(),isSearch=["google","naver","bing","daum"].includes(source),human=!navigator.webdriver&&!/bot|crawler|spider|slurp|bingpreview/i.test(navigator.userAgent),track=(event,caseId)=>navigator.sendBeacon("/api/seo/events",new Blob([JSON.stringify({event,caseId:caseId||null,source,pageGroup:${JSON.stringify(pageGroup)}})],{type:"application/json"})),entryKey="seo_search_entry:"+location.pathname,detailKey="seo_detail_started:"+location.pathname,once=(key,event,caseId)=>{try{if(sessionStorage.getItem(key)==="1")return;sessionStorage.setItem(key,"1")}catch{}track(event,caseId)};if(human&&isSearch&&!document.hidden)setTimeout(()=>{if(!document.hidden)once(entryKey,"seo_search_entry")},1200);document.querySelectorAll("[data-seo-case-id]").forEach((link)=>link.addEventListener("click",()=>{if(!human||!isSearch)return;once(entryKey,"seo_search_entry");once(detailKey,"seo_detail_started",link.dataset.seoCaseId)}))})();</script>`;

export const buildMissingPersonHtml = (
  person: PublicMissingPerson,
  publicReports: PublicReportTimelineItem[] = [],
  relatedPersons: PublicMissingPerson[] = []
): string => {
  const canonicalUrl = `${PUBLIC_SITE_ORIGIN}/missing/${encodeURIComponent(person.id)}`;
  const ageLabel = publicAgeLabel(person);
  const title = buildMissingPersonTitle(person);
  const dateLabel = formatKoreanDate(person.missingDate);
  const occurrencePhrase = person.address ? `${person.address}에서 실종된` : "실종된";
  const reviewedReportSummary = publicReports.length > 0 ? ` 운영자 검토를 마친 사용자 제보 ${publicReports.length}건도 함께 확인할 수 있습니다.` : "";
  const summary = `${dateLabel} ${occurrencePhrase} ${person.name}님(${ageLabel}, ${genderLabel(person.gender)})의 안전Dream 공개 정보입니다. 사진과 인상착의, 실종 발생 지역을 확인하고 목격 시 112 또는 182로 제보해 주세요.${reviewedReportSummary}`;
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
    isMissingPersonWithinDays(person, 30) ? `<a href="${PUBLIC_SITE_ORIGIN}/missing/recent">최근 실종자 현황</a>` : "",
  ].filter(Boolean).join("");
  const relatedPersonLinks = relatedPersons.slice(0, 3).map((related) =>
    `<a class="person-card" data-seo-case-id="${escapeHtml(related.id)}" href="${PUBLIC_SITE_ORIGIN}/missing/${encodeURIComponent(related.id)}"><div class="body"><h2>${escapeHtml(related.name)}님</h2><p>${escapeHtml(formatKoreanDate(related.missingDate))}</p>${related.address ? `<p>${escapeHtml(related.address)}</p>` : ""}</div></a>`).join("");
  const relatedPersonSection = region && relatedPersonLinks ? `<section aria-labelledby="same-region-title"><h2 id="same-region-title">같은 지역의 최근 공개 정보</h2><div class="grid">${relatedPersonLinks}</div></section>` : "";
  const reportPriority = {confirmed: 0, forwarded: 1, approved: 2};
  const reportTimeline = [...publicReports]
    .sort((a, b) => reportPriority[a.publicStatus] - reportPriority[b.publicStatus] || b.occurredAt.localeCompare(a.occurredAt))
    .map((report) => `<li class="report"><div class="report-head"><strong>사용자 제보 · 운영 검토 완료</strong><span>${escapeHtml(report.publicStatus === "confirmed" ? "기관 확인" : report.publicStatus === "forwarded" ? "기관 전달" : "공개 승인")}</span></div><p class="updated">목격 시각 ${escapeHtml(formatKoreanDate(report.occurredAt))}</p><p class="summary">${escapeHtml(report.publicDescription)}</p><p class="safe-location">공개 위치 · ${escapeHtml(report.publicLocationText)}</p><p class="source">공식 확인 정보와 다를 수 있으며 정확한 좌표·연락처·원문은 공개하지 않습니다.</p></li>`).join("");
  const reportSection = publicReports.length > 0
    ? `<section class="timeline" aria-labelledby="public-report-title"><h2 id="public-report-title">검토된 사용자 제보 ${publicReports.length}건</h2><p class="summary">운영자가 개인정보와 공개 위치를 검토한 제보만 목격 시각 순으로 표시합니다.</p><ol>${reportTimeline}</ol></section>`
    : `<section class="timeline" aria-labelledby="public-report-title"><h2 id="public-report-title">검토된 사용자 제보</h2><p class="summary">현재 공개 승인된 사용자 제보가 없습니다. 미검토 제보는 이 페이지에 표시되지 않습니다.</p></section>`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(summary)}" /><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" /><link rel="canonical" href="${escapeHtml(canonicalUrl)}" /><link rel="alternate" type="application/rss+xml" title="MissingAlert 최근 공개 수색 정보" href="${PUBLIC_SITE_ORIGIN}/rss.xml" />
<meta property="og:type" content="article" /><meta property="og:locale" content="ko_KR" /><meta property="og:site_name" content="실종자알림" /><meta property="og:title" content="${escapeHtml(title)}" /><meta property="og:description" content="${escapeHtml(summary)}" /><meta property="og:url" content="${escapeHtml(canonicalUrl)}" />${imageMeta}<meta name="twitter:title" content="${escapeHtml(title)}" /><meta name="twitter:description" content="${escapeHtml(summary)}" />
<script type="application/ld+json">${jsonLd}</script><style>${baseStyles}${timelineStyles}</style></head><body><main class="wrap">
<nav class="brand" aria-label="현재 위치"><a href="${PUBLIC_SITE_ORIGIN}/">실종자알림</a><span class="status">현재 수색 중</span></nav><section class="card">
${person.photo ? `<img class="photo" src="${escapeHtml(person.photo)}" alt="${escapeHtml(person.name)}님 실종 당시 공개 사진" />` : ""}<div class="content"><p class="eyebrow">경찰청 안전Dream 공개 데이터</p><h1>${escapeHtml(`${person.address ? `${compactAddress(person.address)} ` : ""}${typeLabel(person.type)} ${person.name}님을 찾습니다`)}</h1><p class="summary">${escapeHtml(summary)}</p>
<div class="facts"><div class="fact"><span class="label">인적 사항</span>${escapeHtml(`${ageLabel} · ${genderLabel(person.gender)}`)}</div><div class="fact"><span class="label">안전Dream 공개 분류</span>${escapeHtml(typeLabel(person.type))}</div><div class="fact"><span class="label">실종 일자</span>${escapeHtml(dateLabel)}</div>${person.address ? `<div class="fact"><span class="label">실종 발생 지역</span>${escapeHtml(person.address)}</div>` : ""}${person.height === null ? "" : `<div class="fact"><span class="label">신장</span>${escapeHtml(`${person.height}cm`)}</div>`}<div class="fact"><span class="label">공개 상태</span>안전Dream 현재 공개 중</div></div>
<h2>인상착의 및 특징</h2><p class="summary">${escapeHtml(person.clothes || person.description)}</p>${reportSection}<p class="notice"><strong>목격하거나 관련 정보를 알고 계시면 즉시 경찰 112 또는 안전Dream 182로 제보해 주세요.</strong> 사실 확인이 되지 않은 정보나 개인정보는 온라인에 재게시하지 마세요.</p>
<div class="actions"><a class="cta" data-seo-event="seo_app_cta_click" rel="nofollow" href="${escapeHtml(buildAppUrl(person.id))}">사진·인상착의와 지도에서 확인</a><a class="cta secondary" data-seo-event="report_started" rel="nofollow" href="${PUBLIC_SITE_ORIGIN}/reports/new?personId=${encodeURIComponent(person.id)}">이 사건에 온라인 제보</a><button class="cta secondary" id="share-case" type="button">공식 페이지 공유</button><div class="call-grid"><a class="cta secondary" data-seo-event="call_112_click" rel="nofollow" href="tel:112">경찰 112 전화</a><a class="cta secondary" data-seo-event="call_182_click" rel="nofollow" href="tel:182">안전Dream 182 전화</a></div></div>
<nav class="related" aria-label="관련 실종자 정보">${relatedLinks}</nav>${relatedPersonSection}${person.updatedAt ? `<p class="updated">정보 실제 변경: ${escapeHtml(formatKoreanDateTime(person.updatedAt))}</p>` : ""}<p class="source">이 페이지는 경찰청 안전Dream 공개 데이터를 바탕으로 제공합니다. 사건이 종결되거나 공식 출처에서 내려가면 검색 노출에서 제외됩니다. 클릭 측정은 사건별·일자별 합계만 저장하며 방문자 식별정보는 저장하지 않습니다.</p></div></section></main><a class="cta sticky" data-seo-event="seo_app_cta_click" rel="nofollow" href="${escapeHtml(buildAppUrl(person.id))}">지도에서 바로 확인</a>
<script>(()=>{const p=${sharePayload},b=document.getElementById("share-case"),caseId=${JSON.stringify(person.id)},source=(()=>{try{const h=new URL(document.referrer).hostname.toLowerCase();if(!h||h===location.hostname||h.endsWith("missingalert.kr"))return"direct";if(h.includes("google."))return"google";if(h.includes("naver."))return"naver";if(h.includes("bing."))return"bing";if(h.includes("daum.")||h.includes("kakao."))return"daum";return"other"}catch{return"direct"}})(),isSearch=["google","naver","bing","daum"].includes(source),track=(event,targetCaseId=caseId)=>navigator.sendBeacon("/api/seo/events",new Blob([JSON.stringify({event,caseId:targetCaseId,source,pageGroup:"detail"})],{type:"application/json"})),once=(key,event,targetCaseId=caseId)=>{try{if(sessionStorage.getItem(key)==="1")return;sessionStorage.setItem(key,"1")}catch{}track(event,targetCaseId)};document.querySelectorAll("[data-seo-event]").forEach((link)=>link.addEventListener("click",()=>once("seo_action:"+link.dataset.seoEvent+":"+caseId,link.dataset.seoEvent)));document.querySelectorAll("[data-seo-case-id]").forEach((link)=>link.addEventListener("click",()=>{if(isSearch)once("seo_detail_started:"+location.pathname,"seo_detail_started",link.dataset.seoCaseId)}));const key="seo_detail_view:"+caseId,human=!navigator.webdriver&&!/bot|crawler|spider|slurp|bingpreview/i.test(navigator.userAgent);if(human&&!document.hidden){let seen=false;try{seen=sessionStorage.getItem(key)==="1"}catch{}if(!seen)setTimeout(()=>{if(document.hidden)return;track("seo_detail_view");try{sessionStorage.setItem(key,"1")}catch{}if(isSearch){once("seo_search_entry:"+location.pathname,"seo_search_entry");once("seo_detail_started:"+location.pathname,"seo_detail_started")}},1200);try{const firstKey="missingalert_search_first_seen",returnKey="seo_return_visit",firstSeen=Number(localStorage.getItem(firstKey)||0);if(firstSeen&&Date.now()-firstSeen>=21600000&&sessionStorage.getItem(returnKey)!=="1"){track("seo_return_visit");sessionStorage.setItem(returnKey,"1")}if(isSearch&&!firstSeen)localStorage.setItem(firstKey,String(Date.now()))}catch{}}if(!b)return;b.addEventListener("click",async()=>{try{if(navigator.share)await navigator.share(p);else await navigator.clipboard.writeText(p.url);once("seo_action:share_started:"+caseId,"share_started");b.textContent=navigator.share?"공유 완료":"링크 복사 완료"}catch(e){if(e&&e.name!=="AbortError")b.textContent="공유하지 못했습니다"}})})();</script></body></html>`;
};

export interface MissingPersonCollectionLink {href: string; label: string}
export interface MissingPersonCollectionLinkSection {heading: string; links: MissingPersonCollectionLink[]}
export interface MissingPersonCollectionOptions {
  title: string;
  description: string;
  canonicalPath: string;
  eyebrow: string;
  persons: PublicMissingPerson[];
  supportingCopy?: string;
  relatedLinks?: MissingPersonCollectionLink[];
  linkSections?: MissingPersonCollectionLinkSection[];
  totalCount?: number;
  countDefinition?: string;
  listHeading?: string;
}

export const buildMissingPersonCollectionHtml = (options: MissingPersonCollectionOptions): string => {
  const canonicalUrl = `${PUBLIC_SITE_ORIGIN}${options.canonicalPath}`;
  const totalCount = Math.max(options.persons.length, options.totalCount ?? options.persons.length);
  const list = options.persons.map((person) => `<a class="person-card" data-seo-case-id="${escapeHtml(person.id)}" href="${PUBLIC_SITE_ORIGIN}/missing/${encodeURIComponent(person.id)}">${person.photo ? `<img src="${escapeHtml(person.photo)}" alt="${escapeHtml(person.name)}님 실종 당시 공개 사진" loading="lazy" />` : `<div class="placeholder">공개 사진 없음</div>`}<div class="body"><h2>${escapeHtml(person.name)}님</h2>${publicAgeLabels(person).map((label) => `<p>${escapeHtml(label)}</p>`).join("")}<p>${escapeHtml(formatKoreanDate(person.missingDate))}</p>${person.address ? `<p>${escapeHtml(person.address)}</p>` : ""}<p><strong>사진과 인상착의 확인</strong></p></div></a>`).join("");
  const jsonLd = JSON.stringify({"@context": "https://schema.org", "@type": "CollectionPage", name: options.title, url: canonicalUrl, description: options.description, inLanguage: "ko-KR", mainEntity: {"@type": "ItemList", numberOfItems: options.persons.length, itemListElement: options.persons.map((person, index) => ({"@type": "ListItem", position: index + 1, url: `${PUBLIC_SITE_ORIGIN}/missing/${encodeURIComponent(person.id)}`, name: buildMissingPersonTitle(person)}))}}).replace(/</g, "\\u003c");
  const relatedLinks = (options.relatedLinks || []).map((link) =>
    `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join("");
  const linkSections = (options.linkSections || []).map((section) => `<section class="link-section"><h2>${escapeHtml(section.heading)}</h2><nav class="link-grid" aria-label="${escapeHtml(section.heading)}">${section.links.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join("")}</nav></section>`).join("");
  const countNote = `<p class="count-note">현재 공개 수색 정보 ${totalCount}건${totalCount > options.persons.length ? ` · 최근 등록순 ${options.persons.length}건 표시` : ""}</p>`;
  const countDefinition = options.countDefinition || "이 수치는 전체 실종 신고 건수가 아니라 경찰청 안전Dream에서 현재 공개 중인 수색 정보 건수입니다.";
  const pageGroup = options.canonicalPath === "/missing" ? "nationwide" : options.canonicalPath.startsWith("/missing/region/") ? "region" : options.canonicalPath.startsWith("/missing/type/") ? "type" : options.canonicalPath === "/missing/recent" ? "recent" : "other";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(options.title)}</title><meta name="description" content="${escapeHtml(options.description)}" /><meta name="robots" content="${options.persons.length ? "index,follow,max-image-preview:large" : "noindex,follow"}" /><link rel="canonical" href="${escapeHtml(canonicalUrl)}" /><link rel="alternate" type="application/rss+xml" title="MissingAlert 최근 공개 수색 정보" href="${PUBLIC_SITE_ORIGIN}/rss.xml" /><meta property="og:type" content="website" /><meta property="og:locale" content="ko_KR" /><meta property="og:title" content="${escapeHtml(options.title)}" /><meta property="og:description" content="${escapeHtml(options.description)}" /><meta property="og:url" content="${escapeHtml(canonicalUrl)}" /><script type="application/ld+json">${jsonLd}</script><style>${baseStyles}</style></head><body><main class="wrap"><nav class="brand" aria-label="현재 위치"><a href="${PUBLIC_SITE_ORIGIN}/">실종자알림</a><span class="status">공개 수색 정보 ${totalCount}건</span></nav><p class="eyebrow">${escapeHtml(options.eyebrow)}</p><h1>${escapeHtml(options.title)}</h1><p class="summary">${escapeHtml(options.description)}</p>${countNote}<p class="source">${escapeHtml(countDefinition)}</p>${options.supportingCopy ? `<p class="supporting">${escapeHtml(options.supportingCopy)}</p>` : ""}<a class="cta" style="margin-top:18px" href="${PUBLIC_SITE_ORIGIN}/map">이름·지역·인상착의로 검색하기</a>${linkSections}${relatedLinks ? `<nav class="related" aria-label="관련 실종자 정보">${relatedLinks}</nav>` : ""}<section aria-labelledby="collection-list-title"><h2 id="collection-list-title">${escapeHtml(options.listHeading || "현재 공개 중인 실종자 명단")}</h2><div class="grid" aria-label="현재 공개 중인 실종자">${list || `<p class="empty">현재 공개 중인 정보가 없습니다.</p>`}</div></section><a class="back" href="${PUBLIC_SITE_ORIGIN}/map">전국 실종자 지도 확인 →</a><p class="source">공식 출처에서 공개 중인 수색 정보만 표시합니다. 종결되거나 내려간 정보는 목록과 검색 노출에서 제외됩니다.</p></main>${buildSearchEntryTrackingScript(pageGroup)}</body></html>`;
};

export const buildMissingPersonStatisticsHtml = (persons: PublicMissingPerson[]): string => {
  const canonicalUrl = `${PUBLIC_SITE_ORIGIN}/missing/statistics`;
  const latestUpdatedAt = persons.reduce<Date | null>((latest, person) =>
    person.updatedAt && (!latest || person.updatedAt > latest) ? person.updatedAt : latest, null);
  const regions = PUBLIC_REGIONS.map((region) => ({
    ...region,
    count: persons.filter((person) => getPublicRegionForAddress(person.address)?.slug === region.slug).length,
  })).filter((region) => region.count > 0).sort((a, b) => b.count - a.count);
  const types = PUBLIC_MISSING_TYPES.map((missingType) => ({
    ...missingType,
    count: persons.filter((person) => missingType.types.includes(person.type)).length,
  })).filter((missingType) => missingType.count > 0);
  const recent7 = persons.filter((person) => isMissingPersonWithinDays(person, 7)).length;
  const recent30 = persons.filter((person) => isMissingPersonWithinDays(person, 30)).length;
  const description = `경찰청 안전Dream에서 현재 공개 중인 수색 정보 ${persons.length}건을 지역·유형·최근 기간별로 집계한 현황입니다. 전체 실종 신고 통계와는 다릅니다.`;
  const regionLinks = regions.map((region) => `<a href="${PUBLIC_SITE_ORIGIN}/missing/region/${region.slug}">${escapeHtml(region.name)} <strong>${region.count}건</strong></a>`).join("");
  const typeLinks = types.map((missingType) => `<a href="${PUBLIC_SITE_ORIGIN}/missing/type/${missingType.slug}">${escapeHtml(missingType.name)} <strong>${missingType.count}건</strong></a>`).join("");
  const jsonLd = JSON.stringify({"@context": "https://schema.org", "@type": "Dataset", name: "현재 공개 수색 정보 현황", url: canonicalUrl, description, inLanguage: "ko-KR", dateModified: latestUpdatedAt?.toISOString(), creator: {"@type": "Organization", name: "실종자알림"}, isBasedOn: "https://www.safe182.go.kr/"}).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>현재 공개 수색 정보 통계 | 지역·유형별 실종자 현황</title><meta name="description" content="${escapeHtml(description)}" /><meta name="robots" content="${persons.length ? "index,follow,max-snippet:-1" : "noindex,follow"}" /><link rel="canonical" href="${canonicalUrl}" /><link rel="alternate" type="application/rss+xml" title="MissingAlert 최근 공개 수색 정보" href="${PUBLIC_SITE_ORIGIN}/rss.xml" /><script type="application/ld+json">${jsonLd}</script><style>${baseStyles}</style></head><body><main class="wrap"><nav class="brand"><a href="${PUBLIC_SITE_ORIGIN}/">실종자알림</a><span class="status">현재 공개 정보</span></nav><p class="eyebrow">공식 공개정보 집계</p><h1>현재 공개 수색 정보 현황</h1><p class="summary">${escapeHtml(description)}</p>${latestUpdatedAt ? `<p class="updated">집계 기준: 안전Dream 공개 데이터의 최신 실제 변경 ${escapeHtml(formatKoreanDateTime(latestUpdatedAt))}</p>` : ""}<p class="notice"><strong>전체 신고 건수와 혼합하지 않습니다.</strong> 아래 숫자는 연간 실종 신고·발견·귀가 통계가 아니라 현재 공개 수색 페이지에서 확인할 수 있는 건수입니다.</p><section class="stats" aria-label="현재 공개 수색 정보 요약"><div class="stat"><strong>${persons.length}건</strong>현재 공개</div><div class="stat"><strong>${recent7}건</strong>최근 7일</div><div class="stat"><strong>${recent30}건</strong>최근 30일</div></section><section class="link-section"><h2>지역별 현재 공개 수색 정보</h2><nav class="link-grid">${regionLinks || "공개 중인 지역 정보가 없습니다."}</nav></section><section class="link-section"><h2>유형별 현재 공개 수색 정보</h2><nav class="link-grid">${typeLinks || "공개 중인 유형 정보가 없습니다."}</nav></section><h2>자료 출처와 산정 기준</h2><p class="summary">경찰청 안전Dream 공개 수색 목록 중 현재 공개 상태이며 검색 노출이 허용된 공식 API 사건만 집계합니다. 종결되거나 공식 출처에서 내려간 사건은 자동으로 제외합니다.</p><nav class="related"><a href="${PUBLIC_SITE_ORIGIN}/missing">전국 실종자 조회</a><a href="${PUBLIC_SITE_ORIGIN}/missing/recent">최근 실종자 현황</a><a href="https://www.safe182.go.kr/" rel="noopener noreferrer">경찰청 안전Dream 원문</a></nav></main>${buildSearchEntryTrackingScript("statistics")}</body></html>`;
};

export const buildRegionEmbedHtml = (region: PublicRegion, persons: PublicMissingPerson[]): string => {
  const regionUrl = `${PUBLIC_SITE_ORIGIN}/missing/region/${region.slug}`;
  const recentItems = persons.slice(0, 3).map((person) =>
    `<li><a target="_blank" rel="noopener" href="${PUBLIC_SITE_ORIGIN}/missing/${encodeURIComponent(person.id)}"><strong>${escapeHtml(person.name)}님</strong><span>${escapeHtml(formatKoreanDate(person.missingDate))} · ${escapeHtml(compactAddress(person.address))}</span></a></li>`
  ).join("");
  const list = recentItems || `<li class="empty">현재 공개 수색 중인 지역 정보가 없습니다.</li>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(region.name)} 공개 수색 정보 위젯</title><meta name="robots" content="noindex,follow,noarchive" /><style>:root{font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;color:#172033;background:transparent}*{box-sizing:border-box}body{margin:0}.widget{border:1px solid #dfe5ec;border-radius:14px;background:#fff;padding:16px;box-shadow:0 4px 16px rgba(19,32,51,.08)}header{display:flex;align-items:start;justify-content:space-between;gap:12px}p{margin:0;color:#617085;font-size:.76rem}h1{margin:4px 0 0;font-size:1.05rem}.count{white-space:nowrap;border-radius:999px;background:#fff0ef;color:#a92f2a;font-size:.76rem;font-weight:900;padding:7px 9px}ul{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:8px}li a{display:flex;flex-direction:column;gap:3px;border-radius:10px;background:#f6f8fb;color:#173554;padding:10px;text-decoration:none}li a:hover,li a:focus{outline:2px solid #173554;outline-offset:1px}li span{color:#617085;font-size:.76rem}.empty{color:#617085;font-size:.82rem;padding:10px}.more{display:flex;justify-content:center;margin-top:12px;border-radius:10px;background:#173554;color:#fff;font-size:.84rem;font-weight:900;padding:11px;text-decoration:none}.source{margin-top:10px;line-height:1.5}</style></head><body><section class="widget" aria-labelledby="widget-title"><header><div><p>MissingAlert 공개정보</p><h1 id="widget-title">${escapeHtml(region.name)} 현재 공개 수색</h1></div><span class="count">${persons.length}건</span></header><ul>${list}</ul><a class="more" target="_blank" rel="noopener" href="${regionUrl}">${escapeHtml(region.name)} 전체 정보 확인</a><p class="source">경찰청 안전Dream에서 현재 공개 중인 정보를 바탕으로 하며, 공식 기관 제휴·보증 표시는 아닙니다.</p></section></body></html>`;
};

export const buildMissingPersonsRss = (persons: PublicMissingPerson[]): string => {
  const items = persons.slice(0, 50).map((person) => {
    const url = `${PUBLIC_SITE_ORIGIN}/missing/${encodeURIComponent(person.id)}`;
    const updated = person.updatedAt || (person.missingDate ? new Date(person.missingDate) : null);
    const publicDetails = [
      `${formatKoreanDate(person.missingDate)} ${person.address ? `${person.address}에서 실종된` : "실종된"} ${person.name}님(${publicAgeLabel(person)}, ${genderLabel(person.gender)}, ${typeLabel(person.type)})의 경찰청 안전Dream 공식 공개 수색 정보입니다.`,
      `인상착의 및 특징: ${person.clothes || person.description}.`,
      person.height === null ? "" : `공개 신장: ${person.height}cm.`,
      "목격하거나 관련 정보를 알고 계시면 경찰 112 또는 안전Dream 182로 제보해 주세요.",
    ].filter(Boolean).join(" ");
    return `<item><title>${escapeXml(buildMissingPersonTitle(person))}</title><link>${escapeXml(url)}</link><guid isPermaLink="true">${escapeXml(url)}</guid>${updated && !isNaN(updated.getTime()) ? `<pubDate>${updated.toUTCString()}</pubDate>` : ""}<description>${escapeXml(publicDetails)}</description><source url="https://www.safe182.go.kr/">경찰청 안전Dream 공개정보</source></item>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>MissingAlert 최근 공개 수색 정보</title><link>${PUBLIC_SITE_ORIGIN}/missing/recent</link><description>경찰청 안전Dream에서 현재 공개 중인 최근 실종자 정보입니다.</description><language>ko-KR</language>${items}</channel></rss>`;
};

export const buildGuideHtml = (guide: PublicGuide): string => {
  const canonicalUrl = `${PUBLIC_SITE_ORIGIN}/guide/${guide.slug}`;
  const steps = guide.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
  const cautions = guide.cautions.map((caution) => `<li>${escapeHtml(caution)}</li>`).join("");
  const relatedLinks = guide.relatedLinks.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join("");
  const jsonLd = JSON.stringify({"@context": "https://schema.org", "@type": "HowTo", name: guide.heading, description: guide.description, url: canonicalUrl, inLanguage: "ko-KR", dateModified: "2026-08-25", step: guide.steps.map((text, index) => ({"@type": "HowToStep", position: index + 1, text}))}).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(guide.title)}</title><meta name="description" content="${escapeHtml(guide.description)}" /><meta name="robots" content="index,follow,max-snippet:-1" /><link rel="canonical" href="${canonicalUrl}" /><link rel="alternate" type="application/rss+xml" title="MissingAlert 최근 공개 수색 정보" href="${PUBLIC_SITE_ORIGIN}/rss.xml" /><script type="application/ld+json">${jsonLd}</script><style>${baseStyles}ol,ul{padding-left:1.3rem;color:#425168;line-height:1.8}.official{padding:14px;border:1px solid var(--line);border-radius:12px;background:#fff}</style></head><body><main class="wrap"><nav class="brand"><a href="${PUBLIC_SITE_ORIGIN}/">실종자알림</a><span class="status">공식 안내 기반</span></nav><p class="eyebrow">실종 대응 가이드</p><h1>${escapeHtml(guide.heading)}</h1><p class="summary">${escapeHtml(guide.intro)}</p><section><h2>단계별 행동</h2><ol>${steps}</ol></section><section><h2>하지 말아야 할 행동</h2><ul>${cautions}</ul></section><section class="official"><h2>공식 신고·자료 출처</h2><p><a href="tel:112">긴급 신고 112</a> · <a href="tel:182">실종아동찾기센터 182</a> · 문자 제보 <strong>#0182</strong></p><p><a href="https://www.safe182.go.kr/cont/homeLogContents.do?contentsNm=report_info_182" rel="noopener noreferrer">경찰청 안전Dream 신고·처리 안내</a></p><p class="updated">최근 검토일: 2026년 8월 25일</p></section><nav class="related" aria-label="관련 페이지">${relatedLinks}</nav><p class="source">이 가이드는 일반적인 행동 순서를 안내하며, 현장에서는 경찰의 안내를 우선하세요. 사건별 개인정보는 공식 공개 범위 안에서만 확인·공유해야 합니다.</p></main>${buildSearchEntryTrackingScript("guide")}</body></html>`;
};

export const buildGoneHtml = (): string => `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>더 이상 공개되지 않는 실종자 정보</title><meta name="robots" content="noindex,nofollow,noarchive" /></head><body><main><h1>더 이상 공개되지 않는 정보입니다</h1><p>사건이 종결되었거나 공식 출처에서 내려간 정보는 검색 노출 대상에서 즉시 제외합니다.</p><a href="${PUBLIC_SITE_ORIGIN}/">현재 실종자 정보 확인</a></main></body></html>`;

export const buildMissingPersonsSitemap = (persons: PublicMissingPerson[]): string => {
  const urls = persons.map((person) => `<url><loc>${escapeXml(`${PUBLIC_SITE_ORIGIN}/missing/${encodeURIComponent(person.id)}`)}</loc>${person.updatedAt ? `<lastmod>${person.updatedAt.toISOString()}</lastmod>` : ""}</url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
};

export const buildCollectionSitemap = (paths: string[]): string => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${escapeXml(`${PUBLIC_SITE_ORIGIN}${path}`)}</loc></url>`).join("")}</urlset>`;
export const buildSitemapIndex = (paths: string[]): string => `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<sitemap><loc>${escapeXml(`${PUBLIC_SITE_ORIGIN}${path}`)}</loc></sitemap>`).join("")}</sitemapindex>`;
