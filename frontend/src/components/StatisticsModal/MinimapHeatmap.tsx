import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import type { AggregatedRegionStats } from '../../hooks/useRegionStatsData';
import type { RegionMetadataDocument } from '../../types/regionStats';
import { buildRegionIntensityMap } from './minimap/intensity';
import { matchRegionShape, type RegionShapeEntry } from './minimap/regionMap';

export interface MinimapHeatmapProps {
  metadata: RegionMetadataDocument | null;
  regions: AggregatedRegionStats[];
  selectedRegionId: string | null;
  onSelect: (regionId: string) => void;
  maxIntensityValue?: number;
  reduceMotion?: boolean;
  // 날짜별 슬라이더용
  availableDates?: string[];
  selectedDate?: string | null;
  onDateChange?: (date: string | null) => void;
  mode?: 'timeline' | 'current';
  onModeChange?: (mode: 'timeline' | 'current') => void;
}

const SILHOUETTE_URL = `${process.env.PUBLIC_URL || ''}/maps/korea-silhouette.svg`;
const BASE_REGION_FILL = '#e2e8f0';
const GRADIENT_STOPS = Object.freeze([
  { stop: 0, color: '#fff7cc' },
  { stop: 0.15, color: '#fde047' },
  { stop: 0.35, color: '#fbbf24' },
  { stop: 0.55, color: '#f97316' },
  { stop: 0.75, color: '#ef4444' },
  { stop: 1, color: '#991b1b' }
] as const);
const GRADIENT_BACKGROUND = `linear-gradient(90deg, ${GRADIENT_STOPS.map(({ stop, color }) => `${color} ${Math.round(stop * 100)}%`).join(', ')})`;
const REGION_STROKE_COLOR = 'rgba(15,23,42,0.52)';
const REGION_STROKE_WIDTH = '1.1';
const BASE_RELIEF_FILTER = 'drop-shadow(0.4px 0.6px 0.9px rgba(15,23,42,0.32)) drop-shadow(-0.45px -0.6px 0.8px rgba(255,255,255,0.35))';
const HOVER_GLOW_FILTER = 'drop-shadow(0 0 8px rgba(15,23,42,0.35))';
const SELECTED_GLOW_FILTER = 'drop-shadow(0 0 12px rgba(220,38,38,0.5))';
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

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
};

const normalizeHexColor = (hex: string): string => {
  const trimmed = hex.trim();
  const value = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (value.length === 3) {
    return value
      .split('')
      .map((char) => char + char)
      .join('')
      .toLowerCase();
  }
  if (value.length === 6) {
    return value.toLowerCase();
  }
  return '000000';
};

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = normalizeHexColor(hex);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return [
    Number.isFinite(red) ? red : 0,
    Number.isFinite(green) ? green : 0,
    Number.isFinite(blue) ? blue : 0
  ];
};

const componentToHex = (component: number): string => {
  const value = Math.min(255, Math.max(0, Math.round(component)));
  return value.toString(16).padStart(2, '0');
};

const mixColors = (fromColor: string, toColor: string, t: number): string => {
  const [fromR, fromG, fromB] = hexToRgb(fromColor);
  const [toR, toG, toB] = hexToRgb(toColor);
  const red = fromR + (toR - fromR) * t;
  const green = fromG + (toG - fromG) * t;
  const blue = fromB + (toB - fromB) * t;
  return `#${componentToHex(red)}${componentToHex(green)}${componentToHex(blue)}`;
};

const getGradientFill = (ratio: number): string => {
  const stops = GRADIENT_STOPS;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return stops[0]?.color ?? BASE_REGION_FILL;
  }
  const clamped = clamp01(ratio);
  for (let index = 0; index < stops.length - 1; index += 1) {
    const current = stops[index];
    const next = stops[index + 1];
    if (!current || !next) {
      continue;
    }
    if (clamped >= current.stop && clamped <= next.stop) {
      const range = next.stop - current.stop || 1;
      const localT = (clamped - current.stop) / range;
      return mixColors(current.color, next.color, clamp01(localT));
    }
  }
  return stops[stops.length - 1]?.color ?? '#991b1b';
};

