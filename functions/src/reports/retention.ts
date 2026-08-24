import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import {FieldValue} from "firebase-admin/firestore";
import * as crypto from "crypto";

const deleteQueryBatch = async (query: FirebaseFirestore.Query, limit = 200): Promise<number> => {
  const snapshot = await query.limit(limit).get();
  if (snapshot.empty) return 0;
  const batch = admin.firestore().batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
  return snapshot.size;
};

export const purgeExpiredReports = async (
  db: FirebaseFirestore.Firestore,
  now = Timestamp.now(),
): Promise<{purged: number; deferred: number}> => {
  let purged = 0;
  let deferred = 0;
  const expiredReports = await db.collection("sightingReports").where("purgeAfter", "<=", now).limit(100).get();
  for (const report of expiredReports.docs) {
    const data = report.data();
    if (data.legalHold === true) {
      await report.ref.set({retentionReviewAt: Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60_000)}, {merge: true});
      deferred += 1;
      continue;
    }
    const ownerUid = typeof data.ownerUid === "string" ? data.ownerUid : "";
    const mediaDraftId = typeof data.mediaDraftId === "string" ? data.mediaDraftId : "";
    const publicReportRef = db.collection("publicReports").doc(report.id);
    const publicReportSnapshot = await publicReportRef.get();
    if (ownerUid && mediaDraftId) {
      const bucket = admin.storage().bucket();
      await Promise.all([
        bucket.deleteFiles({prefix: `report-private/${ownerUid}/drafts/${mediaDraftId}/`, force: true}),
        bucket.deleteFiles({prefix: `report-private/${ownerUid}/normalized/${mediaDraftId}/`, force: true}),
      ]);
      await db.recursiveDelete(db.collection("reportMediaDrafts").doc(mediaDraftId));
    }
    if (publicReportSnapshot.exists) await admin.storage().bucket().deleteFiles({prefix: `report-public/${report.id}/`, force: true});
    await publicReportRef.delete();
    await report.ref.collection("private").doc("contact").delete().catch(() => undefined);
    const [forwarding, actions, additionalInformation] = await Promise.all([
      report.ref.collection("agencyForwarding").limit(100).get(),
      report.ref.collection("moderationActions").limit(200).get(),
      report.ref.collection("additionalInformation").limit(200).get(),
    ]);
    const auditBatch = db.batch();
    forwarding.docs.forEach((document) => auditBatch.delete(document.ref));
    additionalInformation.docs.forEach((document) => auditBatch.delete(document.ref));
    actions.docs.forEach((document) => {
      const action = document.data();
      const sensitiveReference = typeof action.externalReceiptNumber === "string"
        ? action.externalReceiptNumber
        : typeof action.confirmationReference === "string" ? action.confirmationReference : "";
      if (sensitiveReference) auditBatch.update(document.ref, {
        sensitiveReferenceHash: crypto.createHash("sha256").update(sensitiveReference).digest("hex").slice(0, 24),
        externalReceiptNumber: FieldValue.delete(), confirmationReference: FieldValue.delete(), redactedAt: now,
      });
    });
    if (!forwarding.empty || !additionalInformation.empty || actions.docs.some((document) => document.data().externalReceiptNumber || document.data().confirmationReference)) await auditBatch.commit();
    await report.ref.set({
      ownerUidHash: ownerUid ? crypto.createHash("sha256").update(ownerUid).digest("hex").slice(0, 24) : null,
      ownerUid: FieldValue.delete(), exactLocation: FieldValue.delete(), rawText: FieldValue.delete(),
      mediaIds: FieldValue.delete(), mediaDraftId: FieldValue.delete(), legacySubject: FieldValue.delete(),
      migrationReviewReasons: FieldValue.delete(), ownerRequest: FieldValue.delete(), consent: FieldValue.delete(), purgeAfter: FieldValue.delete(),
      sensitiveDataAvailable: false, privacyPurgedAt: now, updatedAt: now,
    }, {merge: true});
    purged += 1;
  }
  return {purged, deferred};
};

export const enforceReportRetention = onSchedule({
  region: "asia-northeast3",
  schedule: "every day 03:35",
  timeZone: "Asia/Seoul",
  timeoutSeconds: 540,
  memory: "512MiB",
}, async () => {
  const db = admin.firestore();
  const now = Timestamp.now();
  await purgeExpiredReports(db, now);

  await deleteQueryBatch(db.collection("reportSubmissionKeys").where("expiresAt", "<=", now));
  await deleteQueryBatch(db.collection("reportRateLimits").where("expiresAt", "<=", now));
  const auditCutoff = Timestamp.fromMillis(now.toMillis() - 365 * 24 * 60 * 60_000);
  await deleteQueryBatch(db.collection("privacyAuditLogs").where("createdAt", "<=", auditCutoff));
});
