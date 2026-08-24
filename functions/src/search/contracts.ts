export type PublicSearchKind = "case" | "report" | "news";
export type PublicSearchTab = "all" | "cases" | "reports" | "news";

export interface PublicSearchItem {
  id: string;
  kind: PublicSearchKind;
  title: string;
  summary: string;
  regionLabel?: string;
  thumbnailUrl?: string;
  statusLabel?: string;
  sourceLabel: string;
  publishedAt?: string;
  href: string;
}

export interface PublicSearchResponse {
  success: true;
  provider: "firestore-fallback" | "algolia";
  items: PublicSearchItem[];
  total: number;
  capped: boolean;
}

export type PublicSearchProvider = PublicSearchResponse["provider"];

export const PUBLIC_SEARCH_ITEM_KEYS: Array<keyof PublicSearchItem> = [
  "id", "kind", "title", "summary", "regionLabel", "thumbnailUrl",
  "statusLabel", "sourceLabel", "publishedAt", "href",
];

export const FORBIDDEN_PUBLIC_SEARCH_KEYS = [
  "lat", "lng", "latitude", "longitude", "exactLocation", "contact",
  "phone", "email", "rawText", "reportedBy", "actorUid", "moderationNotes",
] as const;
