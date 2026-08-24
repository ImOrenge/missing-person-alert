// @ts-nocheck -- CRA's development compiler does not load Jest globals for colocated tests.
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import GlobalHeader from './GlobalHeader';

const click = (container: HTMLElement, text: string) => {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(text));
  if (!button) throw new Error(`Button not found: ${text}`);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

describe('GlobalHeader navigation contract', () => {
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

  it('exposes the public report route as a primary active item', () => {
    const onNavigate = jest.fn();
    act(() => root.render(<GlobalHeader activeView="public-reports" currentUser={null} isAdmin={false} onNavigate={onNavigate} onReport={jest.fn()} onLogin={jest.fn()} onLogout={jest.fn()} />));
    const activeItems = Array.from(container.querySelectorAll('[aria-current="page"]'));
    expect(activeItems.some((item) => item.textContent?.includes('사용자 제보'))).toBe(true);
    act(() => click(container, '실종자 지도'));
    expect(onNavigate).toHaveBeenCalledWith('map');
  });

  it('keeps profile, own reports, alerts and admin in the authenticated account menu', () => {
    const user = { uid: 'user-1', displayName: '테스트 사용자', email: 'test@example.com' };
    act(() => root.render(<GlobalHeader activeView="profile" currentUser={user} isAdmin onNavigate={jest.fn()} onReport={jest.fn()} onLogin={jest.fn()} onLogout={jest.fn()} />));
    act(() => click(container, '내 정보'));
    expect(container.textContent).toContain('내 제보');
    expect(container.textContent).toContain('관심 알림');
    expect(container.textContent).toContain('관리자');
    expect(container.querySelector('[aria-haspopup="menu"][aria-expanded="true"]')).not.toBeNull();
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
});
