import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import type { BannerDto } from '../../types/banner';

interface EmergencySiteAlertProps {
  announcement: BannerDto;
}

const DISMISSAL_PREFIX = 'emergency_site_alert_dismissed_v1:';

const getRevision = (announcement: BannerDto) =>
  Number.isInteger(announcement.revision) && (announcement.revision ?? 0) > 0 ? announcement.revision! : 1;

export default function EmergencySiteAlert({ announcement }: EmergencySiteAlertProps) {
  const revision = getRevision(announcement);
  const dismissalKey = useMemo(
    () => `${DISMISSAL_PREFIX}${announcement.id}:${revision}`,
    [announcement.id, revision]
  );
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined' || announcement.dismissible !== true) return false;
    return window.localStorage.getItem(dismissalKey) === '1';
  });
  const [announceRevision, setAnnounceRevision] = useState(true);

  useEffect(() => {
    setDismissed(
      typeof window !== 'undefined' &&
      announcement.dismissible === true &&
      window.localStorage.getItem(dismissalKey) === '1'
    );
    setAnnounceRevision(true);
    const timer = window.setTimeout(() => setAnnounceRevision(false), 1500);
    return () => window.clearTimeout(timer);
  }, [announcement.dismissible, dismissalKey]);

  if (dismissed) return null;

  const dismiss = () => {
    if (announcement.dismissible !== true) return;
    window.localStorage.setItem(dismissalKey, '1');
    setDismissed(true);
  };

  return (
    <section
      className="relative z-[70] border-b border-red-950/20 bg-red-800 px-4 py-3 text-white shadow-sm"
      role={announceRevision ? 'alert' : 'region'}
      aria-live={announceRevision ? 'assertive' : 'off'}
      aria-label="긴급 안전 알림"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3">
        <AlertTriangle className="mt-0.5 flex-none text-amber-200" size={20} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <strong className="text-sm font-black">{announcement.title || '긴급 안전 알림'}</strong>
            <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold">
              {announcement.sourceLabel || '운영 공지'}
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-red-50">{announcement.summary}</p>
        </div>
        {announcement.action?.href && (
          <a
            href={announcement.action.href}
            className="hidden flex-none items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-black text-red-800 hover:bg-red-50 sm:flex"
          >
            {announcement.action.label} <ArrowRight size={14} aria-hidden="true" />
          </a>
        )}
        {announcement.dismissible === true && (
          <button type="button" onClick={dismiss} className="flex-none rounded-lg p-1.5 hover:bg-white/15" aria-label="긴급 알림 닫기">
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      {announcement.action?.href && (
        <a href={announcement.action.href} className="mx-auto mt-2 flex max-w-7xl items-center gap-1 text-xs font-black underline underline-offset-2 sm:hidden">
          {announcement.action.label} <ArrowRight size={13} aria-hidden="true" />
        </a>
      )}
    </section>
  );
}
