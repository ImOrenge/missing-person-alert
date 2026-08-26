import {IMPACT_EVENT_FIELD_MAP, type ImpactEvents, type ImpactMonthlyDraft} from "./types";

export const IMPACT_QUERY_VERSION = 2;
export const IMPACT_METHODOLOGY_VERSION = 1;

export const emptyImpactEvents = (): ImpactEvents => Object.fromEntries(
  Object.values(IMPACT_EVENT_FIELD_MAP).map((field) => [field, 0]),
) as ImpactEvents;

export const safeImpactRate = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : Number((numerator / denominator).toFixed(6));

export const monthBounds = (month: string): {start: string; end: string} => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Invalid month: ${month}`);
  const [yearText, monthText] = month.split("-");
  const lastDay = new Date(Date.UTC(Number(yearText), Number(monthText), 0)).getUTCDate();
  return {start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}`};
};

export const dateKeyDaysAgo = (now: Date, days: number): string => {
  const copy = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy.toISOString().slice(0, 10);
};

export const detectImpactAnomalies = (events: ImpactEvents, previous?: ImpactEvents | null): string[] => {
  if (!previous) return [];
  return Object.values(IMPACT_EVENT_FIELD_MAP).flatMap((field) => {
    const before = Number(previous[field] || 0);
    const after = Number(events[field] || 0);
    if (before === 0) return after > 1000 ? [`${field}_from_zero_over_1000`] : [];
    return Math.abs(after - before) / before >= 1 ? [`${field}_changed_over_100_percent`] : [];
  });
};

export const buildImpactMonthlyDraft = (input: {
  month: string;
  dailyEvents: ImpactEvents[];
  estimatedUsers: number;
  activeCasesPublishedEndOfMonth: number;
  timezone: string;
  previousEvents?: ImpactEvents | null;
}): ImpactMonthlyDraft => {
  const events = emptyImpactEvents();
  input.dailyEvents.forEach((daily) => Object.values(IMPACT_EVENT_FIELD_MAP).forEach((field) => {
    events[field] += Number(daily[field] || 0);
  }));
  return {
    month: input.month,
    events,
    estimatedUsers: Math.max(0, Math.floor(input.estimatedUsers)),
    service: {
      activeCasesPublishedEndOfMonth: Math.max(0, Math.floor(input.activeCasesPublishedEndOfMonth)),
      activeCasesSnapshotBasis: "aggregation_time",
    },
    rates: {
      detailViewRate: safeImpactRate(events.caseViews, events.caseImpressions),
      shareRateFromDetail: safeImpactRate(events.shareClicks, events.caseViews),
      reportCtaRateFromDetail: safeImpactRate(events.reportCtaClicks, events.caseViews),
      officialSourceRate: safeImpactRate(events.officialSourceClicks, events.caseViews),
    },
    aggregation: {
      source: "impact_daily_and_ga4_bigquery",
      queryVersion: IMPACT_QUERY_VERSION,
      methodologyVersion: IMPACT_METHODOLOGY_VERSION,
      dayDocuments: input.dailyEvents.length,
      timezone: input.timezone,
    },
    anomalies: detectImpactAnomalies(events, input.previousEvents),
    review: {state: "draft"},
    published: false,
  };
};

export const projectPublicImpactMonth = (data: Record<string, any>): Record<string, unknown> | null => {
  if (data.published !== true || data.review?.state !== "approved") return null;
  return {
    month: data.month,
    events: data.events,
    estimatedUsers: Number(data.estimatedUsers || 0),
    service: data.service || {},
    rates: data.rates || {},
    aggregation: {
      queryVersion: data.aggregation?.queryVersion,
      methodologyVersion: data.aggregation?.methodologyVersion,
      timezone: data.aggregation?.timezone,
      lastAggregatedAt: data.aggregation?.lastAggregatedAt,
    },
    review: {state: "approved", reviewedAt: data.review?.reviewedAt},
    published: true,
  };
};
