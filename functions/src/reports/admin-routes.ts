import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import * as crypto from "crypto";
import {Express, NextFunction, Request, Response} from "express";
import {decryptContact, EncryptedContactEnvelope} from "./contact-encryption";
import {loadReportingFeatureFlags} from "../runtimeConfig";
import {deriveRegionCode} from "../notifications/dispatcher";
import {geohashForLocation} from "geofire-common";

type AdminRole = "reportModerator" | "seniorModerator" | "agencyOperator" | "privacyOfficer" | "systemAdmin";
type AuthedRequest = Request & {user?: admin.auth.DecodedIdToken};
type Middleware = (req: any, res: Response, next: NextFunction) => unknown;

interface Dependencies { db: admin.firestore.Firestore; authenticate: Middleware; }

const hasRole = (user: admin.auth.DecodedIdToken | undefined, roles: AdminRole[]) =>
  !!user && roles.some((role) => (user as Record<string, unknown>)[role] === true);

const requireRoles = (roles: AdminRole[]): Middleware => (req: AuthedRequest, res, next) => {
  if (!hasRole(req.user, roles)) return res.status(403).json({success: false, error: "ADMIN_ROLE_REQUIRED"});
  return next();
};

const actorHash = (uid: string) => crypto.createHash("sha256").update(uid).digest("hex").slice(0, 24);
const cleanText = (value: unknown, max: number) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const containsPublicSensitiveText = (value: string): boolean =>
  /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value) ||
  /(?:^|\D)(?:01[016789]|02|0[3-6][1-5])[- ]?\d{3,4}[- ]?\d{4}(?:\D|$)/.test(value) ||
  /(?:^|\D)\d{6}-?[1-4]\d{6}(?:\D|$)/.test(value);

const audit = async (db: admin.firestore.Firestore, input: {event: string; actorUid: string; reportId: string; purpose?: string}) => {
  await db.collection("privacyAuditLogs").add({
    event: input.event,
    actorUidHash: actorHash(input.actorUid),
    reportId: input.reportId,
    purpose: input.purpose || null,
    createdAt: FieldValue.serverTimestamp(),
  });
};

const haversineMeters = (a: {lat: number; lng: number}, b: {lat: number; lng: number}) => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export const derivePublicLocation = (reportId: string, exact: {lat: number; lng: number}, radiusM: number) => {
  const radius = Math.min(20_000, Math.max(500, radiusM));
  const seed = crypto.createHash("sha256").update(`public-location:${reportId}`).digest();
  const angle = seed.readUInt32BE(0) / 0xffffffff * Math.PI * 2;
  const distance = radius * (0.65 + (seed.readUInt16BE(4) / 0xffff) * 0.2);
  const lat = exact.lat + (Math.cos(angle) * distance) / 111_320;
  const lngScale = Math.max(0.2, Math.cos(exact.lat * Math.PI / 180));
  const lng = exact.lng + (Math.sin(angle) * distance) / (111_320 * lngScale);
  return {lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6))};
};

