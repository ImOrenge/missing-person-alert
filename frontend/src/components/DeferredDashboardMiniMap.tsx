import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import type { MissingPerson } from '../types';

const DashboardMiniMap = lazy(() => import('./DashboardMiniMap'));

type DeferredDashboardMiniMapProps = {
  persons: MissingPerson[];
  selectedPersonId: string | null;
  onSelectPerson: (personId: string | null) => void;
  onOpenMap: (personId?: string) => void;
};

function MapPlaceholder() {
  return (
    <div
      className="flex h-full min-h-[300px] items-center justify-center rounded-xl border border-slate-200 bg-[#edf3f7] p-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div>
        <MapIcon className="mx-auto text-[#1e3a5f]" size={28} aria-hidden="true" />
        <p className="mt-3 font-bold text-slate-700">지도 미리보기를 준비하고 있습니다.</p>
        <p className="mt-1 text-xs text-slate-500">이 영역이 화면에 보이면 지도를 불러옵니다.</p>
      </div>
    </div>
  );
}

export default function DeferredDashboardMiniMap(props: DeferredDashboardMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(Boolean(props.selectedPersonId));

  useEffect(() => {
    if (shouldLoad || props.selectedPersonId) {
      setShouldLoad(true);
      return undefined;
    }

    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { threshold: 0.01 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [props.selectedPersonId, shouldLoad]);

  return (
    <div ref={containerRef} className="h-full">
      {shouldLoad ? (
        <Suspense fallback={<MapPlaceholder />}>
          <DashboardMiniMap {...props} />
        </Suspense>
      ) : (
        <MapPlaceholder />
      )}
    </div>
  );
}
