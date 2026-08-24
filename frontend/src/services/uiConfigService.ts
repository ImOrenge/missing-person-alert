import apiClient from './apiClient';
import { parseUiFeatureFlags } from '../config/uiFeatureFlags';
import type { UiFeatureFlags } from '../config/uiFeatureFlags';

interface UiConfigResponse {
  success: boolean;
  schemaVersion: number;
  flags: unknown;
}

export const fetchUiFeatureFlags = async (signal?: AbortSignal): Promise<UiFeatureFlags> => {
  const response = await apiClient.get<UiConfigResponse>('/api/config/ui', { signal });
  return parseUiFeatureFlags(response.data.flags);
};
