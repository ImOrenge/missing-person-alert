import { DISABLED_UI_FEATURE_FLAGS, parseUiFeatureFlags } from './uiFeatureFlags';

describe('UI feature flag safety contract', () => {
  it('defaults every new feature to disabled', () => {
    expect(Object.values(DISABLED_UI_FEATURE_FLAGS).every((enabled) => enabled === false)).toBe(true);
  });

  it('accepts only literal true values', () => {
    const flags = parseUiFeatureFlags({ unified_search_enabled: true, unified_explorer_enabled: 'true', reporting_flow_v2_enabled: 1 });
    expect(flags.unified_search_enabled).toBe(true);
    expect(flags.unified_explorer_enabled).toBe(false);
    expect(flags.reporting_flow_v2_enabled).toBe(false);
  });
});
