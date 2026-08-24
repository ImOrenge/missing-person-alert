import apiClient from './apiClient';
import type { PublicSearchResponse, PublicSearchState } from '../types/search';

export const searchPublicRecords = async (state: PublicSearchState, signal?: AbortSignal): Promise<PublicSearchResponse> => {
  const response = await apiClient.post<PublicSearchResponse>('/api/search/query', {
    q: state.q,
    tab: state.tab,
    filters: { region: state.region || undefined },
    limit: 30,
  }, {
    signal,
  });
  return response.data;
};

export const fetchSearchSuggestions = async (q: string, signal?: AbortSignal) => {
  const response = await apiClient.post<{ success: true; suggestions: Array<{ id: string; kind: string; label: string; regionLabel?: string; href: string }> }>('/api/search/suggestions', { q, scope: 'cases', limit: 8 }, { signal });
  return response.data.suggestions;
};
