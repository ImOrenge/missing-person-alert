import { memo, useEffect, useMemo, useState } from 'react';
import type { AggregatedRegionStats } from '../../hooks/useRegionStatsData';
import type { RegionMetadataDocument } from '../../types/regionStats';
import { buildRegionIntensityMap } from './minimap/intensity';
import { matchRegionShape } from './minimap/regionMap';

export interface MinimapHeatmapProps {
  metadata: RegionMetadataDocument | null;
  regions: AggregatedRegionStats[];
  selectedRegionId: string | null;
  onSelect: (regionId: string) => void;
  reduceMotion?: boolean;
}

const SILHOUETTE_URL = `${process.env.PUBLIC_URL || ''}/maps/korea-silhouette.svg`;

let cachedSilhouette: string | null = null;
let silhouettePromise: Promise<string> | null = null;

const enhanceSvgMarkup = (markup: string): string => {
  if (!markup.includes('width=')) {
    return markup.replace('<svg ', '<svg width="100%" height="100%" ');
  }
  return markup;
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

  const metaMap = useMemo(() => {
    if (!metadata?.regions) {
      return null;
    }
    return new Map(metadata.regions.map((entry) => [entry.id, entry]));
  }, [metadata]);

  const intensityMap = useMemo(() => buildRegionIntensityMap(regions), [regions]);

  const { matchedShapes, unmatchedRegions } = useMemo(() => {
    return regions.reduce<{
      matchedShapes: Record<string, string>;
      unmatchedRegions: string[];
    }>(
      (acc, region) => {
        const shape = matchRegionShape({
          regionId: region.regionId,
          code: region.code,
          regionName: region.regionName
        });
        if (shape) {
          acc.matchedShapes[region.regionId] = shape.svgId;
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

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-500">
          맵
        </span>
        지역 분포 미니맵 (실험중)
      </div>
      <div className="mt-3 flex justify-center">
        <div className="relative aspect-[509/716] w-full max-w-[320px] overflow-hidden rounded-xl bg-slate-950/5">
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
