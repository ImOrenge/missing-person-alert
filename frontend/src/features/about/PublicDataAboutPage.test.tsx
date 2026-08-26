// @ts-nocheck -- CRA's development compiler does not load Jest globals for colocated tests.
import React from 'react';
import {act} from 'react-dom/test-utils';
import {createRoot, type Root} from 'react-dom/client';
import PublicDataAboutPage from './PublicDataAboutPage';

describe('PublicDataAboutPage', () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => {(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
  afterEach(() => {act(()=>root.unmount());container.remove();});

  it('states evidence boundaries without claiming discovery contribution', () => {
    act(()=>root.render(<PublicDataAboutPage onOpenMap={jest.fn()} onOpenStatistics={jest.fn()} onOpenImpact={jest.fn()} />));
    expect(container.textContent).toContain('공식 서비스를 대체');
    expect(container.textContent).toContain('CTA 클릭은 실제 제보 제출이나 발견 기여를 뜻하지 않습니다');
    expect(container.textContent).toContain('Analytics에 개인식별정보를 보내지 않습니다');
    expect(container.textContent).not.toContain('MissingAlert가 발견');
  });
});
