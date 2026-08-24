// @ts-nocheck -- CRA's development compiler does not load Jest globals for colocated tests.
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import ReportWizard from './ReportWizard';

jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'test-user' } }) }));
jest.mock('../../utils/recaptcha', () => ({ loadRecaptchaScript: jest.fn(), executeRecaptcha: jest.fn() }));
jest.mock('../../services/reportingService', () => ({ createReportV2: jest.fn() }));
jest.mock('../../services/reportMediaService', () => ({
  uploadReportMediaDrafts: jest.fn(), validateReportMedia: jest.fn(), waitForReportMediaDrafts: jest.fn(),
}));
jest.mock('./ReportLocationPicker', () => ({ onChange }: any) => <button type="button" onClick={() => onChange({ address: '서울특별시 중구 테스트로', lat: 37.56, lng: 126.98 })}>테스트 위치 선택</button>);

const clickButton = (container: HTMLElement, text: string) => {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(text));
  if (!button) throw new Error(`Button not found: ${text}`);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

describe('ReportWizard information flow', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as any).crypto = {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.forEach((_, index) => { bytes[index] = (index * 17 + 11) % 256; });
        return bytes;
      },
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('uses four understandable steps and reaches a private review summary', () => {
    act(() => root.render(<ReportWizard onComplete={jest.fn()} mediaEnabled={false} submissionEnabled />));
    expect(container.textContent).toContain('1 / 4');
    expect(container.textContent).toContain('대상 선택');

    act(() => clickButton(container, '다음: 목격 정보'));
    act(() => clickButton(container, '테스트 위치 선택'));
    act(() => clickButton(container, '다음: 내용·연락'));
    expect(container.textContent).toContain('사진 첨부는 현재 준비 중입니다');

    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setValue?.call(textarea, '파란색 외투를 입고 지하철역 방향으로 이동하는 모습을 직접 확인했습니다.');
      textarea?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => clickButton(container, '다음: 검토·제출'));

    expect(container.textContent).toContain('비공개 접수 내용을 확인하고 제출합니다.');
    expect(container.textContent).toContain('비공개로 제보 제출');
    expect(container.textContent).toContain('공개 승인 후에는 제보 본문과 주소 문구가 전체 공개되며, 연락처·계정 식별자·정확 좌표는 공개되지 않습니다.');
  });
});
