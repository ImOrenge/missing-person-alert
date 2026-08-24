// @ts-nocheck -- CRA's development compiler does not load Jest globals for colocated tests.
import React from 'react';
import {act} from 'react-dom/test-utils';
import {createRoot, type Root} from 'react-dom/client';
import OwnReportsPage from './OwnReportsPage';
import {getOwnReportDetailV2, listOwnReportsV2} from '../../services/reportingService';

jest.mock('../../services/reportingService', () => ({
  getOwnReportDetailV2: jest.fn(),
  listOwnReportsV2: jest.fn(),
  submitAdditionalReportInformation: jest.fn(),
  withdrawOwnReportV2: jest.fn(),
}));

const report = {
  reportId: 'report-12345678', receiptNumber: 'MA-20260823-001', caseId: 'case-1', reportType: 'sighting',
  occurredAt: '2026-08-23T01:00:00.000Z', locationLabel: '서울특별시 중구', displayStatus: '접수 완료',
  version: 1, createdAt: '2026-08-23T01:01:00.000Z', updatedAt: '2026-08-23T01:02:00.000Z', needsInformation: false,
};

const click = (container: HTMLElement, text: string) => {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(text));
  if (!button) throw new Error(`Button not found: ${text}`);
  button.dispatchEvent(new MouseEvent('click', {bubbles: true}));
};

describe('OwnReportsPage detail disclosure', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    (listOwnReportsV2 as jest.Mock).mockResolvedValue([report]);
    (getOwnReportDetailV2 as jest.Mock).mockResolvedValue({...report, description: '파란색 외투를 입고 역 방향으로 이동했습니다.', mediaCount: 2});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it('loads and reveals the owner-scoped detail when the user opens a report', async () => {
    await act(async () => {
      root.render(<OwnReportsPage />);
      await Promise.resolve();
    });
    expect(container.textContent).toContain('MA-20260823-001');

    await act(async () => {
      click(container, '제보 상세 보기');
      await Promise.resolve();
    });

    expect(getOwnReportDetailV2).toHaveBeenCalledWith('report-12345678', expect.any(AbortSignal));
    expect(container.textContent).toContain('파란색 외투를 입고 역 방향으로 이동했습니다.');
    expect(container.textContent).toContain('첨부 사진2건');
    expect(container.querySelector('[aria-expanded="true"]')).not.toBeNull();
  });
});
