import * as admin from "firebase-admin";
import {Express, Request, Response} from "express";

export const UI_FEATURE_FLAG_NAMES = [
  "emergency_banner_v2_enabled",
  "dashboard_v2_enabled",
  "mobile_nav_v2_enabled",
  "unified_search_enabled",
  "unified_explorer_enabled",
  "reports_map_layer_enabled",
  "case_detail_v2_enabled",
  "reporting_flow_v2_enabled",
  "reports_submission_enabled",
  "reports_media_enabled",
  "reports_admin_enabled",
  "reports_public_timeline_enabled",
  "dashboard_personalization_enabled",
  "admin_banner_v2_enabled",
  "case_source_trace_enabled",
  "public_statistics_enabled",
  "public_impact_enabled",
  "public_data_admin_enabled",
] as const;

export type UiFeatureFlagName = typeof UI_FEATURE_FLAG_NAMES[number];
export type UiFeatureFlags = Record<UiFeatureFlagName, boolean>;

export const REPORTING_FEATURE_FLAG_NAMES = [
  "reports_submission_enabled",
  "reports_media_enabled",
  "reports_admin_enabled",
  "reports_public_timeline_enabled",
  "reports_map_layer_enabled",
  "reports_notifications_enabled",
  "reports_public_indexing_enabled",
] as const;

export type ReportingFeatureFlagName = typeof REPORTING_FEATURE_FLAG_NAMES[number];
export type ReportingFeatureFlags = Record<ReportingFeatureFlagName, boolean>;

export const SEARCH_FEATURE_FLAG_NAMES = [
  "algolia_indexing_enabled",
  "algolia_search_enabled",
] as const;
export type SearchFeatureFlagName = typeof SEARCH_FEATURE_FLAG_NAMES[number];
export type SearchFeatureFlags = Record<SearchFeatureFlagName, boolean>;

const DISABLED_FLAGS: UiFeatureFlags = UI_FEATURE_FLAG_NAMES.reduce((flags, name) => {
  flags[name] = false;
  return flags;
}, {} as UiFeatureFlags);

export const DISABLED_REPORTING_FEATURE_FLAGS: ReportingFeatureFlags =
  REPORTING_FEATURE_FLAG_NAMES.reduce((flags, name) => {
    flags[name] = false;
    return flags;
  }, {} as ReportingFeatureFlags);

export const DISABLED_SEARCH_FEATURE_FLAGS: SearchFeatureFlags = {
  algolia_indexing_enabled: false,
  algolia_search_enabled: false,
};

let cachedSource: Record<string, unknown> | null = null;
let cacheExpiresAt = 0;

const readBooleanFlag = (source: Record<string, unknown>, name: string): boolean =>
  source[name] === true;

const loadRuntimeConfigSource = async (
  db: admin.firestore.Firestore,
  now: number,
): Promise<Record<string, unknown>> => {
  if (cachedSource && cacheExpiresAt > now) return {...cachedSource};
  const snapshot = await db.collection("runtimeConfig").doc("reporting").get();
  const data = snapshot.exists ? snapshot.data() ?? {} : {};
  const nestedFlags = data.flags && typeof data.flags === "object" ? data.flags as Record<string, unknown> : {};
  cachedSource = {...data, ...nestedFlags};
  cacheExpiresAt = now + 60_000;
  return {...cachedSource};
};

export const loadUiFeatureFlags = async (
  db: admin.firestore.Firestore,
  now = Date.now(),
): Promise<UiFeatureFlags> => {
  if (process.env.REPORTING_V2_DISABLED === "true") return {...DISABLED_FLAGS};
  const source = await loadRuntimeConfigSource(db, now);
  return UI_FEATURE_FLAG_NAMES.reduce((flags, name) => {
    flags[name] = readBooleanFlag(source, name);
    return flags;
  }, {} as UiFeatureFlags);
};

export const loadReportingFeatureFlags = async (
  db: admin.firestore.Firestore,
  now = Date.now(),
): Promise<ReportingFeatureFlags> => {
  if (process.env.REPORTING_V2_DISABLED === "true") return {...DISABLED_REPORTING_FEATURE_FLAGS};
  const source = await loadRuntimeConfigSource(db, now);
  return REPORTING_FEATURE_FLAG_NAMES.reduce((flags, name) => {
    flags[name] = readBooleanFlag(source, name);
    return flags;
  }, {} as ReportingFeatureFlags);
};

export const loadSearchFeatureFlags = async (
  db: admin.firestore.Firestore,
  now = Date.now(),
): Promise<SearchFeatureFlags> => {
  if (process.env.REPORTING_V2_DISABLED === "true") return {...DISABLED_SEARCH_FEATURE_FLAGS};
  const source = await loadRuntimeConfigSource(db, now);
  return {
    algolia_indexing_enabled: readBooleanFlag(source, "algolia_indexing_enabled"),
    algolia_search_enabled: readBooleanFlag(source, "algolia_search_enabled"),
  };
};

export const registerPublicRuntimeConfigRoute = (
  app: Express,
  db: admin.firestore.Firestore,
): void => {
  app.get("/api/config/ui", async (_req: Request, res: Response) => {
    try {
      const flags = await loadUiFeatureFlags(db);
      res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
      res.json({success: true, schemaVersion: 1, flags});
    } catch (_error) {
      res.set("Cache-Control", "no-store");
      res.status(503).json({success: false, schemaVersion: 1, flags: DISABLED_FLAGS});
    }
  });
};
