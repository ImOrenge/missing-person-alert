import type { AggregatedRegionStats } from '../../../hooks/useRegionStatsData';

export interface IntensityBucket {
  id: string;
  label: string;
  minRatio: number;
  maxRatio: number;
}

export interface RegionIntensity {
  ratio: number;
  bucket: IntensityBucket;
  bucketIndex: number;
}

export type RegionValueKey = Extract<
  keyof AggregatedRegionStats,
  'totalInRange' | 'activeInRange' | 'totalCases' | 'activeCases'
>;

export interface BuildIntensityMapOptions {
  valueKey?: RegionValueKey;
  buckets?: IntensityBucket[];
  useAbsoluteScale?: boolean; // true면 최대값 기준, false면 합계 기준
  maxValue?: number; // 절대 스케일 사용 시 기준 최대값
}

export const DEFAULT_INTENSITY_BUCKETS: IntensityBucket[] = [
  { id: 'very-low', label: '0~5%', minRatio: 0, maxRatio: 0.05 },
  { id: 'low', label: '5~15%', minRatio: 0.05, maxRatio: 0.15 },
  { id: 'medium', label: '15~30%', minRatio: 0.15, maxRatio: 0.3 },
  { id: 'high', label: '30~50%', minRatio: 0.3, maxRatio: 0.5 },
  { id: 'very-high', label: '70% 이상', minRatio: 0.7, maxRatio: 1.0000000001 }
];

const clampRatio = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
};

const pickBucket = (ratio: number, buckets: IntensityBucket[]): { bucket: IntensityBucket; index: number } => {
  const index = buckets.findIndex((bucket) => ratio >= bucket.minRatio && ratio < bucket.maxRatio);
  if (index >= 0) {
    return { bucket: buckets[index], index };
  }
  const fallbackIndex = buckets.length - 1;
  return { bucket: buckets[fallbackIndex], index: fallbackIndex };
};

export const getRegionIntensity = (
  value: number,
  total: number,
  buckets: IntensityBucket[] = DEFAULT_INTENSITY_BUCKETS
): RegionIntensity => {
  const safeTotal = total > 0 ? total : 0;
  const ratio = safeTotal > 0 ? clampRatio(value / safeTotal) : 0;
  const { bucket, index } = pickBucket(ratio, buckets);
  return {
    ratio,
    bucket,
    bucketIndex: index
  };
};

export const buildRegionIntensityMap = (
  regions: AggregatedRegionStats[],
  options: BuildIntensityMapOptions = {}
): Record<string, RegionIntensity> => {
  const { valueKey = 'totalInRange', buckets = DEFAULT_INTENSITY_BUCKETS, useAbsoluteScale = true, maxValue } = options;
  const getMetricValue = (region: AggregatedRegionStats): number => {
    const rawValue = region[valueKey];
    if (typeof rawValue === 'number') {
      return Number.isFinite(rawValue) ? rawValue : 0;
    }
    const numeric = Number(rawValue ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const numericValues = regions.map((region) => Math.max(getMetricValue(region), 0));

  // 절대값 스케일: 최대값 기준, 상대값 스케일: 합계 기준
  let referenceValue: number;
  if (useAbsoluteScale) {
    referenceValue = maxValue !== undefined && maxValue > 0
      ? maxValue // 외부에서 전달된 최대값 사용
      : Math.max(...numericValues, 1); // 현재 데이터의 최대값
  } else {
    referenceValue = numericValues.reduce((sum, value) => sum + value, 0); // 합계
  }

  if (referenceValue <= 0) {
    return regions.reduce<Record<string, RegionIntensity>>((acc, region) => {
      acc[region.regionId] = {
        ratio: 0,
        bucket: buckets[0],
        bucketIndex: 0
      };
      return acc;
    }, {});
  }

  return regions.reduce<Record<string, RegionIntensity>>((acc, region, index) => {
    const value = numericValues[index];
    acc[region.regionId] = getRegionIntensity(value, referenceValue, buckets);
    return acc;
  }, {});
};
