import React from 'react';

interface Props {
  id: string;
  label: string;
  moduleId: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function DashboardSectionSurface({ id, label, moduleId, children, className = '', style }: Props) {
  return (
    <section
      id={id}
      data-dashboard-section={moduleId}
      data-dashboard-module={moduleId}
      aria-label={label}
      style={style}
      className={`scroll-mt-32 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </section>
  );
}
