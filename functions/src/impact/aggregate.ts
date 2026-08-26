import {BigQuery} from "@google-cloud/bigquery";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {defineBoolean, defineString} from "firebase-functions/params";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {buildImpactMonthlyDraft, emptyImpactEvents, IMPACT_QUERY_VERSION, monthBounds} from "./model";
import {IMPACT_EVENT_FIELD_MAP, type ImpactEvents} from "./types";

const aggregationEnabled = defineBoolean("IMPACT_AGGREGATION_ENABLED", {default: false});
const ga4DatasetId = defineString("GA4_DATASET_ID", {default: ""});
const bigQueryLocation = defineString("BIGQUERY_LOCATION", {default: "asia-northeast3"});
const impactTimeZone = defineString("IMPACT_TIME_ZONE", {default: "Asia/Seoul"});

const dateSuffix = (dateKey: string): string => dateKey.replace(/-/g, "");

const dateKeyDaysAgoInTimeZone = (days: number, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone, year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(new Date());
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const date = new Date(Date.UTC(read("year"), read("month") - 1, read("day")));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};

const previousMonth = (month: string): string => {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 2, 1));
  return date.toISOString().slice(0, 7);
};

const queryEventCounts = async (bigQuery: BigQuery, startSuffix: string, endSuffix: string): Promise<{events: ImpactEvents; estimatedUsers: number}> => {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const datasetId = ga4DatasetId.value().trim();
  if (!projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/i.test(projectId)) throw new Error("GA4 BigQuery project is not configured or invalid");
  if (!/^[A-Za-z0-9_]{1,1024}$/.test(datasetId)) throw new Error("GA4 BigQuery dataset is not configured or invalid");
  const eventNames = Object.keys(IMPACT_EVENT_FIELD_MAP);
  const query = `
    WITH filtered AS (
      SELECT event_name, user_pseudo_id
      FROM \`${projectId}.${datasetId}.events_*\`
      WHERE _TABLE_SUFFIX BETWEEN @startSuffix AND @endSuffix
        AND event_name IN UNNEST(@eventNames)
    )
    SELECT event_name, COUNT(*) AS event_count, COUNT(DISTINCT user_pseudo_id) AS estimated_users
    FROM filtered GROUP BY event_name
    UNION ALL
    SELECT '__all__' AS event_name, COUNT(*) AS event_count, COUNT(DISTINCT user_pseudo_id) AS estimated_users
    FROM filtered
  `;
  const [rows] = await bigQuery.query({query, location: bigQueryLocation.value(), params: {startSuffix, endSuffix, eventNames}});
  const events = emptyImpactEvents();
  let estimatedUsers = 0;
  (rows as Array<Record<string, unknown>>).forEach((row) => {
    const eventName = String(row.event_name);
    if (eventName === "__all__") estimatedUsers = Number(row.estimated_users || 0);
    else {
      const field = IMPACT_EVENT_FIELD_MAP[eventName as keyof typeof IMPACT_EVENT_FIELD_MAP];
      if (field) events[field] = Number(row.event_count || 0);
    }
  });
  return {events, estimatedUsers};
};

