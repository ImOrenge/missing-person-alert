export const UI_FEATURE_FLAG_NAMES = [
  'emergency_banner_v2_enabled',
  'dashboard_v2_enabled',
  'mobile_nav_v2_enabled',
  'unified_search_enabled',
  'unified_explorer_enabled',
  'reports_map_layer_enabled',
  'case_detail_v2_enabled',
  'reporting_flow_v2_enabled',
  'reports_submission_enabled',
  'reports_media_enabled',
  'reports_admin_enabled',
  'reports_public_timeline_enabled',
  'dashboard_personalization_enabled',
  'admin_banner_v2_enabled',
  'case_source_trace_enabled',
  'public_statistics_enabled',
  'public_impact_enabled',
  'public_data_admin_enabled',
] as const;

export type UiFeatureFlagName = typeof UI_FEATURE_FLAG_NAMES[number];
export type UiFeatureFlags = Record<UiFeatureFlagName, boolean>;

export const DISABLED_UI_FEATURE_FLAGS: UiFeatureFlags = Object.freeze(
  UI_FEATURE_FLAG_NAMES.reduce((flags, name) => {
    flags[name] = false;
    return flags;
  }, {} as UiFeatureFlags)
);

export const parseUiFeatureFlags = (value: unknown): UiFeatureFlags => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return UI_FEATURE_FLAG_NAMES.reduce((flags, name) => {
    flags[name] = source[name] === true;
    return flags;
  }, {} as UiFeatureFlags);
};
