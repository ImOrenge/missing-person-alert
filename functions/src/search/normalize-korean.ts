const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const CHOSEONG = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

export const normalizeKoreanSearchText = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
};

export const toKoreanInitials = (value: string): string => Array.from(value).map((character) => {
  const code = character.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_LAST) return character;
  return CHOSEONG[Math.floor((code - HANGUL_BASE) / 588)] ?? character;
}).join("");

export const matchesKoreanQuery = (query: string, values: Array<unknown>): boolean => {
  const normalizedQuery = normalizeKoreanSearchText(query);
  if (normalizedQuery.length < 2 && !/^[ㄱ-ㅎ]{2,}$/.test(normalizedQuery)) return false;
  return values.some((value) => {
    const candidate = normalizeKoreanSearchText(value);
    return candidate.includes(normalizedQuery) || toKoreanInitials(candidate).includes(normalizedQuery);
  });
};
