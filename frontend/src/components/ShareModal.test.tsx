// @ts-nocheck -- CRA's development compiler does not load Jest globals for colocated tests.
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import ShareModal from './ShareModal';
import { logPublicImpactEvent } from '../services/analyticsService';

jest.mock('../services/analyticsService', () => ({ logPublicImpactEvent: jest.fn() }));

const person = {
  id: 'case-sensitive-id',
  name: '테스트 이름',
  age: 14,
  gender: 'M',
  location: { lat: 35.1, lng: 129.1, address: '부산광역시 부산진구 테스트로 1' },
  description: '테스트 설명',
  missingDate: '2026-08-25',
  type: 'missing_child',
  status: 'active',
  source: 'api',
};

describe('ShareModal public impact analytics', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it('logs the allowlisted context when a share channel is selected', () => {
    act(() => root.render(<ShareModal person={person as any} isOpen onClose={jest.fn()} />));

    const kakaoButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '카카오톡');
    expect(kakaoButton).toBeTruthy();
    act(() => kakaoButton!.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(logPublicImpactEvent).toHaveBeenCalledWith('share_click', {
      case_category: 'child',
      sido_code: '26',
      surface: 'detail',
      route_group: 'map',
      source_agency: 'police',
      share_channel: 'kakao',
    });
    expect(JSON.stringify((logPublicImpactEvent as jest.Mock).mock.calls)).not.toContain(person.id);
    expect(JSON.stringify((logPublicImpactEvent as jest.Mock).mock.calls)).not.toContain(person.name);
    expect(JSON.stringify((logPublicImpactEvent as jest.Mock).mock.calls)).not.toContain(person.location.address);
    expect(container.textContent).toContain('/share/case-sensitive-id');
  });
});
