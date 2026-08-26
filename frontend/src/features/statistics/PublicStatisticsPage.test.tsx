// @ts-nocheck -- CRA's development compiler does not load Jest globals for colocated tests.
import React from 'react';
import {act} from 'react-dom/test-utils';
import {createRoot, type Root} from 'react-dom/client';
import PublicStatisticsPage from './PublicStatisticsPage';

jest.mock('../../services/analyticsService', () => ({logCustomEvent: jest.fn(), logPublicImpactEvent: jest.fn()}));

describe('PublicStatisticsPage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState({}, '', '/statistics?year=2025&metric=received');
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it('renders the verified seed values and keeps the unresolved caveat', async () => {
    await act(async () => { root.render(<PublicStatisticsPage onOpenCases={jest.fn()} />); await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('125,383');
    expect(container.textContent).toContain('54,569');
    expect(container.textContent).toContain('878');
    expect(container.textContent).toContain('사람 수나 해당 연도 발생 사건의 잔여 건수로 단정하지 않습니다');
    expect(container.querySelector('table')).toBeTruthy();
  });

  it('connects category cards to the current-case route callback', async () => {
    const onOpenCases = jest.fn();
    await act(async () => { root.render(<PublicStatisticsPage onOpenCases={onOpenCases} />); await Promise.resolve(); await Promise.resolve(); });
    const childButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('18세 미만 아동'));
    act(() => childButton?.dispatchEvent(new MouseEvent('click', {bubbles:true})));
    expect(onOpenCases).toHaveBeenCalledWith('children');
  });
});
