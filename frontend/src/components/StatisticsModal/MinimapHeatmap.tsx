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

const MinimapHeatmapBase: React.FC<MinimapHeatmapProps> = ({ metadata, regions }) => {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(cachedSilhouette);
  const [loadError, setLoadError] = useState<string | null>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const regionElementsRef = useRef<Map<string, SVGGElement>>(new Map());

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
      regionElementsRef.current.clear();
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
      applyRegionFill(group, BASE_REGION_FILL);
      elementMap.set(regionId, group);
    });

    regionElementsRef.current = elementMap;
    updateRegionColors(elementMap);
  }, [matchedShapes, regionById, svgMarkup, updateRegionColors]);
  useEffect(() => {
    const elements = regionElementsRef.current;
    if (elements.size === 0) {
      return;
    }
    updateRegionColors(elements);
  }, [updateRegionColors]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && unmatchedRegions.length > 0) {
      console.warn('[MinimapHeatmap] SVG 매핑 누락 지역', unmatchedRegions);
    }
  }, [unmatchedRegions]);

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
