export const PUBLIC_SITE_ORIGIN = "https://missingalert.kr";
export const SHARE_FALLBACK_IMAGE = `${PUBLIC_SITE_ORIGIN}/images/missingalert-share-fallback-v1.png`;

export interface SharePageCase {
  id: string;
  name?: unknown;
  type?: unknown;
  photo?: unknown;
  photos?: unknown;
  location?: unknown;
}

const escapeAttribute = (value: unknown): string => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const escapeText = escapeAttribute;

const safeHttpsUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch (_error) {
    return null;
  }
};

const caseTypeLabel = (value: unknown): string => ({
  missing_child: "실종 아동",
  disabled: "실종 장애인",
  dementia: "실종 치매환자",
  runaway: "실종자",
  facility: "시설 보호 대상자",
  unknown: "실종자",
}[String(value)] || "실종자");

const broadRegion = (location: unknown): string => {
  if (!location || typeof location !== "object") return "";
  const address = (location as Record<string, unknown>).address;
  if (typeof address !== "string") return "";
  return address.trim().replace(/^대한민국\s*/, "").split(/\s+/).slice(0, 2).join(" ");
};

const imageForCase = (item: SharePageCase): string => {
  const photos = Array.isArray(item.photos) ? item.photos : [];
  return safeHttpsUrl(item.photo) || safeHttpsUrl(photos[0]) || SHARE_FALLBACK_IMAGE;
};

export const buildActiveShareHtml = (item: SharePageCase): string => {
  const encodedId = encodeURIComponent(item.id);
  const shareUrl = `${PUBLIC_SITE_ORIGIN}/share/${encodedId}`;
  const canonicalUrl = `${PUBLIC_SITE_ORIGIN}/missing/${encodedId}`;
  const appUrl = `${PUBLIC_SITE_ORIGIN}/map?personId=${encodedId}`;
  const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "공개 수색 대상자";
  const type = caseTypeLabel(item.type);
  const region = broadRegion(item.location);
  const title = `[${type} 찾기] ${name}님의 공개 수색 정보`;
  const description = `${region ? `${region}에서 ` : ""}현재 공개 수색 중인 ${name}님의 경찰청 공개 정보입니다. 사진과 인상착의를 확인하고 목격 시 112 또는 182로 제보해 주세요.`;
  const image = imageForCase(item);

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeText(title)}</title><meta name="description" content="${escapeAttribute(description)}" /><meta name="robots" content="noindex,follow,noarchive" />
<link rel="canonical" href="${escapeAttribute(canonicalUrl)}" /><meta http-equiv="refresh" content="0;url=${escapeAttribute(appUrl)}" />
<meta property="og:type" content="website" /><meta property="og:locale" content="ko_KR" /><meta property="og:site_name" content="MissingAlert" />
<meta property="og:title" content="${escapeAttribute(title)}" /><meta property="og:description" content="${escapeAttribute(description)}" /><meta property="og:image" content="${escapeAttribute(image)}" /><meta property="og:image:alt" content="MissingAlert 공개 수색 정보" /><meta property="og:url" content="${escapeAttribute(shareUrl)}" />
<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${escapeAttribute(title)}" /><meta name="twitter:description" content="${escapeAttribute(description)}" /><meta name="twitter:image" content="${escapeAttribute(image)}" />
<style>:root{font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;color:#10213a;background:#f4f7fa}body{margin:0;display:grid;min-height:100vh;place-items:center}.card{max-width:640px;margin:24px;padding:28px;border:1px solid #dce3ea;border-radius:20px;background:#fff;box-shadow:0 16px 50px rgba(16,33,58,.12)}p{color:#526175;line-height:1.7}a{display:inline-flex;margin-top:12px;border-radius:10px;background:#1e3a5f;color:#fff;font-weight:800;padding:12px 16px;text-decoration:none}</style></head><body><main class="card"><p>경찰청 공개정보 기반</p><h1>${escapeText(title)}</h1><p>${escapeText(description)}</p><a href="${escapeAttribute(appUrl)}">MissingAlert에서 안전하게 확인</a></main></body></html>`;
};

export const buildUnavailableShareHtml = (): string => `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>공개 수색 정보 안내 | MissingAlert</title><meta name="description" content="종결되었거나 공개 범위에서 제외된 사건의 개인 상세정보는 제공하지 않습니다." /><meta name="robots" content="noindex,nofollow,noarchive" /><link rel="canonical" href="${PUBLIC_SITE_ORIGIN}/" /><meta http-equiv="refresh" content="0;url=${PUBLIC_SITE_ORIGIN}/" /><meta property="og:type" content="website" /><meta property="og:site_name" content="MissingAlert" /><meta property="og:title" content="공개 수색 정보 안내" /><meta property="og:description" content="현재 공개 중인 실종자 정보를 MissingAlert에서 확인해 주세요." /><meta property="og:image" content="${SHARE_FALLBACK_IMAGE}" /><meta property="og:url" content="${PUBLIC_SITE_ORIGIN}/" /><meta name="twitter:card" content="summary_large_image" /><style>:root{font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif}main{max-width:620px;margin:80px auto;padding:24px}p{line-height:1.7}a{color:#173554;font-weight:800}</style></head><body><main><h1>더 이상 공개되지 않는 정보입니다</h1><p>사건이 종결되었거나 공식 출처에서 내려간 경우 개인 상세정보를 표시하지 않습니다.</p><a href="${PUBLIC_SITE_ORIGIN}/">현재 공개 수색 정보 확인</a></main></body></html>`;
