export interface PublicImpactMonth {
  month: string;
  events: {
    caseImpressions: number;
    caseViews: number;
    mapViews: number;
    shareClicks: number;
    officialSourceClicks: number;
    reportCtaClicks: number;
    statisticsViews?: number;
    impactViews?: number;
  };
  estimatedUsers: number;
  service: {activeCasesPublishedEndOfMonth?: number; activeCasesSnapshotBasis?: 'aggregation_time'};
  rates: Record<string, number | null>;
  aggregation: {queryVersion?: number; methodologyVersion?: number; timezone?: string; lastAggregatedAt?: unknown};
  review: {state: 'approved'; reviewedAt?: unknown};
  published: true;
}
