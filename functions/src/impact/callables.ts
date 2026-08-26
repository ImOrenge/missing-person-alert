import * as admin from "firebase-admin";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {getHighestPublicDataRole, hasPublicDataRole} from "../publicDataRoles";
import {projectPublicImpactMonth} from "./model";

const callableOptions = {region: "asia-northeast3", enforceAppCheck: true, timeoutSeconds: 60, memory: "256MiB" as const, maxInstances: 2};

const requireReason = (value: unknown): string => {
  const reason = String(value || "").trim();
  if (reason.length < 3 || reason.length > 500) throw new HttpsError("invalid-argument", "reason must be 3-500 characters");
  return reason;
};

const requireMonth = (value: unknown): string => {
  const month = String(value || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpsError("invalid-argument", "month must be YYYY-MM");
  return month;
};

const claims = (request: {auth?: {token?: unknown} | null}): Record<string, unknown> =>
  (request.auth?.token || {}) as Record<string, unknown>;

export const publishImpactMonth = onCall(callableOptions, async (request) => {
  if (!request.auth || !hasPublicDataRole(claims(request), ["admin"])) throw new HttpsError("permission-denied", "Public data admin permission required");
  const month = requireMonth(request.data?.month);
  const reason = requireReason(request.data?.reason);
  const db = admin.firestore();
  const draftRef = db.collection("impact_monthly_drafts").doc(month);
  const publicRef = db.collection("impact_monthly").doc(month);
  const auditRef = db.collection("admin_audit_logs").doc();

  await db.runTransaction(async (transaction) => {
    const [draftSnapshot, existingPublic] = await Promise.all([transaction.get(draftRef), transaction.get(publicRef)]);
    if (!draftSnapshot.exists) throw new HttpsError("not-found", "Impact draft not found");
    const draft = draftSnapshot.data() || {};
    if (!draft.events || !draft.aggregation || draft.aggregation.rawMonthlyValidated !== true) throw new HttpsError("failed-precondition", "Impact draft has not passed raw-count validation");
    const candidate = {
      month,
      events: draft.events,
      estimatedUsers: Number(draft.estimatedUsers || 0),
      service: draft.service || {},
      rates: draft.rates || {},
      aggregation: {...draft.aggregation, lastAggregatedAt: draft.aggregation.lastAggregatedAt},
      review: {state: "approved", reviewedAt: admin.firestore.FieldValue.serverTimestamp()},
      published: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!projectPublicImpactMonth({...candidate, review: {state: "approved"}})) throw new HttpsError("failed-precondition", "Impact public projection is invalid");
    transaction.set(publicRef, candidate, {merge: false});
    transaction.set(draftRef, {review: {state: "approved", reviewedBy: request.auth!.uid, reviewedAt: admin.firestore.FieldValue.serverTimestamp(), reason}, updatedAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
    transaction.set(auditRef, {
      actorUid: request.auth!.uid,
      actorRole: getHighestPublicDataRole(claims(request)),
      action: "impact.publish",
      target: `impact_monthly/${month}`,
      before: {published: existingPublic.data()?.published === true},
      after: {published: true},
      reason,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  return {month, published: true};
});

export const rejectImpactMonth = onCall(callableOptions, async (request) => {
  if (!request.auth || !hasPublicDataRole(claims(request), ["admin"])) throw new HttpsError("permission-denied", "Public data admin permission required");
  const month = requireMonth(request.data?.month);
  const reason = requireReason(request.data?.reason);
  const db = admin.firestore();
  const draftRef = db.collection("impact_monthly_drafts").doc(month);
  const auditRef = db.collection("admin_audit_logs").doc();
  await db.runTransaction(async (transaction) => {
    const draft = await transaction.get(draftRef);
    if (!draft.exists) throw new HttpsError("not-found", "Impact draft not found");
    transaction.set(draftRef, {review: {state: "rejected", reviewedBy: request.auth!.uid, reviewedAt: admin.firestore.FieldValue.serverTimestamp(), reason}, published: false, updatedAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
    transaction.set(auditRef, {actorUid: request.auth!.uid, actorRole: getHighestPublicDataRole(claims(request)), action: "impact.reject", target: `impact_monthly_drafts/${month}`, before: {state: draft.data()?.review?.state || "draft"}, after: {state: "rejected"}, reason, createdAt: admin.firestore.FieldValue.serverTimestamp()});
  });
  return {month, rejected: true};
});

export const updateDataQualityIssue = onCall(callableOptions, async (request) => {
  if (!request.auth || !hasPublicDataRole(claims(request), ["admin", "operator"])) throw new HttpsError("permission-denied", "Public data operator permission required");
  const issueId = String(request.data?.issueId || "").trim();
  const status = String(request.data?.status || "");
  const reason = requireReason(request.data?.reason);
  if (!/^[A-Za-z0-9_-]{3,180}$/.test(issueId)) throw new HttpsError("invalid-argument", "invalid issueId");
  if (!["investigating", "resolved", "ignored"].includes(status)) throw new HttpsError("invalid-argument", "invalid issue status");
  const db = admin.firestore();
  const issueRef = db.collection("data_quality_issues").doc(issueId);
  const auditRef = db.collection("admin_audit_logs").doc();
  await db.runTransaction(async (transaction) => {
    const issue = await transaction.get(issueRef);
    if (!issue.exists) throw new HttpsError("not-found", "Data quality issue not found");
    const beforeStatus = issue.data()?.status || "open";
    transaction.set(issueRef, {
      status,
      assignedTo: request.auth!.uid,
      resolutionReason: reason,
      resolvedAt: status === "resolved" || status === "ignored" ? admin.firestore.FieldValue.serverTimestamp() : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
    transaction.set(auditRef, {actorUid: request.auth!.uid, actorRole: getHighestPublicDataRole(claims(request)), action: "data_quality.status_change", target: `data_quality_issues/${issueId}`, before: {status: beforeStatus}, after: {status}, reason, createdAt: admin.firestore.FieldValue.serverTimestamp()});
  });
  return {issueId, status};
});
