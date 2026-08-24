import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PrivacyPolicyPage from './PrivacyPolicyPage';

describe('PrivacyPolicyPage public content contract', () => {
  it('publishes report, notification, retention, overseas-processing and rights information', () => {
    const html = renderToStaticMarkup(<PrivacyPolicyPage />);
    expect(html).toContain('개인정보 처리방침');
    expect(html).toContain('실종 관련 제보');
    expect(html).toContain('기기 알림 토큰');
    expect(html).toContain('30일');
    expect(html).toContain('90일');
    expect(html).toContain('국외 처리');
    expect(html).toContain('열람·정정·삭제·처리정지');
    expect(html).toContain('mailto:jmgi1024@gmail.com');
  });
});
