// @ts-nocheck -- CRA's development compiler does not load Jest globals for colocated tests.
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import ReportsModerationV2 from './ReportsModerationV2';
import { getAdminReportDetail, listAdminReportQueue } from '../../../services/adminReportingService';

jest.mock('../../../services/adminReportingService', () => ({
  approvePublicReport: jest.fn(), approveReportMedia: jest.fn(), archiveReport: jest.fn(), confirmReport: jest.fn(),
  decryptReportContact: jest.fn(), forwardReportToAgency: jest.fn(), getAdminReportDetail: jest.fn(),
  listAdminReportQueue: jest.fn(), markReportDuplicate: jest.fn(), rejectReport: jest.fn(),
  requestReportInformation: jest.fn(), startReportReview: jest.fn(), unpublishReport: jest.fn(),
}));

const roles = {
  reportModerator: true, seniorModerator: true, agencyOperator: false, privacyOfficer: false, systemAdmin: false,
};

const queueItem = {
  reportId: 'report-12345678', receiptNumber: 'MA-20260823-001', caseId: 'case-1', reportType: 'sighting',
  occurredAt: '2026-08-23T01:00:00.000Z', status: 'submitted', version: 1, hasMedia: false, locationLabel: '서울 중구',
};

const detail = {
  ...queueItem,
  exactLocation: { address: '서울특별시 중구 테스트로', lat: 37.56, lng: 126.98 },
  rawText: '파란색 외투를 입고 지하철역 방향으로 이동하는 모습을 확인했습니다.',
  mediaIds: [], media: [], visibility: 'private', additionalInformation: [],
};

describe('ReportsModerationV2 decision flow', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (listAdminReportQueue as jest.Mock).mockResolvedValue([queueItem]);
    (getAdminReportDetail as jest.Mock).mockResolvedValue(detail);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it('shows review order and only the chosen decision form', async () => {
    await act(async () => {
      root.render(<ReportsModerationV2 roles={roles} adminEnabled publicApprovalEnabled={false} />);
      await Promise.resolve();
    });
    expect(container.textContent).toContain('접수 내용 확인');
    expect(container.textContent).toContain('보호정보 점검');
    expect(container.textContent).toContain('처리 결정');

    const reportButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('MA-20260823-001'));
    expect(reportButton).toBeDefined();
    await act(async () => {
      reportButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain('공개 기능이 운영 승인 전이라');
    expect(container.textContent).toContain('추가정보 요청 보내기');
    expect(container.textContent).not.toContain('전체 제보 공개 승인');

    const duplicateButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('중복 통합'));
    act(() => duplicateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('대표 제보 ID');
    expect(container.textContent).not.toContain('추가정보 요청 보내기');
  });

  it('clears stale detail and error state across failed and successful detail requests', async () => {
    await act(async () => {
      root.render(<ReportsModerationV2 roles={roles} adminEnabled publicApprovalEnabled />);
      await Promise.resolve();
    });
    const reportButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('MA-20260823-001'));

    await act(async () => {
      reportButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain(detail.rawText);

    (getAdminReportDetail as jest.Mock).mockRejectedValueOnce({ response: { data: { error: 'DETAIL_TEMPORARILY_UNAVAILABLE' } } });
    await act(async () => {
      reportButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain('DETAIL_TEMPORARILY_UNAVAILABLE');
    expect(container.textContent).not.toContain(detail.rawText);

    (getAdminReportDetail as jest.Mock).mockResolvedValueOnce(detail);
    const retryButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('MA-20260823-001'));
    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain(detail.rawText);
    expect(container.textContent).not.toContain('DETAIL_TEMPORARILY_UNAVAILABLE');
  });

  it('shows a safe date fallback and full approved location text without a summary editor', async () => {
    (listAdminReportQueue as jest.Mock).mockResolvedValue([{ ...queueItem, occurredAt: 'not-a-date' }]);
    (getAdminReportDetail as jest.Mock).mockResolvedValue({ ...detail, occurredAt: 'not-a-date' });
    await act(async () => {
      root.render(<ReportsModerationV2 roles={roles} adminEnabled publicApprovalEnabled />);
      await Promise.resolve();
    });
    expect(container.textContent).toContain('일시 정보 없음');
    expect(container.textContent).not.toContain('Invalid Date');

    const reportButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('MA-20260823-001'));
    await act(async () => {
      reportButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain(detail.locationLabel);
    const approveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('공개 승인'));
    act(() => approveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('별도의 축약문을 작성하지 않습니다');
    expect(container.querySelector('textarea[aria-label="공개 제보 내용"]')).toBeNull();
  });
});
