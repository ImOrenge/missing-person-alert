import {randomUUID} from "node:crypto";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {parseAndNormalizeStatistics, sha256} from "./normalize";
import type {StatisticsIngestResult} from "./types";
import type {PublicDataRole} from "../publicDataRoles";

const SOURCE_ID = "police_missing_statistics";
const LOCK_ID = "police_missing_statistics";

const acquireLease = async (db: admin.firestore.Firestore, runId: string): Promise<boolean> => {
  const lockRef = db.collection("sync_locks").doc(LOCK_ID);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lockRef);
    const expiresAt = snapshot.data()?.expiresAt;
    if (expiresAt?.toMillis && expiresAt.toMillis() > Date.now()) return false;
    transaction.set(lockRef, {
      ownerRunId: runId,
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
    return true;
  });
};

const releaseLease = async (db: admin.firestore.Firestore, runId: string): Promise<void> => {
  const lockRef = db.collection("sync_locks").doc(LOCK_ID);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lockRef);
    if (snapshot.data()?.ownerRunId === runId) transaction.delete(lockRef);
  });
};

export const ingestStatisticsBuffer = async (input: {
  buffer: Buffer;
  encoding: string;
  trigger: "manual_admin" | "scheduled";
  actorUid?: string;
  dryRun?: boolean;
  datasetCutoff?: string | null;
  officialPageUrl?: string | null;
  reason?: string | null;
  actorRole?: PublicDataRole | null;
}): Promise<StatisticsIngestResult> => {
  const db = admin.firestore();
  const runId = `stats_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const sourceHash = sha256(input.buffer);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const date = new Date();
  const storagePath = `raw/police/statistics/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${timestamp}-${sourceHash.slice(0, 12)}.csv`;
  const rows = parseAndNormalizeStatistics({
    buffer: input.buffer,
    encoding: input.encoding,
    sourceHash,
    datasetCutoff: input.datasetCutoff,
    officialPageUrl: input.officialPageUrl,
  });
  const refs = rows.map((row) => db.collection("statistics_yearly").doc(String(row.year)));
  const existing = refs.length ? await db.getAll(...refs) : [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  rows.forEach((row, index) => {
    if (!existing[index]?.exists) created += 1;
    else if (existing[index]?.data()?.source?.sourceHash === sourceHash) unchanged += 1;
    else updated += 1;
  });

  const warnings: string[] = [];
  rows.forEach((current, index) => {
    const previous = rows[index - 1];
    if (!previous || current.year !== previous.year + 1) return;
    const comparisons: Array<[string, number, number]> = [
      ["total_received", current.totals.received, previous.totals.received],
      ["total_unresolved", current.totals.unresolved, previous.totals.unresolved],
      ...(["children", "disabled", "dementia", "adult"] as const).map((key): [string, number, number] => [`${key}_received`, current.categories[key].received, previous.categories[key].received]),
    ];
    comparisons.forEach(([key, currentValue, previousValue]) => {
      if (previousValue > 0 && Math.abs((currentValue - previousValue) / previousValue) >= 0.5) {
        warnings.push(`${current.year}_${key}_changed_over_50_percent`);
      }
    });
  });
  const publishedSnapshot = await db.collection("statistics_yearly").where("published", "==", true).get();
  const importedYears = new Set(rows.map((row) => row.year));
  publishedSnapshot.docs.forEach((doc) => {
    const knownYear = Number(doc.data().year || doc.id);
    if (Number.isInteger(knownYear) && !importedYears.has(knownYear)) warnings.push(`${knownYear}_missing_from_latest_source`);
  });

  if (input.dryRun !== false) {
    return {runId, sourceHash, status: "dry_run", years: rows.map((row) => row.year), created, updated, unchanged, warnings};
  }

  const leaseAcquired = await acquireLease(db, runId);
  if (!leaseAcquired) throw new Error("Another statistics sync is already running");
  const runRef = db.collection("sync_runs").doc(runId);
  const auditRef = db.collection("admin_audit_logs").doc();
  try {
    await runRef.set({
      type: "police_statistics", trigger: input.trigger, status: "running",
      actorUid: input.actorUid || null, sourceHash,
      startedAt: admin.firestore.FieldValue.serverTimestamp(), completedAt: null,
    });
    const sourceRef = db.collection("data_sources").doc(SOURCE_ID);
    const sourceSnapshot = await sourceRef.get();
    if (sourceSnapshot.data()?.lastHash === sourceHash) {
      const unchangedBatch = db.batch();
      unchangedBatch.set(runRef, {status: "unchanged", completedAt: admin.firestore.FieldValue.serverTimestamp(), counts: {receivedRows: rows.length, created: 0, updated: 0, unchanged: rows.length, failed: 0}}, {merge: true});
      unchangedBatch.set(auditRef, {actorUid: input.actorUid || null, actorRole: input.actorRole || "operator", action: "statistics.import_unchanged", target: `data_sources/${SOURCE_ID}`, before: {sourceHashPrefix: sourceHash.slice(0, 12)}, after: {sourceHashPrefix: sourceHash.slice(0, 12)}, reason: input.reason || "동일 원본 재확인", createdAt: admin.firestore.FieldValue.serverTimestamp()});
      await unchangedBatch.commit();
      return {runId, sourceHash, status: "unchanged", years: rows.map((row) => row.year), created: 0, updated: 0, unchanged: rows.length, warnings};
    }

    await admin.storage().bucket().file(storagePath).save(input.buffer, {
      metadata: {contentType: "text/csv", metadata: {sourceId: SOURCE_ID, sourceHash, encoding: input.encoding, runId, datasetCutoff: input.datasetCutoff || ""}},
    });

    const batch = db.batch();
    rows.forEach((row, index) => batch.set(refs[index], {...row, updatedAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true}));
    batch.set(sourceRef, {
      title: rows[0].source.datasetTitle, agency: "경찰청", sourceType: input.trigger === "scheduled" ? "http_csv" : "manual_csv",
      encoding: input.encoding, enabled: true, lastHash: sourceHash, lastSuccessfulRunId: runId,
      lastCheckedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
    batch.set(db.collection("public_sources").doc(SOURCE_ID), {
      title: rows[0].source.datasetTitle, agency: "경찰청", officialPageUrl: input.officialPageUrl || null,
      datasetCutoff: input.datasetCutoff || null, lastVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      processing: ["인코딩 변환", "분류 합계", "일평균", "전년 대비"], published: true,
    }, {merge: true});
    batch.set(runRef, {
      status: "success", completedAt: admin.firestore.FieldValue.serverTimestamp(), storagePath,
      counts: {receivedRows: rows.length, created, updated, unchanged, failed: 0}, warnings,
    }, {merge: true});
    batch.set(auditRef, {
      actorUid: input.actorUid || null,
      actorRole: input.actorRole || "operator",
      action: "statistics.import",
      target: `data_sources/${SOURCE_ID}`,
      before: {sourceHashPrefix: typeof sourceSnapshot.data()?.lastHash === "string" ? sourceSnapshot.data()!.lastHash.slice(0, 12) : null},
      after: {sourceHashPrefix: sourceHash.slice(0, 12), years: rows.map((row) => row.year)},
      reason: input.reason || "공식 통계 import",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();
    for (const warning of warnings) {
      const issueRef = db.collection("data_quality_issues").doc(`statistics_${warning}`);
      const issue = await issueRef.get();
      if (!issue.exists) await issueRef.set({type: warning.includes("missing_from_latest_source") ? "missing_year" : "large_delta", status: "open", severity: "warning", sourceId: SOURCE_ID, target: `statistics_yearly`, code: warning, assignedTo: null, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp()});
    }
    return {runId, sourceHash, storagePath, status: "success", years: rows.map((row) => row.year), created, updated, unchanged, warnings};
  } catch (error) {
    logger.error("Statistics ingest failed", {runId, errorCode: error instanceof Error ? error.name : "unknown"});
    await runRef.set({
      status: "failed", completedAt: admin.firestore.FieldValue.serverTimestamp(),
      error: {code: error instanceof Error ? error.name : "unknown", message: error instanceof Error ? error.message.slice(0, 500) : "Unknown error"},
    }, {merge: true}).catch(() => undefined);
    throw error;
  } finally {
    await releaseLease(db, runId);
  }
};
