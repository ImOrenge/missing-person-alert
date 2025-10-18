import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AggregatedRegionStats } from '../../hooks/useRegionStatsData';
import type { RegionMetadataDocument } from '../../types/regionStats';
import { buildRegionIntensityMap } from './minimap/intensity';
import { matchRegionShape, type RegionShapeEntry } from './minimap/regionMap';

export interface MinimapHeatmapProps {
  metadata: RegionMetadataDocument | null;
  regions: AggregatedRegionStats[];
  selectedRegionId: string | null;
  onSelect: (regionId: string) => void;
  reduceMotion?: boolean;
}

const SILHOUETTE_URL = `${process.env.PUBLIC_URL || ''}/maps/korea-silhouette.svg`;
const BASE_REGION_FILL = '#e2e8f0';
const BUCKET_FILLS = ['#ffffff', '#fff7cc', '#fdba74', '#f97316', '#dc2626'] as const;
const REGION_STROKE_COLOR = '#ffffff';
const REGION_STROKE_WIDTH = '0.6';
const NUMBER_FORMATTER = new Intl.NumberFormat('ko-KR');
const PERCENT_FORMATTER = new Intl.NumberFormat('ko-KR', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});

const buildGroupSelector = (value: string): string => {
  const safe = value.replace(/"/g, '\\"');
  return `g[id="${safe}"]`;
};

const applyRegionFill = (group: SVGGElement, fill: string) => {
  const segments = group.querySelectorAll<SVGElement>('path, polygon, polyline');
  segments.forEach((segment) => {
    segment.setAttribute('fill', fill);
    segment.setAttribute('stroke', REGION_STROKE_COLOR);
    segment.setAttribute('stroke-width', REGION_STROKE_WIDTH);
    segment.setAttribute('stroke-linejoin', 'round');
  });
};

const HOVER_FILTER = 'drop-shadow(0 0 8px rgba(15,23,42,0.25))';
const SELECTED_FILTER = 'drop-shadow(0 0 12px rgba(220,38,38,0.45))';

interface TooltipState {
  regionId: string;
  name: string;
  total: number;
  active: number;
  ratio: number;
  bucketLabel: string;
  x: number;
  y: number;
}

let cachedSilhouette: string | null = null;
let silhouettePromise: Promise<string> | null = null;

const enhanceSvgMarkup = (markup: string): string => {
  let processed = markup;
  if (!processed.includes('width=')) {
    processed = processed.replace('<svg ', '<svg width="100%" height="100%" ');
  }
  processed = processed.replace(/\.st0\{fill:[^;]+;/, `.st0{fill:${BASE_REGION_FILL};`);
  return processed;
};

const loadSilhouette = async (): Promise<string> => {
  if (cachedSilhouette) {
    return cachedSilhouette;
  }
  if (!silhouettePromise) {
    silhouettePromise = fetch(SILHOUETTE_URL, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch korea silhouette: ${response.status}`);
        }
        return response.text();
      })
      .then((markup) => {
        cachedSilhouette = enhanceSvgMarkup(markup);
        return cachedSilhouette;
      })
      .finally(() => {
        silhouettePromise = null;
      });
  }
  return silhouettePromise!;
};

const MinimapHeatmapBase: React.FC<MinimapHeatmapProps> = ({ metadata, regions, selectedRegionId, onSelect, reduceMotion }) => {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(cachedSilhouette);
  const [loadError, setLoadError] = useState<string | null>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const regionElementsRef = useRef<Map<string, SVGGElement>>(new Map());
  const regionCleanupRef = useRef<Map<string, () => void>>(new Map());
  const prefersReducedMotion = Boolean(reduceMotion);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const metaMap = useMemo(() => {
    if (!metadata?.regions) {
      return null;
    }
    return new Map(metadata.regions.map((entry) => [entry.id, entry]));
  }, [metadata]);

  const regionById = useMemo(() => new Map(regions.map((region) => [region.regionId, region])), [regions]);
  const intensityMap = useMemo(() => buildRegionIntensityMap(regions), [regions]);

  const updateRegionColors = useCallback(
    (elements: Map<string, SVGGElement>) => {
      elements.forEach((group, regionId) => {
        const intensity = intensityMap[regionId];
        if (intensity) {
          const fill = BUCKET_FILLS[intensity.bucketIndex] ?? BUCKET_FILLS[BUCKET_FILLS.length - 1];
          applyRegionFill(group, fill);
          group.dataset.bucketId = intensity.bucket.id;
          group.dataset.ratio = intensity.ratio.toFixed(4);
        } else {
          applyRegionFill(group, BUCKET_FILLS[0]);
          group.dataset.bucketId = 'none';
          group.dataset.ratio = '0';
        }
      });
    },
    [intensityMap]
  );

  const showTooltip = useCallback(
    (regionId: string, group: SVGGElement) => {
      const container = svgContainerRef.current;
      if (!container) {
        return;
      }
      const region = regionById.get(regionId);
      const intensity = intensityMap[regionId];
      const hostRect = container.getBoundingClientRect();
      const bounds = group.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2 - hostRect.left;
      const topY = bounds.top - hostRect.top;
      const clampedX = Math.min(Math.max(centerX, 40), Math.max(hostRect.width - 40, 40));
      const vertical = Math.max(topY, 42);

      setTooltip({
        regionId,
        name: region?.regionName ?? group.dataset.regionLabel ?? '알 수 없음',
        total: region?.totalInRange ?? 0,
        active: region?.activeInRange ?? 0,
        ratio: intensity?.ratio ?? 0,
        bucketLabel: intensity?.bucket.label ?? '데이터 없음',
        x: clampedX,
        y: vertical
      });
    },
    [intensityMap, regionById]
  );

  const hideTooltip = useCallback((regionId?: string) => {
    setTooltip((current) => {
      if (!current) {
        return null;
      }
      if (regionId && current.regionId !== regionId) {
        return current;
      }
      return null;
    });
  }, []);

  const { matchedShapes, unmatchedRegions } = useMemo(() => {
    return regions.reduce<{
      matchedShapes: Record<string, RegionShapeEntry>;
      unmatchedRegions: string[];
    }>(
      (acc, region) => {
        const shape = matchRegionShape({
          regionId: region.regionId,
          code: region.code,
          regionName: region.regionName
        });
        if (shape) {
          acc.matchedShapes[region.regionId] = shape;
          return acc;
        }
        const metaLabel = metaMap?.get(region.regionId)?.name;
        acc.unmatchedRegions.push(metaLabel ?? region.regionName ?? region.regionId);
        return acc;
      },
      { matchedShapes: {}, unmatchedRegions: [] }
    );
  }, [metaMap, regions]);

  const activeRegionCount = useMemo(() => {
    return Object.values(intensityMap).filter((entry) => entry.ratio > 0).length;
  }, [intensityMap]);

  const mappedRegionCount = useMemo(() => Object.keys(matchedShapes).length, [matchedShapes]);

  useEffect(() => {
    if (svgMarkup) {
      return;
    }

    let mounted = true;

    loadSilhouette()
      .then((markup) => {
        if (!mounted) {
          return;
        }
        setSvgMarkup(markup);
      })
      .catch((error: unknown) => {
        if (!mounted) {
          return;
        }
        console.error('미니맵 SVG 로드 실패', error);
        setLoadError('지도 자산을 불러오지 못했습니다.');
      });

    return () => {
      mounted = false;
    };
  }, [svgMarkup]);

  useEffect(() => {
    if (!svgMarkup) {
      regionCleanupRef.current.forEach((dispose) => dispose());
      regionCleanupRef.current.clear();
      regionElementsRef.current.clear();
      setHoveredRegionId(null);
      hideTooltip();
      return;
    }

    const container = svgContainerRef.current;
    if (!container) {
      return;
    }

    const svg = container.querySelector('svg');
    if (!svg) {
      return;
    }

    const cleanupMap = regionCleanupRef.current;
    cleanupMap.forEach((dispose) => dispose());
    cleanupMap.clear();

    const groups = svg.querySelectorAll<SVGGElement>('g[id]');
    groups.forEach((group) => {
      group.removeAttribute('data-region-id');
      group.removeAttribute('data-region-key');
      group.removeAttribute('data-region-label');
      group.removeAttribute('data-region-name');
      group.removeAttribute('data-region-code');
      group.removeAttribute('data-ratio');
      group.removeAttribute('data-bucket-id');
      group.style.cursor = 'default';
      group.style.transition = prefersReducedMotion ? 'none' : 'filter 180ms ease, transform 180ms ease';
      group.setAttribute('role', 'presentation');
      group.removeAttribute('tabindex');
      applyRegionFill(group, BASE_REGION_FILL);
    });

    const elementMap = new Map<string, SVGGElement>();

    Object.entries(matchedShapes).forEach(([regionId, shape]) => {
      const selector = buildGroupSelector(shape.svgId);
      const group = svg.querySelector<SVGGElement>(selector);
      if (!group) {
        return;
      }
      const region = regionById.get(regionId);
      const regionLabel = region?.regionName ?? shape.label;
      group.dataset.regionId = regionId;
      group.dataset.regionKey = shape.svgId;
      group.dataset.regionLabel = regionLabel;
      group.dataset.regionName = regionLabel;
      if (region?.code) {
        group.dataset.regionCode = String(region.code);
      } else {
        group.removeAttribute('data-region-code');
      }
      group.style.cursor = 'pointer';
      group.style.transition = prefersReducedMotion ? 'none' : 'filter 180ms ease, transform 180ms ease';
      group.setAttribute('role', 'button');
      group.setAttribute('tabindex', '-1');
      group.setAttribute('aria-label', regionLabel);
      applyRegionFill(group, BASE_REGION_FILL);
      elementMap.set(regionId, group);

      const handlePointerEnter = () => {
        setHoveredRegionId(regionId);
        showTooltip(regionId, group);
      };

      const handlePointerMove = () => {
        showTooltip(regionId, group);
      };

      const handlePointerLeave = () => {
        setHoveredRegionId((prev) => (prev === regionId ? null : prev));
        hideTooltip(regionId);
      };

      const handleClick = () => {
        onSelect(regionId);
        showTooltip(regionId, group);
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(regionId);
          showTooltip(regionId, group);
        }
        if (event.key === 'Escape') {
          hideTooltip(regionId);
          setHoveredRegionId((prev) => (prev === regionId ? null : prev));
        }
      };

      const handleFocusIn = () => {
        setHoveredRegionId(regionId);
        showTooltip(regionId, group);
      };

      const handleFocusOut = () => {
        setHoveredRegionId((prev) => (prev === regionId ? null : prev));
        hideTooltip(regionId);
      };

      group.addEventListener('pointerenter', handlePointerEnter);
      group.addEventListener('pointermove', handlePointerMove);
      group.addEventListener('pointerleave', handlePointerLeave);
      group.addEventListener('pointercancel', handlePointerLeave);
      group.addEventListener('click', handleClick);
      group.addEventListener('keydown', handleKeyDown);
      group.addEventListener('focusin', handleFocusIn);
      group.addEventListener('focusout', handleFocusOut);

      cleanupMap.set(regionId, () => {
        group.removeEventListener('pointerenter', handlePointerEnter);
        group.removeEventListener('pointermove', handlePointerMove);
        group.removeEventListener('pointerleave', handlePointerLeave);
        group.removeEventListener('pointercancel', handlePointerLeave);
        group.removeEventListener('click', handleClick);
        group.removeEventListener('keydown', handleKeyDown);
        group.removeEventListener('focusin', handleFocusIn);
        group.removeEventListener('focusout', handleFocusOut);
      });
    });

    regionElementsRef.current = elementMap;
    updateRegionColors(elementMap);
    return () => {
      cleanupMap.forEach((dispose) => dispose());
      cleanupMap.clear();
      if (regionElementsRef.current === elementMap) {
        regionElementsRef.current.clear();
      }
    };
  }, [hideTooltip, matchedShapes, onSelect, prefersReducedMotion, regionById, showTooltip, svgMarkup, updateRegionColors]);
  useEffect(() => {
    const elements = regionElementsRef.current;
    if (elements.size === 0) {
      return;
    }
    updateRegionColors(elements);
  }, [updateRegionColors]);

  useEffect(() => {
    const elements = regionElementsRef.current;
    if (elements.size === 0) {
      return;
    }
    elements.forEach((group, regionId) => {
      const isSelected = regionId === selectedRegionId;
      const isHovered = regionId === hoveredRegionId;
      group.style.filter = isSelected ? SELECTED_FILTER : isHovered ? HOVER_FILTER : 'none';
      if (prefersReducedMotion) {
        group.style.transform = 'none';
      } else {
        group.style.transform = isSelected ? 'scale(1.02)' : isHovered ? 'scale(1.01)' : 'scale(1)';
      }
      group.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
  }, [hoveredRegionId, prefersReducedMotion, selectedRegionId]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && unmatchedRegions.length > 0) {
      console.warn('[MinimapHeatmap] SVG 매핑 누락 지역', unmatchedRegions);
    }
  }, [unmatchedRegions]);

  useEffect(() => {
    if (!tooltip) {
      return;
    }
    const region = regionById.get(tooltip.regionId);
    if (!region) {
      return;
    }
    const intensity = intensityMap[tooltip.regionId];
    setTooltip((current) => {
      if (!current || current.regionId !== tooltip.regionId) {
        return current;
      }
      const updatedTotal = region.totalInRange ?? 0;
      const updatedActive = region.activeInRange ?? 0;
      const updatedRatio = intensity?.ratio ?? 0;
      const updatedBucket = intensity?.bucket.label ?? current.bucketLabel;
      if (
        current.total === updatedTotal &&
        current.active === updatedActive &&
        current.ratio === updatedRatio &&
        current.bucketLabel === updatedBucket
      ) {
        return current;
      }
      return {
        ...current,
        total: updatedTotal,
        active: updatedActive,
        ratio: updatedRatio,
        bucketLabel: updatedBucket
      };
    });
  }, [intensityMap, regionById, tooltip]);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-500">
          맵
        </span>
        지역 분포 미니맵 (실험중)
      </div>
      <div className="mt-3 flex justify-center">
        <div ref={svgContainerRef} className="relative aspect-[509/716] w-full max-w-[320px] overflow-hidden rounded-xl bg-slate-950/5">
          {svgMarkup ? (
            <div
              role="img"
              aria-label="대한민국 지도 실루엣"
              className="absolute inset-0"
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
          ) : loadError ? (
            <div className="absolute inset-0 flex items-center justify-center px-4 text-xs text-red-500">{loadError}</div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-4 text-xs text-slate-400">지도를 불러오는 중...</div>
          )}
          {tooltip && (
            <div
              className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-3 flex-col items-center"
              style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
            >
              <div className="rounded-lg bg-slate-900/90 px-3 py-2 text-[10px] text-white shadow-lg ring-1 ring-slate-900/60">
                <div className="text-[11px] font-semibold text-white">{tooltip.name}</div>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-white/75">
                  <span>{`총 ${NUMBER_FORMATTER.format(Math.round(tooltip.total))}건`}</span>
                  <span aria-hidden>•</span>
                  <span>{`활성 ${NUMBER_FORMATTER.format(Math.round(tooltip.active))}건`}</span>
                </div>
                <div className="mt-1 text-[10px] text-amber-200">
                  {`${tooltip.bucketLabel} · ${PERCENT_FORMATTER.format(Math.max(0, Math.min(tooltip.ratio, 1)))}`}
                </div>
              </div>
              <div className="h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-slate-900/90" />
            </div>
          )}
          {regions.length === 0 && !loadError && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-xs text-slate-400">표시할 집계가 없습니다.</div>
          )}
        </div>
      </div>
      {regions.length > 0 && (
        <div className="mt-2 text-[11px] text-slate-400">
          {`데이터 지역 ${regions.length}개 · 매핑 ${mappedRegionCount}개 · 활성 ${activeRegionCount}개`}
        </div>
      )}
      {unmatchedRegions.length > 0 && (
        <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {`SVG 매핑되지 않은 지역: ${unmatchedRegions.join(', ')}`}
        </div>
      )}
    </div>
  );
};

export const MinimapHeatmap = memo(MinimapHeatmapBase);
