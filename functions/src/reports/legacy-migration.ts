import * as crypto from "crypto";
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import type {Firestore} from "firebase-admin/firestore";

export const LEGACY_REPORT_MIGRATION_VERSION = 1;

type LegacyRecord = Record<string, any>;

export interface LegacyMigrationProjection {
  destinationId: string;
  sourceHash: string;
  report: Record<string, unknown>;
  contact: {phone?: string; email?: string} | null;
  quarantineReasons: string[];
}

export interface LegacyMigrationSummary {
  runId: string;
  mode: "dry-run" | "apply" | "verify" | "rollback";
  scanned: number;
  created: number;
  unchanged: number;
  quarantined: number;
  conflicts: number;
  rolledBack: number;
  protected: number;
  checksum: string;
}

const cleanText = (value: unknown, max: number): string => typeof value === "string"
  ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
  : "";

const canonicalize = (value: any): any => {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value?.toMillis === "function") return {__timestampMillis: value.toMillis()};
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalize(value[key]);
    return result;
  }, {} as Record<string, unknown>);
  return value;
};

export const hashLegacyRecord = (legacyId: string, data: LegacyRecord): string => crypto
  .createHash("sha256")
  .update(JSON.stringify({legacyId, data: canonicalize(data)}))
  .digest("hex");

export const legacyDestinationId = (legacyId: string): string => `legacy_${crypto
  .createHash("sha256")
  .update(legacyId)
  .digest("hex")
  .slice(0, 32)}`;

const toTimestamp = (value: unknown, fallback: Timestamp): Timestamp => {
  if (value instanceof Timestamp) return value;
  if (value && typeof (value as any).toDate === "function") {
    const date = (value as any).toDate();
    if (date instanceof Date && Number.isFinite(date.getTime())) return Timestamp.fromDate(date);
  }
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? Timestamp.fromDate(date) : fallback;
};

export const projectLegacyReport = (
  legacyId: string,
  data: LegacyRecord,
  now = Timestamp.now(),
  runId = "preview",
): LegacyMigrationProjection => {
  const location = data.location && typeof data.location === "object" ? data.location : {};
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  const address = cleanText(location.address, 300);
  const ownerUid = cleanText(data.reportedBy?.uid, 128);
  const phone = cleanText(data.reportedBy?.phoneNumber, 30);
  const email = cleanText(data.reportedBy?.email, 200).toLowerCase();
  const quarantineReasons = ["case_link_required"];
  if (!ownerUid) quarantineReasons.push("owner_link_required");
  if (!address || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39.5 || lng < 124 || lng > 132) quarantineReasons.push("invalid_location");
  if (Math.abs(lat - 37.5665) < 0.000001 && Math.abs(lng - 126.9780) < 0.000001) quarantineReasons.push("suspected_default_coordinate");
  if (phone || email) quarantineReasons.push("encrypted_contact_review_required");
  const sourceHash = hashLegacyRecord(legacyId, data);
  const destinationId = legacyDestinationId(legacyId);
  const occurredAt = toTimestamp(data.missingDate || data.createdAt, now);
  const createdAt = toTimestamp(data.createdAt, now);
  const rawText = cleanText(data.description, 2000) || "레거시 제보에서 이관된 추가 설명이 없습니다.";

  return {
    destinationId,
    sourceHash,
    contact: phone || email ? {phone: phone || undefined, email: email || undefined} : null,
    quarantineReasons,
    report: {
      legacyReportId: legacyId,
      ownerUid: ownerUid || null,
      caseId: null,
      reportType: "new_case_lead",
      occurredAt,
      exactLocation: Number.isFinite(lat) && Number.isFinite(lng) ? {address: address || "주소 검토 필요", lat, lng} : null,
      rawText,
      legacySubject: {
        name: cleanText(data.name, 100) || null,
        age: Number.isFinite(Number(data.age)) ? Number(data.age) : null,
        gender: cleanText(data.gender, 20) || null,
        type: cleanText(data.type, 50) || null,
      },
      status: "submitted",
      visibility: "private",
      version: 1,
      receiptNumber: `LEG-${sourceHash.slice(0, 12).toUpperCase()}`,
      mediaIds: [],
      migrationReviewRequired: quarantineReasons.length > 0,
      migrationReviewReasons: quarantineReasons,
      createdAt,
      updatedAt: now,
      migration: {
        version: LEGACY_REPORT_MIGRATION_VERSION,
        runId,
        sourceCollection: "missing_persons",
        sourceId: legacyId,
        sourceHash,
        migratedAt: now,
      },
    },
  };
};