export const registerAdminReportRoutes = (app: Express, dependencies: Dependencies): void => {
  const {db, authenticate} = dependencies;
  const privateNoStore: Middleware = (_req, res, next) => {
    res.set({
      "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Vary": "Authorization",
    });
    return next();
  };
  app.use("/api/v2/admin/reports", privateNoStore);
  const reportReader = requireRoles(["reportModerator", "seniorModerator", "privacyOfficer", "agencyOperator"]);
  const reviewer = requireRoles(["reportModerator", "seniorModerator"]);
  const senior = requireRoles(["seniorModerator"]);
  const requireAdminMutations: Middleware = async (_req, res, next) => {
    try {
      const flags = await loadReportingFeatureFlags(db);
      if (!flags.reports_admin_enabled) return res.status(404).json({success: false, error: "REPORT_ADMIN_MUTATIONS_DISABLED"});
      return next();
    } catch {
      return res.status(503).json({success: false, error: "RUNTIME_CONFIG_UNAVAILABLE"});
    }
  };

  app.get("/api/v2/admin/reports", authenticate, reportReader, async (req: AuthedRequest, res: Response) => {
    const status = cleanText(req.query.status, 40) || "submitted";
    const allowedStatuses = ["submitted", "triage", "needs_information", "approved", "forwarded", "confirmed", "rejected", "duplicate", "withdrawn", "archived"];
    if (!allowedStatuses.includes(status)) return res.status(400).json({success: false, error: "INVALID_STATUS"});
    try {
      const snapshot = await db.collection("sightingReports").where("status", "==", status).orderBy("updatedAt", "desc").limit(100).get();
      const reports = snapshot.docs.map((document) => {
        const data = document.data();
        return {
          reportId: document.id, receiptNumber: data.receiptNumber, caseId: data.caseId || null,
          reportType: data.reportType, occurredAt: data.occurredAt, status: data.status,
          version: data.version, hasMedia: Array.isArray(data.mediaIds) && data.mediaIds.length > 0,
          locationLabel: cleanText(data.exactLocation?.address, 200), updatedAt: data.updatedAt?.toDate?.().toISOString(),
        };
      });
      return res.json({success: true, reports});
    } catch {
      return res.status(500).json({success: false, error: "ADMIN_REPORT_LIST_FAILED"});
    }
  });

  app.get("/api/v2/admin/reports/:reportId", authenticate, reportReader, async (req: AuthedRequest, res: Response) => {
    const purpose = cleanText(req.header("x-access-purpose"), 80);
    if (!["moderation_review", "agency_forwarding", "privacy_investigation"].includes(purpose)) return res.status(400).json({success: false, error: "ACCESS_PURPOSE_REQUIRED"});
    const snapshot = await db.collection("sightingReports").doc(req.params.reportId).get();
    if (!snapshot.exists) return res.status(404).json({success: false, error: "REPORT_NOT_FOUND"});
    await audit(db, {event: "report_raw_viewed", actorUid: req.user!.uid, reportId: snapshot.id, purpose});
    const data = snapshot.data()!;
    const [mediaSnapshot, additionalInformationSnapshot] = await Promise.all([
      data.mediaDraftId
        ? db.collection("reportMediaDrafts").doc(String(data.mediaDraftId)).collection("media").limit(5).get()
        : Promise.resolve(null),
      snapshot.ref.collection("additionalInformation").orderBy("createdAt", "desc").limit(10).get(),
    ]);
    return res.json({success: true, report: {
      reportId: snapshot.id, receiptNumber: data.receiptNumber, caseId: data.caseId, reportType: data.reportType,
      occurredAt: data.occurredAt, exactLocation: data.exactLocation, rawText: data.rawText,
      mediaIds: data.mediaIds || [], media: mediaSnapshot?.docs.filter((item) => (data.mediaIds || []).includes(item.id)).map((item) => ({mediaId: item.id, status: item.data().scanStatus, exifStripped: item.data().exifStripped === true, manualMaskConfirmed: item.data().manualMaskConfirmed === true})) || [], status: data.status, visibility: data.visibility, version: data.version,
      additionalInformation: additionalInformationSnapshot.docs.map((document) => ({
        message: cleanText(document.data().message, 1000),
        createdAt: document.data().createdAt?.toDate?.().toISOString(),
      })),
      createdAt: data.createdAt?.toDate?.().toISOString(), updatedAt: data.updatedAt?.toDate?.().toISOString(),
    }});
  });

  app.post("/api/v2/admin/reports/:reportId/media/:mediaId/approve", authenticate, senior, requireAdminMutations, async (req: AuthedRequest, res: Response) => {
    const expectedVersion = Number(req.body?.expectedVersion);
    const reviewNote = cleanText(req.body?.reviewNote, 300);
    if (!Number.isInteger(expectedVersion) || reviewNote.length < 10) return res.status(400).json({success: false, error: "MEDIA_REVIEW_NOTE_REQUIRED"});
    const reportRef = db.collection("sightingReports").doc(req.params.reportId);
    try {
      await db.runTransaction(async (transaction) => {
        const reportSnapshot = await transaction.get(reportRef);
        const report = reportSnapshot.data();
        if (!reportSnapshot.exists) throw new Error("REPORT_NOT_FOUND");
        if (report?.version !== expectedVersion) throw new Error("REVIEW_CONFLICT");
        if (!["submitted", "triage", "needs_information"].includes(report?.status)) throw new Error("INVALID_STATUS_TRANSITION");
        if (!Array.isArray(report?.mediaIds) || !report.mediaIds.includes(req.params.mediaId) || !report?.mediaDraftId) throw new Error("MEDIA_NOT_FOUND");
        const mediaRef = db.collection("reportMediaDrafts").doc(String(report.mediaDraftId)).collection("media").doc(req.params.mediaId);
        const mediaSnapshot = await transaction.get(mediaRef);
        const media = mediaSnapshot.data();
        if (!mediaSnapshot.exists || media?.ownerUid !== report.ownerUid || media?.scanStatus !== "normalized" || media?.exifStripped !== true) throw new Error("MEDIA_NOT_READY");
        const now = Timestamp.now();
        transaction.update(mediaRef, {scanStatus: "approved", manualMaskConfirmed: true, reviewNote, reviewerUidHash: actorHash(req.user!.uid), reviewedAt: now});
        transaction.update(reportRef, {version: expectedVersion + 1, updatedAt: now});
        transaction.create(reportRef.collection("moderationActions").doc(), {action: "media_approved", mediaId: req.params.mediaId, reviewNote, actorUidHash: actorHash(req.user!.uid), createdAt: now});
      });
      await audit(db, {event: "report_media_approved", actorUid: req.user!.uid, reportId: reportRef.id});
      return res.json({success: true, version: expectedVersion + 1});
    } catch (error: any) {
      const statusCode = error?.message === "REVIEW_CONFLICT" ? 409 : ["REPORT_NOT_FOUND", "MEDIA_NOT_FOUND"].includes(error?.message) ? 404 : 422;
      return res.status(statusCode).json({success: false, error: error?.message || "MEDIA_APPROVAL_FAILED"});
    }
  });

  app.post("/api/v2/admin/reports/:reportId/contact", authenticate, requireRoles(["privacyOfficer", "agencyOperator"]), requireAdminMutations, async (req: AuthedRequest, res: Response) => {
    const purpose = cleanText(req.body?.purpose, 80);
    if (!["agency_callback", "identity_verification", "legal_request"].includes(purpose)) return res.status(400).json({success: false, error: "CONTACT_PURPOSE_REQUIRED"});
    const contactSnapshot = await db.collection("sightingReports").doc(req.params.reportId).collection("private").doc("contact").get();
    if (!contactSnapshot.exists) return res.status(404).json({success: false, error: "CONTACT_NOT_AVAILABLE"});
    try {
      const contact = await decryptContact(contactSnapshot.data() as EncryptedContactEnvelope);
      await audit(db, {event: "report_contact_decrypted", actorUid: req.user!.uid, reportId: req.params.reportId, purpose});
      res.set("Cache-Control", "no-store");
      return res.json({success: true, contact});
    } catch {
      return res.status(503).json({success: false, error: "CONTACT_DECRYPTION_FAILED"});
    }
  });

  app.post("/api/v2/admin/reports/:reportId/needs-information", authenticate, reviewer, requireAdminMutations, async (req: AuthedRequest, res: Response) => {
    const expectedVersion = Number(req.body?.expectedVersion);
    const requestMessage = cleanText(req.body?.requestMessage, 500);
    if (!Number.isInteger(expectedVersion) || requestMessage.length < 10) return res.status(400).json({success: false, error: "INVALID_REVIEW_INPUT"});
    const reportRef = db.collection("sightingReports").doc(req.params.reportId);
    const notificationsEnabled = (await loadReportingFeatureFlags(db).catch(() => null))?.reports_notifications_enabled === true;
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reportRef);
        const data = snapshot.data();
        if (!snapshot.exists) throw new Error("REPORT_NOT_FOUND");
        if (data?.version !== expectedVersion) throw new Error("REVIEW_CONFLICT");
        if (!["submitted", "triage"].includes(data?.status)) throw new Error("INVALID_STATUS_TRANSITION");
        const now = Timestamp.now();
        transaction.update(reportRef, {status: "needs_information", version: expectedVersion + 1, updatedAt: now, ownerRequest: {message: requestMessage, requestedAt: now}});
        transaction.create(reportRef.collection("statusHistory").doc(), {from: data?.status, to: "needs_information", actorType: "admin", actorUidHash: actorHash(req.user!.uid), createdAt: now});
        transaction.create(reportRef.collection("moderationActions").doc(), {action: "needs_information", requestMessage, actorUidHash: actorHash(req.user!.uid), createdAt: now});
        if (notificationsEnabled) {
          transaction.set(db.collection("notificationEvents").doc(`report-needs-information-${reportRef.id}-${expectedVersion + 1}`), {eventId: `report-needs-information-${reportRef.id}-${expectedVersion + 1}`, type: "report_needs_information", reportId: reportRef.id, ownerUid: data?.ownerUid, status: "pending", createdAt: now});
        }
      });
      return res.json({success: true});
    } catch (error: any) {
      const statusCode = error?.message === "REVIEW_CONFLICT" ? 409 : error?.message === "REPORT_NOT_FOUND" ? 404 : 422;
      return res.status(statusCode).json({success: false, error: error?.message || "REVIEW_FAILED"});
    }
  });

  app.post("/api/v2/admin/reports/:reportId/start-review", authenticate, reviewer, requireAdminMutations, async (req: AuthedRequest, res: Response) => {
    const expectedVersion = Number(req.body?.expectedVersion);
    if (!Number.isInteger(expectedVersion)) return res.status(400).json({success: false, error: "INVALID_REVIEW_INPUT"});
    const reportRef = db.collection("sightingReports").doc(req.params.reportId);
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reportRef);
        const data = snapshot.data();
        if (!snapshot.exists) throw new Error("REPORT_NOT_FOUND");
        if (data?.version !== expectedVersion) throw new Error("REVIEW_CONFLICT");
        if (!["submitted", "needs_information"].includes(data?.status)) throw new Error("INVALID_STATUS_TRANSITION");
        const now = Timestamp.now();
        transaction.update(reportRef, {status: "triage", version: expectedVersion + 1, updatedAt: now, assignedReviewerUidHash: actorHash(req.user!.uid)});
        transaction.create(reportRef.collection("statusHistory").doc(), {from: data?.status, to: "triage", actorType: "admin", actorUidHash: actorHash(req.user!.uid), createdAt: now});
        transaction.create(reportRef.collection("moderationActions").doc(), {action: "review_started", actorUidHash: actorHash(req.user!.uid), createdAt: now});
      });
      await audit(db, {event: "report_review_started", actorUid: req.user!.uid, reportId: reportRef.id});
      return res.json({success: true, version: expectedVersion + 1, status: "triage"});
    } catch (error: any) {
      const statusCode = error?.message === "REVIEW_CONFLICT" ? 409 : error?.message === "REPORT_NOT_FOUND" ? 404 : 422;
      return res.status(statusCode).json({success: false, error: error?.message || "REVIEW_START_FAILED"});
    }
  });

  app.post("/api/v2/admin/reports/:reportId/reject", authenticate, reviewer, requireAdminMutations, async (req: AuthedRequest, res: Response) => {
    const expectedVersion = Number(req.body?.expectedVersion);
    const reason = cleanText(req.body?.reason, 500);
    if (!Number.isInteger(expectedVersion) || reason.length < 10) return res.status(400).json({success: false, error: "REJECTION_REASON_REQUIRED"});
    const reportRef = db.collection("sightingReports").doc(req.params.reportId);
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reportRef);
        const data = snapshot.data();
        if (!snapshot.exists) throw new Error("REPORT_NOT_FOUND");
        if (data?.version !== expectedVersion) throw new Error("REVIEW_CONFLICT");
        if (!["submitted", "triage", "needs_information"].includes(data?.status)) throw new Error("INVALID_STATUS_TRANSITION");
        const now = Timestamp.now();
        transaction.update(reportRef, {status: "rejected", visibility: "private", version: expectedVersion + 1, updatedAt: now, purgeAfter: Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60_000)});
        transaction.delete(db.collection("publicReports").doc(reportRef.id));
        transaction.create(reportRef.collection("statusHistory").doc(), {from: data?.status, to: "rejected", actorType: "admin", actorUidHash: actorHash(req.user!.uid), createdAt: now});
        transaction.create(reportRef.collection("moderationActions").doc(), {action: "rejected", reason, actorUidHash: actorHash(req.user!.uid), createdAt: now});
      });
      return res.json({success: true, version: expectedVersion + 1, status: "rejected"});
    } catch (error: any) {
      const statusCode = error?.message === "REVIEW_CONFLICT" ? 409 : error?.message === "REPORT_NOT_FOUND" ? 404 : 422;
      return res.status(statusCode).json({success: false, error: error?.message || "REJECTION_FAILED"});
    }
  });

  app.post("/api/v2/admin/reports/:reportId/duplicate", authenticate, senior, requireAdminMutations, async (req: AuthedRequest, res: Response) => {
    const expectedVersion = Number(req.body?.expectedVersion);
    const primaryReportId = cleanText(req.body?.primaryReportId, 200);
    const reason = cleanText(req.body?.reason, 500);
    if (!Number.isInteger(expectedVersion) || !/^[A-Za-z0-9_-]{8,200}$/.test(primaryReportId) || reason.length < 10 || primaryReportId === req.params.reportId) return res.status(400).json({success: false, error: "INVALID_DUPLICATE_INPUT"});
    const reportRef = db.collection("sightingReports").doc(req.params.reportId);
    const primaryRef = db.collection("sightingReports").doc(primaryReportId);
    try {
      await db.runTransaction(async (transaction) => {
        const [snapshot, primarySnapshot] = await Promise.all([transaction.get(reportRef), transaction.get(primaryRef)]);
        const data = snapshot.data();
        if (!snapshot.exists || !primarySnapshot.exists) throw new Error("REPORT_NOT_FOUND");
        if (data?.version !== expectedVersion) throw new Error("REVIEW_CONFLICT");
        if (!["submitted", "triage", "needs_information"].includes(data?.status)) throw new Error("INVALID_STATUS_TRANSITION");
        const now = Timestamp.now();
        transaction.update(reportRef, {status: "duplicate", visibility: "private", duplicateOfReportId: primaryReportId, version: expectedVersion + 1, updatedAt: now, purgeAfter: Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60_000)});
        transaction.delete(db.collection("publicReports").doc(reportRef.id));
        transaction.create(reportRef.collection("statusHistory").doc(), {from: data?.status, to: "duplicate", actorType: "admin", actorUidHash: actorHash(req.user!.uid), createdAt: now});
        transaction.create(reportRef.collection("moderationActions").doc(), {action: "merged", primaryReportId, reason, actorUidHash: actorHash(req.user!.uid), createdAt: now});
      });
      return res.json({success: true, version: expectedVersion + 1, status: "duplicate"});
    } catch (error: any) {
      const statusCode = error?.message === "REVIEW_CONFLICT" ? 409 : error?.message === "REPORT_NOT_FOUND" ? 404 : 422;
      return res.status(statusCode).json({success: false, error: error?.message || "DUPLICATE_MERGE_FAILED"});
    }
  });

  app.post("/api/v2/admin/reports/:reportId/approve", authenticate, senior, requireAdminMutations, async (req: AuthedRequest, res: Response) => {
    const expectedVersion = Number(req.body?.expectedVersion);
    const publicRadiusM = Number(req.body?.publicRadiusM);
    const approvedMediaIds = Array.isArray(req.body?.approvedMediaIds) ? req.body.approvedMediaIds.filter((item: unknown) => typeof item === "string").slice(0, 5) : [];
    if (!Number.isInteger(expectedVersion) || !Number.isFinite(publicRadiusM) || publicRadiusM < 500 || publicRadiusM > 20_000) return res.status(400).json({success: false, error: "INVALID_PUBLIC_PROJECTION"});
    const reportRef = db.collection("sightingReports").doc(req.params.reportId);
    const publicRef = db.collection("publicReports").doc(req.params.reportId);
    const notificationsEnabled = (await loadReportingFeatureFlags(db).catch(() => null))?.reports_notifications_enabled === true;
    const publicMedia: Array<{id: string; mediaType: "image"; url: string}> = [];
    const copiedPublicPaths: string[] = [];
    try {
      if (approvedMediaIds.length > 0) {
        const preflightReport = await reportRef.get();
        const preflightData = preflightReport.data();
        if (!preflightReport.exists) throw new Error("REPORT_NOT_FOUND");
        if (preflightData?.version !== expectedVersion) throw new Error("REVIEW_CONFLICT");
        if (!preflightData?.mediaDraftId || !preflightData?.ownerUid) throw new Error("INVALID_APPROVED_MEDIA");
        const mediaRefs = approvedMediaIds.map((id: string) => db.collection("reportMediaDrafts").doc(String(preflightData.mediaDraftId)).collection("media").doc(id));
        const mediaSnapshots = await db.getAll(...mediaRefs);
        const bucket = admin.storage().bucket();
        for (const [index, mediaSnapshot] of mediaSnapshots.entries()) {
          const media = mediaSnapshot.data();
          if (!mediaSnapshot.exists || media?.ownerUid !== preflightData.ownerUid || media?.scanStatus !== "approved" || media?.manualMaskConfirmed !== true || media?.exifStripped !== true || typeof media?.normalizedPath !== "string") throw new Error("APPROVED_MEDIA_NOT_READY");
          const id = approvedMediaIds[index];
          const destination = `report-public/${reportRef.id}/${id}/${expectedVersion + 1}.webp`;
          await bucket.file(media.normalizedPath).copy(bucket.file(destination));
          await bucket.file(destination).setMetadata({contentType: "image/webp", cacheControl: "public,max-age=31536000,immutable", metadata: {reportId: reportRef.id, mediaId: id, publicationRevision: String(expectedVersion + 1), exifStripped: "true"}});
          copiedPublicPaths.push(destination);
          publicMedia.push({id, mediaType: "image", url: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(destination)}?alt=media`});
        }
      }
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reportRef);
        const data = snapshot.data();
        if (!snapshot.exists) throw new Error("REPORT_NOT_FOUND");
        if (data?.version !== expectedVersion) throw new Error("REVIEW_CONFLICT");
        if (!["submitted", "triage", "needs_information"].includes(data?.status)) throw new Error("INVALID_STATUS_TRANSITION");
        const caseId = cleanText(data?.caseId, 200) || null;
        if (!caseId && data?.reportType !== "new_case_lead") throw new Error("CASE_REQUIRED_FOR_PUBLICATION");
        const publicDescription = cleanText(data.rawText, 2000);
        const publicLocationText = cleanText(data.exactLocation?.address, 300);
        if (publicDescription.length < 20 || publicLocationText.length < 3) throw new Error("PUBLIC_CONTENT_UNAVAILABLE");
        if (containsPublicSensitiveText(publicDescription)) throw new Error("PUBLIC_CONTENT_CONTAINS_SENSITIVE_TEXT");
        const regionCode = deriveRegionCode(publicLocationText);
        const exact = {lat: Number(data.exactLocation?.lat), lng: Number(data.exactLocation?.lng)};
        if (!Number.isFinite(exact.lat) || !Number.isFinite(exact.lng)) throw new Error("PUBLIC_LOCATION_UNAVAILABLE");
        const publicLocation = derivePublicLocation(reportRef.id, exact, publicRadiusM);
        if (haversineMeters(exact, publicLocation) < publicRadiusM * 0.6 || haversineMeters(exact, publicLocation) > publicRadiusM) throw new Error("PUBLIC_LOCATION_POLICY_FAILED");
        if (!approvedMediaIds.every((id: string) => (data.mediaIds || []).includes(id))) throw new Error("INVALID_APPROVED_MEDIA" );
        const now = Timestamp.now();
        const nextVersion = expectedVersion + 1;
        const standaloneExpiresAt = caseId ? null : Timestamp.fromMillis(now.toMillis() + 90 * 24 * 60 * 60_000);
        transaction.update(reportRef, {
          status: "approved", visibility: "public", version: nextVersion, updatedAt: now,
          ...(standaloneExpiresAt ? {retentionReviewAt: standaloneExpiresAt, purgeAfter: standaloneExpiresAt} : {}),
          ...(data.migrationReviewRequired ? {
            migrationReviewRequired: FieldValue.delete(),
            migrationReviewReasons: FieldValue.delete(),
          } : {}),
        });
        transaction.set(publicRef, {
          reportId: reportRef.id, caseId, reportType: data.reportType, occurredAt: data.occurredAt,
          status: "approved", visibility: "public", publicDescription, publicLocationText,
          regionCode,
          publicLocation, publicRadiusM,
          publicGeohash: geohashForLocation([publicLocation.lat, publicLocation.lng]),
          media: publicMedia,
          sourceLabel: "사용자 제보 · 운영 검토 완료", publicationRevision: nextVersion,
          publicSummary: {title: `${publicLocationText} 목격 제보`, summary: publicDescription, regionLabel: publicLocationText},
          publishedAt: now, updatedAt: now, expiresAt: standaloneExpiresAt,
        }, {merge: false});
        transaction.create(reportRef.collection("statusHistory").doc(), {from: data.status, to: "approved", actorType: "admin", actorUidHash: actorHash(req.user!.uid), createdAt: now});
        transaction.create(reportRef.collection("moderationActions").doc(), {action: "approved", actorUidHash: actorHash(req.user!.uid), publicRadiusM, approvedMediaIds, createdAt: now});
        if (data.migrationReviewRequired) {
          transaction.set(db.collection("migrationQuarantine").doc(reportRef.id), {
            status: "resolved",
            resolution: "approved_public",
            resolvedAt: now,
            resolvedByHash: actorHash(req.user!.uid),
          }, {merge: true});
        }
        if (notificationsEnabled) {
          transaction.set(db.collection("notificationEvents").doc(`new-approved-report-${reportRef.id}-${nextVersion}`), {eventId: `new-approved-report-${reportRef.id}-${nextVersion}`, type: "new_approved_report", caseId, reportId: reportRef.id, regionLabel: publicLocationText, regionCode, publicLocation, status: "pending", createdAt: now});
        }
      });
      return res.json({success: true, publicationRevision: expectedVersion + 1});
    } catch (error: any) {
      if (copiedPublicPaths.length > 0) {
        const bucket = admin.storage().bucket();
        await Promise.all(copiedPublicPaths.map((target) => bucket.file(target).delete({ignoreNotFound: true}).catch(() => undefined)));
      }
      const statusCode = error?.message === "REVIEW_CONFLICT" ? 409 : error?.message === "REPORT_NOT_FOUND" ? 404 : 422;
      return res.status(statusCode).json({success: false, error: error?.message || "APPROVAL_FAILED"});
    }
  });

  app.post("/api/v2/admin/reports/:reportId/forward", authenticate, requireRoles(["agencyOperator"]), requireAdminMutations, async (req: AuthedRequest, res: Response) => {
    const expectedVersion = Number(req.body?.expectedVersion);
    const agencyName = cleanText(req.body?.agencyName, 120);
    const channel = cleanText(req.body?.channel, 40);
    const externalReceiptNumber = cleanText(req.body?.externalReceiptNumber, 120);
    const outcome = cleanText(req.body?.outcome, 300);
    if (!Number.isInteger(expectedVersion) || agencyName.length < 2 || !["phone", "secure_email", "official_system", "in_person"].includes(channel) || outcome.length < 5) return res.status(400).json({success: false, error: "INVALID_FORWARDING_INPUT"});
    const reportRef = db.collection("sightingReports").doc(req.params.reportId);
    const publicRef = db.collection("publicReports").doc(req.params.reportId);
    try {
      await db.runTransaction(async (transaction) => {
        const [snapshot, publicSnapshot] = await Promise.all([transaction.get(reportRef), transaction.get(publicRef)]);
        const data = snapshot.data();
        if (!snapshot.exists || !publicSnapshot.exists) throw new Error("REPORT_NOT_FOUND");
        if (data?.version !== expectedVersion) throw new Error("REVIEW_CONFLICT");
        if (data?.status !== "approved") throw new Error("INVALID_STATUS_TRANSITION");
        const now = Timestamp.now();
        transaction.update(reportRef, {status: "forwarded", version: expectedVersion + 1, updatedAt: now, forwardedAt: now});
        transaction.update(publicRef, {status: "forwarded", publicationRevision: expectedVersion + 1, updatedAt: now});
        transaction.create(reportRef.collection("statusHistory").doc(), {from: "approved", to: "forwarded", actorType: "admin", actorUidHash: actorHash(req.user!.uid), createdAt: now});
        transaction.create(reportRef.collection("moderationActions").doc(), {action: "forwarded", agencyName, channel, externalReceiptNumber: externalReceiptNumber || null, outcome, actorUidHash: actorHash(req.user!.uid), createdAt: now});
        transaction.create(reportRef.collection("agencyForwarding").doc(), {agencyName, channel, externalReceiptNumber: externalReceiptNumber || null, outcome, actorUidHash: actorHash(req.user!.uid), forwardedAt: now});
      });
      return res.json({success: true, version: expectedVersion + 1, status: "forwarded"});
    } catch (error: any) {
      const statusCode = error?.message === "REVIEW_CONFLICT" ? 409 : error?.message === "REPORT_NOT_FOUND" ? 404 : 422;
      return res.status(statusCode).json({success: false, error: error?.message || "FORWARDING_FAILED"});
    }
  });

  app.post("/api/v2/admin/reports/:reportId/confirm", authenticate, requireRoles(["agencyOperator"]), requireAdminMutations, async (req: AuthedRequest, res: Response) => {
    const expectedVersion = Number(req.body?.expectedVersion);
    const confirmationReference = cleanText(req.body?.confirmationReference, 200);
    if (!Number.isInteger(expectedVersion) || confirmationReference.length < 5) return res.status(400).json({success: false, error: "CONFIRMATION_REFERENCE_REQUIRED"});
    const reportRef = db.collection("sightingReports").doc(req.params.reportId);
    const publicRef = db.collection("publicReports").doc(req.params.reportId);
    const notificationsEnabled = (await loadReportingFeatureFlags(db).catch(() => null))?.reports_notifications_enabled === true;
    try {
      await db.runTransaction(async (transaction) => {
        const [snapshot, publicSnapshot] = await Promise.all([transaction.get(reportRef), transaction.get(publicRef)]);
        const data = snapshot.data();
        if (!snapshot.exists || !publicSnapshot.exists) throw new Error("REPORT_NOT_FOUND");
        if (data?.version !== expectedVersion) throw new Error("REVIEW_CONFLICT");
        if (!["approved", "forwarded"].includes(data?.status)) throw new Error("INVALID_STATUS_TRANSITION");
        const now = Timestamp.now();
        transaction.update(reportRef, {status: "confirmed", version: expectedVersion + 1, updatedAt: now, confirmedAt: now});
        transaction.update(publicRef, {status: "confirmed", publicationRevision: expectedVersion + 1, updatedAt: now});
        transaction.create(reportRef.collection("statusHistory").doc(), {from: data?.status, to: "confirmed", actorType: "admin", actorUidHash: actorHash(req.user!.uid), createdAt: now});
        transaction.create(reportRef.collection("moderationActions").doc(), {action: "confirmed", confirmationReference, actorUidHash: actorHash(req.user!.uid), createdAt: now});
        if (notificationsEnabled) {
          const publicData = publicSnapshot.data() || {};
          const eventId = `report-confirmed-${reportRef.id}-${expectedVersion + 1}`;
          transaction.set(db.collection("notificationEvents").doc(eventId), {
            eventId, type: "report_confirmed", caseId: data?.caseId, reportId: reportRef.id,
            regionLabel: publicData.publicLocationText || "관심 지역", regionCode: publicData.regionCode || null, publicLocation: publicData.publicLocation || null,
            status: "pending", createdAt: now,
          }, {merge: false});
        }
      });
      return res.json({success: true, version: expectedVersion + 1, status: "confirmed"});
    } catch (error: any) {
      const statusCode = error?.message === "REVIEW_CONFLICT" ? 409 : error?.message === "REPORT_NOT_FOUND" ? 404 : 422;
      return res.status(statusCode).json({success: false, error: error?.message || "CONFIRMATION_FAILED"});
    }
  });

  app.post("/api/v2/admin/reports/:reportId/archive", authenticate, senior, requireAdminMutations, async (req: AuthedRequest, res: Response) => {
    const expectedVersion = Number(req.body?.expectedVersion);
    const reason = cleanText(req.body?.reason, 300);
    if (!Number.isInteger(expectedVersion) || reason.length < 10) return res.status(400).json({success: false, error: "ARCHIVE_REASON_REQUIRED"});
    const reportRef = db.collection("sightingReports").doc(req.params.reportId);
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reportRef);
        const data = snapshot.data();
        if (!snapshot.exists) throw new Error("REPORT_NOT_FOUND");
        if (data?.version !== expectedVersion) throw new Error("REVIEW_CONFLICT");
        if (!["rejected", "duplicate", "withdrawn", "confirmed"].includes(data?.status)) throw new Error("INVALID_STATUS_TRANSITION");
        const now = Timestamp.now();
        const purgeAfter = Timestamp.fromMillis(now.toMillis() + 90 * 24 * 60 * 60_000);
        transaction.update(reportRef, {status: "archived", visibility: "private", version: expectedVersion + 1, updatedAt: now, retentionReviewAt: purgeAfter, purgeAfter});
        transaction.delete(db.collection("publicReports").doc(reportRef.id));
        transaction.create(reportRef.collection("statusHistory").doc(), {from: data?.status, to: "archived", actorType: "admin", actorUidHash: actorHash(req.user!.uid), createdAt: now});
        transaction.create(reportRef.collection("moderationActions").doc(), {action: "archived", reason, actorUidHash: actorHash(req.user!.uid), createdAt: now});
      });
      await admin.storage().bucket().deleteFiles({prefix: `report-public/${reportRef.id}/`, force: true});
      return res.json({success: true, version: expectedVersion + 1, status: "archived"});
    } catch (error: any) {
      const statusCode = error?.message === "REVIEW_CONFLICT" ? 409 : error?.message === "REPORT_NOT_FOUND" ? 404 : 422;
      return res.status(statusCode).json({success: false, error: error?.message || "ARCHIVE_FAILED"});
    }
  });

  app.post("/api/v2/admin/reports/:reportId/unpublish", authenticate, senior, requireAdminMutations, async (req: AuthedRequest, res: Response) => {
    const reason = cleanText(req.body?.reason, 300);
    const expectedVersion = Number(req.body?.expectedVersion);
    if (reason.length < 10 || !Number.isInteger(expectedVersion)) return res.status(400).json({success: false, error: "UNPUBLISH_INPUT_REQUIRED"});
    const reportRef = db.collection("sightingReports").doc(req.params.reportId);
    const publicRef = db.collection("publicReports").doc(req.params.reportId);
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reportRef);
        if (!snapshot.exists) throw new Error("REPORT_NOT_FOUND");
        const data = snapshot.data();
        if (data?.version !== expectedVersion) throw new Error("REVIEW_CONFLICT");
        if (!["approved", "forwarded", "confirmed"].includes(data?.status) || data?.visibility !== "public") throw new Error("INVALID_STATUS_TRANSITION");
        const now = Timestamp.now();
        transaction.update(reportRef, {status: "triage", visibility: "private", version: expectedVersion + 1, updatedAt: now});
        transaction.delete(publicRef);
        transaction.create(reportRef.collection("statusHistory").doc(), {from: data?.status, to: "triage", actorType: "admin", actorUidHash: actorHash(req.user!.uid), createdAt: now});
        transaction.create(reportRef.collection("moderationActions").doc(), {action: "unpublished", reason, actorUidHash: actorHash(req.user!.uid), createdAt: now});
      });
      await admin.storage().bucket().deleteFiles({prefix: `report-public/${reportRef.id}/`, force: true});
      return res.json({success: true, status: "triage", version: expectedVersion + 1});
    } catch (error: any) {
      const statusCode = error?.message === "REPORT_NOT_FOUND" ? 404 : error?.message === "REVIEW_CONFLICT" ? 409 : error?.message === "INVALID_STATUS_TRANSITION" ? 422 : 500;
      return res.status(statusCode).json({success: false, error: error?.message || "UNPUBLISH_FAILED"});
    }
  });
};
