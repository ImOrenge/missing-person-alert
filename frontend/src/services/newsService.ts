import apiClient from './apiClient';
import type { CaseNewsSearchRequest, NewsListRequest, NewsListResponse } from '../types/news';

export async function fetchNewsList(request: NewsListRequest = {}): Promise<NewsListResponse> {
  const response = await apiClient.get<NewsListResponse>('/api/news', {
    params: {
      limit: request.limit,
      cursor: request.cursor,
      from: request.from,
      to: request.to,
    },
  });
  return response.data;
}

export async function fetchCaseNewsSearch(request: CaseNewsSearchRequest): Promise<NewsListResponse> {
  const response = await apiClient.get<NewsListResponse>(`/api/missing-persons/${encodeURIComponent(request.caseId)}/news-search`, {
    params: {
      limit: request.limit,
      cursor: request.cursor,
    },
  });
  return response.data;
}
