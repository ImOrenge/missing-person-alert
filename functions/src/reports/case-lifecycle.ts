import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {loadReportingFeatureFlags} from "../runtimeConfig";

const CLOSED_STATUSES = new Set(["found", "closed", "private"]);

export const enforceClosedCasePolicy = onDocumentWritten({
  region: "asia-northeast3",
  document: "missingPersons/{caseId}",
}, async (event) => {
  const beforeStatus = event.data?.before.data()?.status;
  const afterStatus = event.data?.after.data()?.status;
  const caseId = event.params.caseId;
  if (!CLOSED_STATUSES.has(afterStatus) || beforeStatus === afterStatus) return;
  const db = admin.firestore();
  const notificationsEnabled = (await loadReportingFeatureFlags(db).catch(() => null))?.reports_notifications_enabled === true;
  const [publicReports, privateReports, subscriptions] = await Promise.all([
    db.collection("publicReports").where("caseId", "==", caseId).limit(500).get(),
    db.collection("sightingReports").where("caseId", "==", caseId).limit(500).get(),
    db.collection("notificationSubscriptions").where("caseIds", "array-contains", caseId).limit(500).get(),
  ]);
  const now = Timestamp.now();
  const batch = db.batch();
  publicReports.docs.forEach((document) => batch.delete(document.ref));
  privateReports.docs.forEach((document) => batch.update(document.ref, {
    visibility: "private",
    updatedAt: now,
    retentionReviewAt: Timestamp.fromMillis(now.toMillis() + 90 * 24 * 60 * 60_000),
    purgeAfter: Timestamp.fromMillis(now.toMillis() + 90 * 24 * 60 * 60_000),
  }));
  subscriptions.docs.forEach((document) => batch.update(document.ref, {
    caseIds: FieldValue.arrayRemove(caseId),
    updatedAt: now,
  }));
  if (notificationsEnabled) {
    const eventRef = db.collection("notificationEvents").doc(`case-closed-${caseId}-${afterStatus}`);
    batch.set(eventRef, {
      eventId: eventRef.id,
      type: afterStatus === "found" ? "case_found" : "case_closed",
      caseId,
      targetUserIds: subscriptions.docs.map((document) => document.id),
      status: "pending",
      createdAt: now,
    }, {merge: false});
  }
  await batch.commit();
  const bucket = admin.storage().bucket();
  await Promise.all(publicReports.docs.map((document) => bucket.deleteFiles({prefix: `report-public/${document.id}/`, force: true})));
});
