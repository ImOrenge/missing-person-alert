import React from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import type { MissingPersonSourceTrace } from '../../types';
import { logPublicImpactEvent } from '../../services/analyticsService';
import { PUBLIC_IMPACT_EVENT_NAMES } from '../../services/analytics/events';

interface CaseSourceTraceCardProps {
  sourceTrace?: MissingPersonSourceTrace;
  compact?: boolean;
}

const formatVerifiedAt = (value?: number): string => {
  if (!value) return '확인 시각 준비 중';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '확인 시각 준비 중';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function CaseSourceTraceCard({ sourceTrace, compact = false }: CaseSourceTraceCardProps) {
  const verified = Boolean(sourceTrace?.agency && sourceTrace.sourceId !== 'legacy');

  return (
    <aside
      aria-label="공개정보 출처"
      className={`rounded-xl border ${verified ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'} ${compact ? 'p-2.5' : 'p-3'}`}
    >
      <div className="flex items-start gap-2">
        <ShieldCheck size={compact ? 15 : 17} className={verified ? 'mt-0.5 text-emerald-700' : 'mt-0.5 text-amber-700'} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className={`${compact ? 'text-[11px]' : 'text-xs'} font-black ${verified ? 'text-emerald-950' : 'text-amber-950'}`}>
            {verified ? `${sourceTrace!.agency} 공개정보` : '출처 확인 중'}
          </p>
          <p className={`mt-1 ${compact ? 'text-[10px]' : 'text-xs'} leading-5 ${verified ? 'text-emerald-800' : 'text-amber-800'}`}>
            {verified ? `MissingAlert 마지막 확인: ${formatVerifiedAt(sourceTrace?.lastCheckedAt)}` : '레거시 사건의 공개 출처와 확인 시각을 점검하고 있습니다.'}
          </p>
          {verified && sourceTrace?.officialUrl && (
            <a
              href={sourceTrace.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => logPublicImpactEvent(PUBLIC_IMPACT_EVENT_NAMES.OFFICIAL_SOURCE_CLICK, {
                case_category: 'unknown',
                surface: compact ? 'map' : 'detail',
                route_group: compact ? 'map' : 'case',
                source_agency: sourceTrace.agency === '경찰청' || sourceTrace.sourceId.startsWith('safe182') ? 'police' : 'other_public',
              })}
              className={`mt-1.5 inline-flex items-center gap-1 font-bold underline underline-offset-2 ${compact ? 'text-[10px]' : 'text-xs'} text-emerald-900`}
            >
              공식 출처 확인 <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}
