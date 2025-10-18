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

export type RegionValueKey = 'totalInRange' | 'activeInRange' | 'totalCases' | 'activeCases';

export interface BuildIntensityMapOptions {
  valueKey?: RegionValueKey;
  buckets?: IntensityBucket[];
}

export const DEFAULT_INTENSITY_BUCKETS: IntensityBucket[] = [
  { id: 'very-low', label: '0~10%', minRatio: 0, maxRatio: 0.1 },
  { id: 'low', label: '10~30%', minRatio: 0.1, maxRatio: 0.3 },
  { id: 'medium', label: '30~50%', minRatio: 0.3, maxRatio: 0.5 },
  { id: 'high', label: '50~70%', minRatio: 0.5, maxRatio: 0.7 },
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
  const { valueKey = 'totalInRange', buckets = DEFAULT_INTENSITY_BUCKETS } = options;
  const numericValues = regions.map((region) => {
    const value = Number((region as Record<string, unknown>)[valueKey]);
    return Number.isFinite(value) ? Math.max(value, 0) : 0;
  });
  const total = numericValues.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
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
    acc[region.regionId] = getRegionIntensity(value, total, buckets);
    return acc;
  }, {});
};