const applyRegionFill = (group: SVGGElement, fill: string) => {
  const segments = group.querySelectorAll<SVGElement>('path, polygon, polyline');
  segments.forEach((segment) => {
    segment.setAttribute('fill', fill);
    segment.setAttribute('stroke', REGION_STROKE_COLOR);
    segment.setAttribute('stroke-width', REGION_STROKE_WIDTH);
    segment.setAttribute('stroke-linejoin', 'round');
    segment.setAttribute('paint-order', 'stroke fill markers');
    const drawable = segment as unknown as SVGGraphicsElement;
    drawable.style.fill = fill;
    drawable.style.stroke = REGION_STROKE_COLOR;
    drawable.style.strokeWidth = REGION_STROKE_WIDTH;
    drawable.style.strokeLinejoin = 'round';
    drawable.style.paintOrder = 'stroke fill markers';
  });
};

const buildFilter = (isHovered: boolean, isSelected: boolean): string => {
  return [BASE_RELIEF_FILTER, isSelected ? SELECTED_GLOW_FILTER : isHovered ? HOVER_GLOW_FILTER : ''].filter(Boolean).join(' ');
};

const HOVER_FILTER = buildFilter(true, false);
const SELECTED_FILTER = buildFilter(false, true);
// Ensures legacy hot-reload chunks referencing the old constants continue to resolve safely.
void HOVER_FILTER;
void SELECTED_FILTER;

const PLAYBACK_SPEED_OPTIONS = [0.5, 1, 2, 4] as const;
const DEFAULT_PLAYBACK_SPEED_INDEX = 1;
const VIEW_MODE_OPTIONS = [
  { id: 'timeline' as const, label: '슬라이드 재생' },
  { id: 'current' as const, label: '현재 분포' }
];

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

