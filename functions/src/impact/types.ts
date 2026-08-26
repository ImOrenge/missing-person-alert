export const IMPACT_EVENT_FIELD_MAP = {
  case_impression: "caseImpressions",
  case_view: "caseViews",
  share_click: "shareClicks",
  report_cta_click: "reportCtaClicks",
  map_view: "mapViews",
  official_source_click: "officialSourceClicks",
  statistics_view: "statisticsViews",
  impact_view: "impactViews",
} as const;

export type ImpactEventField = typeof IMPACT_EVENT_FIELD_MAP[keyof typeof IMPACT_EVENT_FIELD_MAP];
export type ImpactEvents = Record<ImpactEventField, number>;

export interface ImpactMonthlyDraft {
  month: string;
  events: ImpactEvents;
  estimatedUsers: number;
  service: {activeCasesPublishedEndOfMonth: number; activeCasesSnapshotBasis: "aggregation_time"};
  rates: {
    detailViewRate: number | null;
    shareRateFromDetail: number | null;
    reportCtaRateFromDetail: number | null;
    officialSourceRate: number | null;
  };
  aggregation: {
    source: string;
    queryVersion: number;
    methodologyVersion: number;
    dayDocuments: number;
    timezone: string;
  };
  anomalies: string[];
  review: {state: "draft" | "approved" | "rejected"};
  published: false;
}
