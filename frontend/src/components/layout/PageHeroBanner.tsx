import React from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

export interface PageHeroBannerProps {
  eyebrow?: string;
  title: string;
  description?: string;
  assurances?: string[];
  action?: React.ReactNode;
}

export default function PageHeroBanner({
  eyebrow = 'MISSING PERSON / PUBLIC SAFETY PORTAL',
  title,
  description,
  assurances = ['운영 검토 정보', '개인정보 최소화'],
  action,
}: PageHeroBannerProps) {
  return (
    <header className="c-page-hero">
      <div className="c-page-hero__content">
        <p className="c-page-hero__eyebrow">{eyebrow}</p>
        <h1 className="c-page-hero__title">{title}</h1>
        {description && <p className="c-page-hero__description">{description}</p>}
      </div>
      <div className="c-page-hero__side">
        <div className="c-page-hero__assurance" aria-label="정보 제공 원칙">
          {assurances.map((label, index) => <span key={label}>{index === 0 ? <ShieldCheck size={15} /> : <CheckCircle2 size={15} />}{label}</span>)}
        </div>
        {action && <div className="c-page-hero__action">{action}</div>}
      </div>
    </header>
  );
}