const MinimapHeatmapBase: React.FC<MinimapHeatmapProps> = ({
  metadata,
  regions,
  selectedRegionId,
  onSelect,
  maxIntensityValue,
  reduceMotion,
  availableDates,
  selectedDate,
  onDateChange,
  mode = 'timeline',
  onModeChange
}) => {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(cachedSilhouette);
  const [loadError, setLoadError] = useState<string | null>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const regionElementsRef = useRef<Map<string, SVGGElement>>(new Map());
  const regionCleanupRef = useRef<Map<string, () => void>>(new Map());
  const prefersReducedMotion = Boolean(reduceMotion);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const viewMode = mode;
  const timelineEnabled = viewMode === 'timeline';

  const handleModeSelect = useCallback(
    (nextMode: 'timeline' | 'current') => {
      if (!onModeChange || nextMode === viewMode) {
        return;
      }
      onModeChange(nextMode);
    },
    [onModeChange, viewMode]
  );

  // 시간별 슬라이더 상태
  const sortedDates = useMemo(() => {
    if (!timelineEnabled || !availableDates || availableDates.length === 0) {
      return [];
    }
    return [...availableDates].sort();
  }, [timelineEnabled, availableDates]);

  const lastDateIndex = sortedDates.length > 0 ? sortedDates.length - 1 : 0;

  const currentDateIndex = useMemo(() => {
    if (!timelineEnabled || sortedDates.length === 0) {
      return lastDateIndex;
    }
    if (!selectedDate) {
      return lastDateIndex;
    }
    const index = sortedDates.indexOf(selectedDate);
    return index >= 0 ? index : lastDateIndex;
  }, [timelineEnabled, selectedDate, sortedDates, lastDateIndex]);

  const [localDateIndex, setLocalDateIndex] = useState<number>(currentDateIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [playbackSpeedIndex, setPlaybackSpeedIndex] = useState<number>(DEFAULT_PLAYBACK_SPEED_INDEX);

  const selectedDateIndex = timelineEnabled
    ? (selectedDate !== undefined ? currentDateIndex : localDateIndex)
    : lastDateIndex;

  const hasTimelineData = timelineEnabled && sortedDates.length > 0;
  const hasTimeSlider = hasTimelineData && sortedDates.length > 1;
  const currentDate =
    timelineEnabled && selectedDateIndex >= 0 && selectedDateIndex < sortedDates.length
      ? sortedDates[selectedDateIndex]
      : null;

  const playbackSpeed = PLAYBACK_SPEED_OPTIONS[playbackSpeedIndex] ?? PLAYBACK_SPEED_OPTIONS[DEFAULT_PLAYBACK_SPEED_INDEX];

  useEffect(() => {
    if (!timelineEnabled) {
      setIsPlaying(false);
      setLocalDateIndex(lastDateIndex);
      return;
    }
    if (selectedDate === undefined && sortedDates.length > 0) {
      setLocalDateIndex(sortedDates.length - 1);
    }
  }, [timelineEnabled, selectedDate, sortedDates, lastDateIndex]);

  // 날짜 변경 시 부모에게 전달
  const handleDateChange = useCallback((index: number) => {
    if (!timelineEnabled) {
      return;
    }
    if (onDateChange && sortedDates[index]) {
      onDateChange(sortedDates[index]);
    } else {
      setLocalDateIndex(index);
    }
  }, [timelineEnabled, onDateChange, sortedDates]);

  // 외부 selectedDate가 변경되면 로컬 상태도 업데이트
  useEffect(() => {
    if (selectedDate === undefined && sortedDates.length > 0) {
      setLocalDateIndex(sortedDates.length - 1);
    }
  }, [selectedDate, sortedDates]);

  // 재생 기능
  useEffect(() => {
    if (!timelineEnabled || !isPlaying || !hasTimeSlider) {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      return;
    }

    const intervalMs = Math.max(200, Math.round(1000 / playbackSpeed));

    playIntervalRef.current = setInterval(() => {
      const currentIndex = selectedDateIndex;
      const nextIndex = currentIndex + 1;
      if (nextIndex >= sortedDates.length) {
        setIsPlaying(false);
        handleDateChange(sortedDates.length - 1);
      } else {
        handleDateChange(nextIndex);
      }
    }, intervalMs);

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [timelineEnabled, isPlaying, hasTimeSlider, sortedDates.length, selectedDateIndex, handleDateChange, playbackSpeed]);

  const metaMap = useMemo(() => {
    if (!metadata?.regions) {
      return null;
    }
    return new Map(metadata.regions.map((entry) => [entry.id, entry]));
  }, [metadata]);

  const regionById = useMemo(() => new Map(regions.map((region) => [region.regionId, region])), [regions]);
  const intensityMap = useMemo(() => buildRegionIntensityMap(regions, {
    useAbsoluteScale: true,
    maxValue: maxIntensityValue
  }), [regions, maxIntensityValue]);

  const updateRegionColors = useCallback(
    (elements: Map<string, SVGGElement>) => {
      elements.forEach((group, regionId) => {
        const intensity = intensityMap[regionId];
        if (intensity) {
          const fill = getGradientFill(intensity.ratio);
          applyRegionFill(group, fill);
          group.dataset.bucketId = intensity.bucket.id;
          group.dataset.ratio = intensity.ratio.toFixed(4);
          group.dataset.fillColor = fill;
        } else {
          applyRegionFill(group, BASE_REGION_FILL);
          group.dataset.bucketId = 'none';
          group.dataset.ratio = '0';
          group.removeAttribute('data-fill-color');
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

    const sortedEntries = Object.entries(matchedShapes).sort((entryA, entryB) => {
      const regionA = regionById.get(entryA[0]);
      const regionB = regionById.get(entryB[0]);
      const labelA = regionA?.regionName ?? entryA[1].label;
      const labelB = regionB?.regionName ?? entryB[1].label;
      return labelA.localeCompare(labelB, 'ko-KR');
    });

    const elementMap = new Map<string, SVGGElement>();

    sortedEntries.forEach(([regionId, shape], index) => {
      const selector = buildGroupSelector(shape.svgId);
      const group = svg.querySelector<SVGGElement>(selector);
      if (!group) {
        return;
      }
      const region = regionById.get(regionId);
      const regionLabel = region?.regionName ?? shape.label;
      const parent = group.parentElement;
      if (parent) {
        parent.appendChild(group);
      }
      const initiallySelected = regionId === selectedRegionId;
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
      group.setAttribute('tabindex', '0');
      group.dataset.tabIndex = String(index + 1);
      group.setAttribute('aria-label', regionLabel);
      group.style.filter = buildFilter(false, initiallySelected);
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
  }, [hideTooltip, matchedShapes, onSelect, prefersReducedMotion, regionById, selectedRegionId, showTooltip, svgMarkup, updateRegionColors]);
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
      group.style.filter = buildFilter(isHovered, isSelected);
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

  const handlePlayPause = () => {
    if (!timelineEnabled || !hasTimeSlider) {
      return;
    }
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      // 마지막 날짜면 처음부터 재생
      if (selectedDateIndex >= sortedDates.length - 1) {
        handleDateChange(0);
      }
      setIsPlaying(true);
    }
  };

  const handlePlaybackSpeedToggle = () => {
    if (!timelineEnabled || !hasTimeSlider) {
      return;
    }
    setPlaybackSpeedIndex((current) => {
      const next = current + 1;
      return next < PLAYBACK_SPEED_OPTIONS.length ? next : 0;
    });
  };

  const playbackSpeedLabel = useMemo(() => {
    const value = playbackSpeed;
    return Number.isInteger(value) ? `${value.toFixed(0)}x` : `${value.toFixed(1)}x`;
  }, [playbackSpeed]);

  return (
    <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-100 md:rounded-2xl md:p-4">
      {/* 모바일: 컴팩트한 헤더 */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 md:hidden">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <span aria-hidden className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-200 text-[8px] font-bold text-slate-500">
            맵
          </span>
          <span>지역 분포</span>
        </div>
        {onModeChange && (
          <div className="flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5 text-[10px] font-semibold text-slate-500">
            {VIEW_MODE_OPTIONS.map((option) => {
              const isActive = option.id === viewMode;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleModeSelect(option.id)}
                  className={`rounded-full px-2 py-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 ${isActive ? 'bg-white text-red-600 shadow' : 'text-slate-500'}`}
                  aria-pressed={isActive}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 데스크톱: 기존 헤더 */}
      <div className="hidden flex-wrap items-center justify-between gap-2 md:flex">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-500">
            맵
          </span>
          <span>지역 분포 미니맵</span>
          <span className="text-xs font-medium text-slate-400">{viewMode === 'timeline' ? '슬라이드 재생' : '현재 분포'}</span>
        </div>
        {onModeChange && (
          <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1 text-[11px] font-semibold text-slate-500">
            {VIEW_MODE_OPTIONS.map((option) => {
              const isActive = option.id === viewMode;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleModeSelect(option.id)}
                  className={`rounded-full px-3 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 ${isActive ? 'bg-white text-red-600 shadow' : 'text-slate-500 hover:text-slate-700'}`}
                  aria-pressed={isActive}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 시간별 슬라이더 - 모바일 */}
      {timelineEnabled ? (
        hasTimelineData ? (
          <div className="mt-2 space-y-1.5 md:hidden">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium text-slate-600">
                {currentDate
                  ? new Date(currentDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
                  : '전체 기간'}
              </span>
              <div className="flex items-center gap-1">
                {hasTimeSlider ? (
                  <>
                    <button
                      type="button"
                      onClick={handlePlaybackSpeedToggle}
                      className="flex items-center gap-0.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500"
                      aria-label="재생 속도 변경"
                    >
                      <span>{playbackSpeedLabel}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePlayPause}
                      className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${isPlaying ? 'bg-red-100 text-red-600' : 'bg-red-50 text-red-600'}`}
                      aria-label={isPlaying ? '일시정지' : '재생'}
                    >
                      {isPlaying ? (
                        <>
                          <Pause size={10} />
                          <span>정지</span>
                        </>
                      ) : (
                        <>
                          <Play size={10} />
                          <span>재생</span>
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">단일</span>
                )}
              </div>
            </div>
            {hasTimeSlider && (
              <>
                <input
                  type="range"
                  min={0}
                  max={sortedDates.length - 1}
                  value={selectedDateIndex}
                  onChange={(e) => {
                    handleDateChange(Number(e.target.value));
                    setIsPlaying(false);
                  }}
                  className="w-full accent-red-600"
                  aria-label="날짜 선택 슬라이더"
                />
                <div className="flex justify-between text-[9px] text-slate-400">
                  <span>{sortedDates[0] ? new Date(sortedDates[0]).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : ''}</span>
                  <span>
                    {sortedDates[sortedDates.length - 1]
                      ? new Date(sortedDates[sortedDates.length - 1]).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
                      : ''}
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500 md:hidden">시간 데이터 부족</div>
        )
      ) : (
        <div className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500 md:hidden">최신 분포 표시</div>
      )}

      {/* 시간별 슬라이더 - 데스크톱 */}
      {timelineEnabled ? (
        hasTimelineData ? (
          <div className="mt-3 hidden space-y-2 md:block">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">
                {currentDate
                  ? new Date(currentDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
                  : '전체 기간'}
              </span>
              <div className="flex items-center gap-2">
                {hasTimeSlider ? (
                  <>
                    <button
                      type="button"
                      onClick={handlePlaybackSpeedToggle}
                      className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-200"
                      aria-label="재생 속도 변경"
                    >
                      <span>배속</span>
                      <span className="text-slate-700">{playbackSpeedLabel}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePlayPause}
                      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition ${isPlaying ? 'bg-red-100 text-red-600' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                      aria-label={isPlaying ? '일시정지' : '재생'}
                    >
                      {isPlaying ? (
                        <>
                          <Pause size={12} />
                          <span>일시정지</span>
                        </>
                      ) : (
                        <>
                          <Play size={12} />
                          <span>재생</span>
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-400">단일 스냅샷</span>
                )}
              </div>
            </div>
            {hasTimeSlider && (
              <>
                <input
                  type="range"
                  min={0}
                  max={sortedDates.length - 1}
                  value={selectedDateIndex}
                  onChange={(e) => {
                    handleDateChange(Number(e.target.value));
                    setIsPlaying(false);
                  }}
                  className="w-full accent-red-600"
                  aria-label="날짜 선택 슬라이더"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>{sortedDates[0] ? new Date(sortedDates[0]).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : ''}</span>
                  <span>
                    {sortedDates[sortedDates.length - 1]
                      ? new Date(sortedDates[sortedDates.length - 1]).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
                      : ''}
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="mt-3 hidden rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500 md:block">시간 슬라이드를 위한 데이터가 부족합니다.</div>
        )
      ) : (
        <div className="mt-3 hidden rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500 md:block">선택한 기간의 최신 분포를 표시합니다.</div>
      )}

      <div className="mt-2 flex justify-center md:mt-3">
        <div ref={svgContainerRef} className="relative aspect-[509/716] w-full max-w-[min(100%,360px)] overflow-hidden rounded-lg bg-slate-950/5 md:rounded-xl">
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
        <div className="mt-1.5 text-[9px] text-slate-400 md:mt-2 md:text-[11px]">
          {`데이터 ${regions.length}개 · 매핑 ${mappedRegionCount}개 · 활성 ${activeRegionCount}개`}
        </div>
      )}
      <div className="mt-3 flex justify-center md:mt-4">
        <div className="w-full max-w-[min(100%,360px)]">
          <div className="flex items-center justify-between text-[9px] font-medium text-slate-500 md:text-[10px]">
            <span>낮음</span>
            <span>중간</span>
            <span>높음</span>
          </div>
          <div
            className="mt-1 h-2 w-full rounded-full ring-1 ring-slate-200/70"
            style={{ background: GRADIENT_BACKGROUND }}
            aria-hidden
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-400 md:mt-1.5 md:text-[10px]">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-[3px] border border-slate-200" style={{ backgroundColor: BASE_REGION_FILL }} />
              데이터 없음
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-[3px] border border-slate-200" style={{ backgroundColor: getGradientFill(1) }} />
              전체 대비 최대
            </span>
          </div>
        </div>
      </div>
      {unmatchedRegions.length > 0 && (
        <div className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] text-amber-700 md:mt-3 md:rounded-xl md:px-3 md:py-2 md:text-xs">
          {`SVG 매핑 누락: ${unmatchedRegions.join(', ')}`}
        </div>
      )}
    </div>
  );
};

export const MinimapHeatmap = memo(MinimapHeatmapBase);
