import axios from "axios";
import {AlgoliaConfig, algoliaIndexName, normalizeAlgoliaConfig, sanitizeAlgoliaHit} from "./algolia-client";
import {PUBLIC_SEARCH_ITEM_KEYS, PublicSearchItem, PublicSearchKind} from "./contracts";
import {
  projectNewsSearchItem,
  projectOfficialCaseSearchItem,
  projectPublicReportSearchItem,
} from "./project-public-record";

export type AlgoliaIndexAction =
  | {action: "upsert"; kind: PublicSearchKind; objectID: string; body: Record<string, unknown>}
  | {action: "delete"; kind: PublicSearchKind; objectID: string};

const projectItem = (
  kind: PublicSearchKind,
  id: string,
  data: Record<string, unknown> | undefined,
  includeReports: boolean,
): PublicSearchItem | null => {
  if (!data) return null;
  if (kind === "case") return projectOfficialCaseSearchItem(id, data);
  if (kind === "report") return includeReports ? projectPublicReportSearchItem(id, data) : null;
  return projectNewsSearchItem({...data, id: data.id || id});
};

export const buildAlgoliaIndexAction = (
  kind: PublicSearchKind,
  id: string,
  data: Record<string, unknown> | undefined,
  includeReports = false,
): AlgoliaIndexAction => {
  const item = projectItem(kind, id, data, includeReports);
  if (!item) return {action: "delete", kind, objectID: id};
  const sanitized = sanitizeAlgoliaHit({...item, objectID: item.id});
  if (!sanitized) return {action: "delete", kind, objectID: id};
  const body: Record<string, unknown> = {objectID: sanitized.id};
  for (const key of PUBLIC_SEARCH_ITEM_KEYS) {
    const value = sanitized[key];
    if (value !== undefined) body[key] = value;
  }
  return {action: "upsert", kind, objectID: sanitized.id, body};
};

export const applyAlgoliaIndexAction = async (
  rawConfig: Partial<AlgoliaConfig>,
  action: AlgoliaIndexAction,
): Promise<void> => {
  const config = normalizeAlgoliaConfig(rawConfig);
  if (!config) throw new Error("ALGOLIA_CONFIG_UNAVAILABLE");
  const indexName = encodeURIComponent(algoliaIndexName(config.indexPrefix, action.kind));
  const request = action.action === "upsert" ?
    {action: "updateObject", body: action.body} :
    {action: "deleteObject", body: {objectID: action.objectID}};
  await axios.post(`https://${config.applicationId}.algolia.net/1/indexes/${indexName}/batch`, {
    requests: [request],
  }, {
    timeout: 5000,
    headers: {
      "X-Algolia-Application-Id": config.applicationId,
      "X-Algolia-API-Key": config.apiKey,
      "Content-Type": "application/json",
    },
  });
};
