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

  const [caseSnapshot, reportSnapshot, newsResult] = await Promise.all([
    wantsCases ? db.collection("missingPersons").where("seoVisible", "==", true).limit(500).get() : Promise.resolve(null),
    wantsReports ? db.collection("publicReports").limit(200).get() : Promise.resolve(null),
    wantsNews ? listNaverNews(db, {limit: 50}) : Promise.resolve(null),
  ]);

  const candidates: PublicSearchItem[] = [];
  caseSnapshot?.docs.forEach((document) => {
    const item = projectOfficialCaseSearchItem(document.id, document.data());
    if (item) candidates.push(item);
  });
  reportSnapshot?.docs.forEach((document) => {
    const item = projectPublicReportSearchItem(document.id, document.data());
    if (item) candidates.push(item);
  });
  newsResult?.items.forEach((article) => {
    const item = projectNewsSearchItem(article as unknown as Record<string, unknown>);
    if (item) candidates.push(item);
  });

  const matched = candidates
    .filter((item) => itemMatches(normalizedQuery, normalizedRegion, item))
    .sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  return {items: matched.slice(0, options.limit), capped: matched.length > options.limit};
};
