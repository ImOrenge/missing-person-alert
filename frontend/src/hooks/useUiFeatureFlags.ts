import { useEffect, useState } from 'react';
import { DISABLED_UI_FEATURE_FLAGS } from '../config/uiFeatureFlags';
import type { UiFeatureFlags } from '../config/uiFeatureFlags';
import { fetchUiFeatureFlags } from '../services/uiConfigService';

interface UiFeatureFlagState {
  flags: UiFeatureFlags;
  loading: boolean;
  unavailable: boolean;
}

const INITIAL_STATE: UiFeatureFlagState = {
  flags: DISABLED_UI_FEATURE_FLAGS,
  loading: true,
  unavailable: false,
};

export const useUiFeatureFlags = (): UiFeatureFlagState => {
  const [state, setState] = useState<UiFeatureFlagState>(INITIAL_STATE);

  useEffect(() => {
    const controller = new AbortController();
    fetchUiFeatureFlags(controller.signal)
      .then((flags) => setState({ flags, loading: false, unavailable: false }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ flags: DISABLED_UI_FEATURE_FLAGS, loading: false, unavailable: true });
        if (process.env.NODE_ENV === 'development') {
          console.warn('UI 기능 플래그를 불러오지 못해 안전 기본값을 사용합니다.', error);
        }
      });
    return () => controller.abort();
  }, []);

  return state;
};
