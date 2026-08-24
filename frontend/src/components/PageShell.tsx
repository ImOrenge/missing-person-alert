import React from 'react';
import PageHeroBanner from './layout/PageHeroBanner';

interface PageShellProps {
  title: string;
  description?: string;
  eyebrow?: string;
  assurances?: string[];
  action?: React.ReactNode;
  children: React.ReactNode;
}

export default function PageShell({
  title,
  description,
  eyebrow,
  assurances,
  action,
  children,
}: PageShellProps) {
  return (
    <div className="c-portal-shell">
      <main className="c-portal-main">
        <div className="c-portal-main__inner">
          <PageHeroBanner eyebrow={eyebrow} title={title} description={description} assurances={assurances} action={action} />
          <div className="c-portal-content">{children}</div>
          <footer className="c-portal-footer">
            <span>경찰청 공공데이터 기반 공개 정보</span>
            <span className="flex flex-wrap items-center gap-3"><a href="/privacy" className="font-bold underline underline-offset-2">개인정보 처리방침</a><span>긴급신고 112 · 경찰민원 182</span></span>
          </footer>
        </div>
      </main>
    </div>
  );
}