const aggregateOneDay = async (db: admin.firestore.Firestore, bigQuery: BigQuery, dateKey: string, timeZone: string): Promise<void> => {
  const result = await queryEventCounts(bigQuery, dateSuffix(dateKey), dateSuffix(dateKey));
  await db.collection("impact_daily").doc(dateKey).set({
    date: dateKey,
    timezone: timeZone,
    events: result.events,
    estimatedUsers: result.estimatedUsers,
    aggregation: {
      source: "ga4_bigquery",
      window: "D-3_to_D-1_rebuild",
      queryVersion: IMPACT_QUERY_VERSION,
      lastAggregatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});
};

const ensureDataQualityIssues = async (db: admin.firestore.Firestore, month: string, anomalies: string[]): Promise<void> => {
  for (const anomaly of anomalies) {
    const issueRef = db.collection("data_quality_issues").doc(`impact_${month}_${anomaly}`);
    const existing = await issueRef.get();
    if (!existing.exists) {
      await issueRef.set({
        type: "analytics_spike", status: "open", severity: "warning", sourceId: "ga4_bigquery",
        target: `impact_monthly_drafts/${month}`, code: anomaly, assignedTo: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
};

const rebuildMonthlyDraft = async (db: admin.firestore.Firestore, bigQuery: BigQuery, month: string, timeZone: string): Promise<void> => {
  const bounds = monthBounds(month);
  const [dailySnapshot, activeSnapshot, previousDraft, rawMonthly] = await Promise.all([
    db.collection("impact_daily").where("date", ">=", bounds.start).where("date", "<=", bounds.end).get(),
    db.collection("missingPersons").where("status", "==", "active").get(),
    db.collection("impact_monthly_drafts").doc(previousMonth(month)).get(),
    queryEventCounts(bigQuery, dateSuffix(bounds.start), dateSuffix(bounds.end)),
  ]);
  const dailyEvents = dailySnapshot.docs.map((doc) => doc.data().events as ImpactEvents);
  const activeCases = activeSnapshot.docs.filter((doc) => {
    const data = doc.data();
    return data.source === "api" && data.seoVisible !== false;
  }).length;
  const draft = buildImpactMonthlyDraft({
    month,
    dailyEvents,
    estimatedUsers: rawMonthly.estimatedUsers,
    activeCasesPublishedEndOfMonth: activeCases,
    timezone: timeZone,
    previousEvents: previousDraft.exists ? previousDraft.data()?.events as ImpactEvents : null,
  });
  const mismatchFields = Object.values(IMPACT_EVENT_FIELD_MAP).filter((field) => draft.events[field] !== rawMonthly.events[field]);
  const anomalies = [...draft.anomalies, ...mismatchFields.map((field) => `${field}_daily_raw_mismatch`)];
  await db.collection("impact_monthly_drafts").doc(month).set({
    ...draft,
    anomalies,
    aggregation: {
      ...draft.aggregation,
      lastAggregatedAt: admin.firestore.FieldValue.serverTimestamp(),
      rawMonthlyValidated: mismatchFields.length === 0,
    },
    review: {state: "draft", reviewedBy: null, reviewedAt: null, reason: null},
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});
  await ensureDataQualityIssues(db, month, anomalies);
};

export const aggregateImpactDaily = onSchedule({
  region: "asia-northeast3",
  schedule: "30 8 * * *",
  timeZone: "Asia/Seoul",
  timeoutSeconds: 540,
  memory: "512MiB",
  maxInstances: 1,
}, async () => {
  if (!aggregationEnabled.value()) {
    logger.info("Impact aggregation disabled; no BigQuery or Firestore work performed");
    return;
  }
  const db = admin.firestore();
  const runRef = db.collection("sync_runs").doc(`impact_${Date.now()}`);
  const startedAt = admin.firestore.Timestamp.now();
  const timeZone = impactTimeZone.value();
  const rebuiltDays = [3, 2, 1].map((days) => dateKeyDaysAgoInTimeZone(days, timeZone));
  const affectedMonths = [...new Set(rebuiltDays.map((dateKey) => dateKey.slice(0, 7)))];
  const bigQuery = new BigQuery();
  await runRef.set({type: "impact_aggregation", trigger: "scheduled", status: "running", startedAt, rebuiltDays});
  try {
    for (const dateKey of rebuiltDays) await aggregateOneDay(db, bigQuery, dateKey, timeZone);
    for (const month of affectedMonths) await rebuildMonthlyDraft(db, bigQuery, month, timeZone);
    await runRef.set({status: "success", completedAt: admin.firestore.FieldValue.serverTimestamp(), rebuiltMonths: affectedMonths, counts: {receivedRows: rebuiltDays.length, created: 0, updated: rebuiltDays.length, unchanged: 0, failed: 0}}, {merge: true});
  } catch (error) {
    logger.error("Impact aggregation failed", {rebuiltDays, errorCode: error instanceof Error ? error.name : "unknown"});
    await runRef.set({status: "failed", completedAt: admin.firestore.FieldValue.serverTimestamp(), error: {code: error instanceof Error ? error.name : "unknown", message: error instanceof Error ? error.message.slice(0, 500) : "Unknown error"}}, {merge: true});
    throw error;
  }
});
