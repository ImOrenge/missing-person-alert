// @ts-nocheck -- CRA's development compiler does not load Jest globals for colocated tests.
import React from 'react';
import {act} from 'react-dom/test-utils';
import {createRoot, type Root} from 'react-dom/client';
import PublicImpactPage from './PublicImpactPage';
import {resetImpactCacheForTests} from './impactService';

jest.mock('../../services/analyticsService',()=>({logPublicImpactEvent:jest.fn()}));
const month={month:'2026-08',events:{caseImpressions:182344,caseViews:27182,mapViews:19420,shareClicks:2310,officialSourceClicks:821,reportCtaClicks:213},estimatedUsers:18542,service:{activeCasesPublishedEndOfMonth:741},rates:{},aggregation:{queryVersion:2,methodologyVersion:1,timezone:'Asia/Seoul'},review:{state:'approved',reviewedAt:'2026-09-03T00:00:00Z'},published:true};

describe('PublicImpactPage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    resetImpactCacheForTests();
    window.history.replaceState({}, '', '/impact');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it('does not fabricate metrics when no month is approved', async () => {
    global.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => ({success: true, items: []})});
    await act(async () => { root.render(<PublicImpactPage onOpenMap={jest.fn()} onOpenStatistics={jest.fn()} />); await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('아직 공개 승인된 Impact 월이 없습니다');
    expect(container.textContent).toContain('검증 전 숫자를 임의로 표시하지 않습니다');
  });

  it('labels event counts as occurrences rather than people', async () => {
    global.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => ({success: true, items: [month]})});
    await act(async () => { root.render(<PublicImpactPage onOpenMap={jest.fn()} onOpenStatistics={jest.fn()} />); await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('182,344회');
    expect(container.textContent).toContain('사람 수가 아닌 정의된 이벤트 발생 횟수');
    expect(container.textContent).not.toContain('182,344명');
    expect(container.querySelector('table')).toBeTruthy();
  });

  it('distinguishes an unavailable API from an approved empty dataset', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    await act(async () => { root.render(<PublicImpactPage onOpenMap={jest.fn()} onOpenStatistics={jest.fn()} />); await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('공익성과를 불러오지 못했습니다');
    expect(container.textContent).not.toContain('아직 공개 승인된 Impact 월이 없습니다');
  });
});