const emptySummary = (runId: string, mode: LegacyMigrationSummary["mode"]): LegacyMigrationSummary => ({
  runId, mode, scanned: 0, created: 0, unchanged: 0, quarantined: 0,
  conflicts: 0, rolledBack: 0, protected: 0, checksum: "",
});

export const migrateLegacyReports = async (
  db: Firestore,
  options: {
    runId: string;
    mode: "dry-run" | "apply" | "verify";
    pageSize?: number;
    encryptContact?: (contact: Record<string, unknown>) => Promise<Record<string, unknown>>;
  },
): Promise<LegacyMigrationSummary> => {
  const summary = emptySummary(options.runId, options.mode);
  const aggregateHash = crypto.createHash("sha256");
  const pageSize = Math.min(500, Math.max(10, options.pageSize || 200));
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  const runRef = db.collection("migrationRuns").doc(options.runId);

  if (options.mode === "apply") {
    await runRef.set({type: "legacy_reports_v1", status: "running", startedAt: Timestamp.now()}, {merge: false});
  }

  do {
    let query = db.collection("missing_persons").orderBy(FieldPath.documentId()).limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const source of page.docs) {
      summary.scanned += 1;
      const projection = projectLegacyReport(source.id, source.data(), Timestamp.now(), options.runId);
      aggregateHash.update(`${source.id}:${projection.sourceHash}\n`);
      if (projection.quarantineReasons.length > 0) summary.quarantined += 1;
      const destinationRef = db.collection("sightingReports").doc(projection.destinationId);
      const existing = await destinationRef.get();
      if (existing.exists) {
        if (existing.data()?.migration?.sourceHash === projection.sourceHash) summary.unchanged += 1;
        else summary.conflicts += 1;
        continue;
      }
      if (options.mode !== "apply") {
        summary.created += 1;
        continue;
      }
      if (projection.contact && !options.encryptContact) {
        throw new Error(`CONTACT_KMS_REQUIRED:${source.id}`);
      }
      const encryptedContact = projection.contact && options.encryptContact
        ? await options.encryptContact(projection.contact)
        : null;
      await db.runTransaction(async (transaction) => {
        const check = await transaction.get(destinationRef);
        if (check.exists) return;
        transaction.create(destinationRef, projection.report);
        transaction.create(destinationRef.collection("statusHistory").doc(), {
          from: null, to: "submitted", actorType: "migration", runId: options.runId, createdAt: Timestamp.now(),
        });
        if (encryptedContact) transaction.create(destinationRef.collection("private").doc("contact"), encryptedContact);
        transaction.set(db.collection("migrationQuarantine").doc(projection.destinationId), {
          runId: options.runId,
          sourceCollection: "missing_persons",
          sourceIdHash: crypto.createHash("sha256").update(source.id).digest("hex"),
          destinationId: projection.destinationId,
          reasons: projection.quarantineReasons,
          status: "pending_review",
          createdAt: Timestamp.now(),
        }, {merge: false});
      });
      summary.created += 1;
    }
    cursor = page.docs.length === pageSize ? page.docs[page.docs.length - 1] : null;
  } while (cursor);

  summary.checksum = aggregateHash.digest("hex");
  if (options.mode === "apply") {
    await runRef.set({...summary, status: summary.conflicts === 0 ? "completed" : "completed_with_conflicts", completedAt: Timestamp.now()}, {merge: true});
  }
  return summary;
};

export const rollbackLegacyMigration = async (db: Firestore, runId: string): Promise<LegacyMigrationSummary> => {
  const summary = emptySummary(runId, "rollback");
  const snapshot = await db.collection("sightingReports").where("migration.runId", "==", runId).get();
  summary.scanned = snapshot.size;
  for (const report of snapshot.docs) {
    const data = report.data();
    const actions = await report.ref.collection("moderationActions").limit(1).get();
    if (data.status !== "submitted" || data.visibility !== "private" || data.version !== 1 || !actions.empty) {
      summary.protected += 1;
      continue;
    }
    await db.recursiveDelete(report.ref);
    await db.collection("migrationQuarantine").doc(report.id).delete().catch(() => undefined);
    summary.rolledBack += 1;
  }
  await db.collection("migrationRuns").doc(runId).set({rollback: summary, rollbackAt: Timestamp.now()}, {merge: true});
  return summary;
};
