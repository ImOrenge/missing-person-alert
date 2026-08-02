import React from 'react';
import AppSidebar, { type AppSection } from './AppSidebar';

interface PageShellProps {
  activeSection: AppSection;
  currentUser: boolean;
  isAdmin: boolean;
  title: string;
  description?: string;
  onNavigate: (section: AppSection) => void;
  onLogin: () => void;
  children: React.ReactNode;
}

export default function PageShell({
  activeSection,
  currentUser,
  isAdmin,
  title,
  description,
  onNavigate,
  onLogin,
  children,
}: PageShellProps) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-slate-50">
      <AppSidebar
        activeSection={activeSection}
        currentUser={currentUser}
        isAdmin={isAdmin}
        onNavigate={onNavigate}
        onLogin={onLogin}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <header className="mb-5 border-b border-slate-200 pb-5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d94841]">MISSING PERSON / PORTAL</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
            {description && <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
