// @ts-nocheck -- CRA's development compiler does not load Jest globals for colocated tests.
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import PublicReportsPage from './PublicReportsPage';
import { fetchPublicReportFeed } from '../../services/exploreService';

jest.mock('../../services/exploreService', () => ({ fetchPublicReportFeed: jest.fn() }));

const reports = [
  { id: 'report-approved', kind: 'report', caseId: 'case-1', reportType: 'sighting', occurredAt: '2026-08-24T01:00:00.000Z', publicDescription: '파란 외투를 입은 사람을 보았습니다.', publicLocationText: '서울특별시 중구', publicLocation: { lat: 37.5, lng: 127 }, publicRadiusM: 500, publicStatus: 'approved', sourceLabel: '사용자 제보 · 운영 검토 완료', href: '/missing/case-1#public-report-report-approved' },
  { id: 'report-confirmed', kind: 'report', caseId: '', reportType: 'new_case_lead', occurredAt: '2026-08-23T01:00:00.000Z', publicDescription: '버스 정류장 방향 이동을 기관이 확인했습니다.', publicLocationText: '부산광역시 해운대구', publicLocation: { lat: 35.1, lng: 129 }, publicRadiusM: 1000, publicStatus: 'confirmed', sourceLabel: '사용자 제보 · 관계기관 확인', href: '/map?publicReportId=report-confirmed' },
];

const change = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  Object.getOwnPropertyDescriptor(element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('PublicReportsPage safe public feed', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    (fetchPublicReportFeed as jest.Mock).mockResolvedValue({ items: reports, total: 2, capped: false });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it('renders only the sanitized DTO fields and opens the selected report on the map', async () => {
    const onOpenMap = jest.fn();
    await act(async () => {
      root.render(<PublicReportsPage enabled onOpenMap={onOpenMap} onStartReport={jest.fn()} />);
      await Promise.resolve();
    });
    expect(container.textContent).toContain('파란 외투를 입은 사람을 보았습니다.');
    expect(container.textContent).toContain('약 500m 안전 반경');
    expect(container.textContent).not.toContain('연락처');
    const mapButton = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes('지도에서 보기'))!;
    act(() => mapButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onOpenMap).toHaveBeenCalledWith('report-approved');
  });

  it('filters the loaded public feed by status and region', async () => {
    await act(async () => {
      root.render(<PublicReportsPage enabled onOpenMap={jest.fn()} onStartReport={jest.fn()} />);
      await Promise.resolve();
    });
    const selects = container.querySelectorAll('select');
    act(() => change(selects[0], 'confirmed'));
    expect(container.textContent).not.toContain('파란 외투를 입은 사람을 보았습니다.');
    expect(container.textContent).toContain('기관이 확인했습니다.');
    act(() => change(selects[1], '서울특별시'));
    expect(container.textContent).toContain('조건에 맞는 공개 제보가 없습니다');
  });
});
