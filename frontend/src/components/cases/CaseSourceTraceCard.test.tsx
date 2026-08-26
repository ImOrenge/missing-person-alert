// @ts-nocheck -- CRA's development compiler does not load Jest globals for colocated tests.
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import CaseSourceTraceCard from './CaseSourceTraceCard';

describe('CaseSourceTraceCard', () => {
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
  });

  it('shows a safe fallback for legacy cases without trace metadata', () => {
    act(() => root.render(<CaseSourceTraceCard />));
    expect(container.textContent).toContain('출처 확인 중');
    expect(container.textContent).not.toContain('undefined');
  });

  it('shows only public trace fields and an official link', () => {
    act(() => root.render(<CaseSourceTraceCard sourceTrace={{ agency: '경찰청', sourceId: 'safe182_missing_persons', officialUrl: 'https://www.safe182.go.kr/', lastCheckedAt: Date.parse('2026-08-26T00:00:00Z') }} />));
    expect(container.textContent).toContain('경찰청 공개정보');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://www.safe182.go.kr/');
    expect(container.textContent).not.toContain('safe182_missing_persons');
  });
});
