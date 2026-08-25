// @ts-nocheck -- CRA's development compiler does not load Jest globals for colocated tests.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SeoMetricsTab from './SeoMetricsTab';
import { getSeoMetrics } from '../../../services/seoMetricsService';

jest.mock('../../../services/seoMetricsService', () => ({
  getSeoMetrics: jest.fn(),
}));

const response = {
  success: true,
  summary: {
    rangeDays: 28,
    startDate: '2026-07-28',
    endDate: '2026-08-24',
    totals: {
      detailViews: 100, mapClicks: 12, reportStarts: 2, shares: 4, calls112: 1, calls182: 3,
      returnVisits: 7, searchEntries: 100, detailStarts: 45,
      sourceEntries: { google: 60, naver: 30, bing: 5, daum: 5, direct: 0, other: 0 },
      pageGroupEntries: { home: 35, nationwide: 10, region: 15, type: 10, recent: 10, statistics: 8, guide: 7, detail: 5, other: 0 },
    },
    rates: { mapViewRate: 12, shareRate: 4, reportStartRate: 2, callRate: 4, searchToDetailRate: 45, returnVisitRate: 7, homeSearchShare: 35, expansionSearchShare: 35 },
    daily: [{
      date: '2026-08-24', detailViews: 100, mapClicks: 12, reportStarts: 2, shares: 4,
      calls112: 1, calls182: 3, returnVisits: 7, searchEntries: 100, detailStarts: 45,
      sourceEntries: { google: 60, naver: 30, bing: 5, daum: 5, direct: 0, other: 0 },
      pageGroupEntries: { home: 35, nationwide: 10, region: 15, type: 10, recent: 10, statistics: 8, guide: 7, detail: 5, other: 0 },
    }],
  },
  sourceBuckets: ['google', 'naver', 'bing', 'daum', 'direct', 'other'],
  pageGroupBuckets: ['home', 'nationwide', 'region', 'type', 'recent', 'statistics', 'guide', 'detail', 'other'],
  generatedAt: '2026-08-24T00:00:00.000Z',
  measurementNote: '채널 버킷만 저장합니다.',
};

describe('SeoMetricsTab', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (getSeoMetrics as jest.Mock).mockResolvedValue(response);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it('renders aggregate funnel counts, rates, and source buckets', async () => {
    await act(async () => {
      root.render(<SeoMetricsTab />);
      await Promise.resolve();
    });

    expect(getSeoMetrics).toHaveBeenCalledWith(28, expect.any(AbortSignal));
    expect(container.textContent).toContain('검색 유입 전환 대시보드');
    expect(container.textContent).toContain('2026년 8월 24일 21:44(KST)');
    expect(container.textContent).toContain('45.0%');
    expect(container.textContent).toContain('Google');
    expect(container.textContent).toContain('60건');
    expect(container.textContent).toContain('재방문 신호');
    expect(container.textContent).toContain('홈 35.0%');
    expect(container.textContent).toContain('확장 허브 35.0%');
    expect(container.querySelector('table caption')?.textContent).toContain('날짜별 검색 랜딩');
  });

  it('loads the selected range', async () => {
    await act(async () => {
      root.render(<SeoMetricsTab />);
      await Promise.resolve();
    });
    const sevenDayButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '최근 7일');
    await act(async () => {
      sevenDayButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(getSeoMetrics).toHaveBeenLastCalledWith(7, expect.any(AbortSignal));
    expect(sevenDayButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows an accessible error and retries', async () => {
    (getSeoMetrics as jest.Mock).mockRejectedValueOnce({ response: { data: { error: 'SEO_METRICS_READ_FAILED' } } });
    await act(async () => {
      root.render(<SeoMetricsTab />);
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('SEO_METRICS_READ_FAILED');

    (getSeoMetrics as jest.Mock).mockResolvedValueOnce(response);
    const retryButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '다시 시도');
    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(getSeoMetrics).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('자연검색 랜딩');
  });
});
