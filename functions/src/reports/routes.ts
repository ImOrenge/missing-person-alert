import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as crypto from "crypto";
import {Express, NextFunction, Request, Response} from "express";
import {loadReportingFeatureFlags} from "../runtimeConfig";
import {encryptContact} from "./contact-encryption";
import {CreateReportInput, OwnReportListItemDto} from "./contracts";
import {validateCreateReportInput} from "./report-validation";

type AuthedRequest = Request & {user?: admin.auth.DecodedIdToken};
type Middleware = (req: any, res: Response, next: NextFunction) => unknown;

interface ReportRouteDependencies {
  db: admin.firestore.Firestore;
  authenticate: Middleware;
  ensureRecaptcha: Middleware;
  rateLimit: Middleware;
}

const displayStatus = (status: unknown): string => ({
  submitted: "접수 완료", triage: "검토 중", needs_information: "추가정보 필요",
  approved: "공개 승인", forwarded: "관계기관 전달", confirmed: "확인된 제보",
  rejected: "검토 종료", duplicate: "기존 제보와 통합", withdrawn: "사용자 취소", archived: "처리 종료",
}[String(status)] || "처리 중");

const timestampIso = (value: unknown): string => {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as {toDate: () => Date}).toDate === "function") {
    return (value as {toDate: () => Date}).toDate().toISOString();
  }
  return new Date(0).toISOString();
};

const toOwnListItem = (id: string, data: Record<string, any>): OwnReportListItemDto => ({
  reportId: id,
  receiptNumber: String(data.receiptNumber || id),
  caseId: typeof data.caseId === "string" ? data.caseId : undefined,
  reportType: data.reportType,
  occurredAt: String(data.occurredAt || ""),
  locationLabel: String(data.exactLocation?.address || "위치 비공개"),
  displayStatus: displayStatus(data.status),
  version: Number.isInteger(data.version) ? data.version : 0,
  createdAt: timestampIso(data.createdAt),
  updatedAt: timestampIso(data.updatedAt),
  needsInformation: data.status === "needs_information",
  informationRequestMessage: data.status === "needs_information" ? String(data.ownerRequest?.message || "").slice(0, 500) : undefined,
});

const requireReportingFlag = (db: admin.firestore.Firestore): Middleware => async (_req, res, next) => {
  try {
    const flags = await loadReportingFeatureFlags(db);
    if (!flags.reports_submission_enabled) return res.status(404).json({success: false, error: "REPORT_SUBMISSION_DISABLED"});
    return next();
  } catch {
    return res.status(503).json({success: false, error: "RUNTIME_CONFIG_UNAVAILABLE"});
  }
};

const verifyMediaDraft = async (
  db: admin.firestore.Firestore,
  ownerUid: string,
  draftId: string,
  mediaIds: string[],
): Promise<boolean> => {
  if (mediaIds.length === 0) return true;
  const references = mediaIds.map((mediaId) => db.collection("reportMediaDrafts").doc(draftId).collection("media").doc(mediaId));
  const snapshots = await db.getAll(...references);
  return snapshots.every((snapshot, index) => {
    const data = snapshot.data();
    return snapshot.exists && snapshot.id === mediaIds[index] && data?.ownerUid === ownerUid &&
      data?.draftId === draftId && data?.scanStatus === "normalized" && data?.exifStripped === true;
  });
};

const verifyCase = async (db: admin.firestore.Firestore, input: CreateReportInput): Promise<boolean> => {
  if (!input.caseId) return input.reportType === "new_case_lead";
  const snapshot = await db.collection("missingPersons").doc(input.caseId).get();
  const data = snapshot.data();
  return snapshot.exists && data?.source === "api" && data?.status === "active" && data?.seoVisible === true;
};

export const registerReportRoutesV2 = (app: Express, dependencies: ReportRouteDependencies): void => {
  const {db, authenticate, ensureRecaptcha, rateLimit} = dependencies;
  const flag = requireReportingFlag(db);

  const privateNoStore: Middleware = (_req, res, next) => {
    res.set({
      "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Vary": "Authorization",
    });
    return next();
  };
  app.use("/api/v2/reports", privateNoStore);
  app.use("/api/v2/report-media", privateNoStore);

  app.get("/api/v2/report-media/drafts/:draftId", authenticate, async (req: AuthedRequest, res: Response) => {
    const ownerUid = req.user?.uid;
    if (!ownerUid) return res.status(401).json({success: false, error: "AUTH_REQUIRED"});
    const draftId = String(req.params.draftId || "");
    const mediaIds = typeof req.query.mediaIds === "string"
      ? Array.from(new Set(req.query.mediaIds.split(",").filter((item) => /^[a-f0-9]{32}$/.test(item)))).slice(0, 5)
      : [];
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(draftId) || mediaIds.length === 0) {
      return res.status(400).json({success: false, error: "INVALID_MEDIA_DRAFT_QUERY"});
    }
    const flags = await loadReportingFeatureFlags(db).catch(() => null);
    if (!flags?.reports_media_enabled) return res.status(404).json({success: false, error: "REPORT_MEDIA_DISABLED"});
    const references = mediaIds.map((mediaId) => db.collection("reportMediaDrafts").doc(draftId).collection("media").doc(mediaId));
    const snapshots = await db.getAll(...references);
    const items = snapshots.map((snapshot, index) => {
      const data = snapshot.data();
      const owned = snapshot.exists && data?.ownerUid === ownerUid && data?.draftId === draftId;
      return {
        mediaId: mediaIds[index],
        status: owned && ["normalized", "rejected"].includes(data?.scanStatus) ? data?.scanStatus : "processing",
      };
    });
    return res.json({
      success: true,
      items,
      ready: items.every((item) => item.status === "normalized"),
      failed: items.some((item) => item.status === "rejected"),
    });
  });

  app.post("/api/v2/reports", authenticate, flag, ensureRecaptcha, rateLimit, async (req: AuthedRequest, res: Response) => {
    const ownerUid = req.user?.uid;
    if (!ownerUid) return res.status(401).json({success: false, error: "AUTH_REQUIRED"});
    const parsed = validateCreateReportInput(req.body);
    if ('error' in parsed) return res.status(400).json({success: false, error: parsed.error});
    if (!await verifyCase(db, parsed.input)) return res.status(400).json({success: false, error: "CASE_NOT_ACTIVE"});
    const mediaIds = parsed.input.mediaIds || [];
    if (mediaIds.length > 0) {
      const flags = await loadReportingFeatureFlags(db).catch(() => null);
      if (!flags?.reports_media_enabled) return res.status(422).json({success: false, error: "REPORT_MEDIA_DISABLED"});
      if (!await verifyMediaDraft(db, ownerUid, parsed.input.clientRequestId, mediaIds)) {
        return res.status(422).json({success: false, error: "REPORT_MEDIA_NOT_READY"});
      }
    }

    let encryptedContact = null;
    try {
      if (parsed.input.contact) encryptedContact = await encryptContact(parsed.input.contact);
    } catch (error: any) {
      const code = error?.message === "CONTACT_ENCRYPTION_UNAVAILABLE" ? 503 : 500;
      return res.status(code).json({success: false, error: error?.message || "CONTACT_ENCRYPTION_FAILED"});
    }

    const idempotencyHash = crypto.createHash("sha256").update(`${ownerUid}:${parsed.input.clientRequestId}`).digest("hex");
    const keyRef = db.collection("reportSubmissionKeys").doc(idempotencyHash);
    const reportRef = db.collection("sightingReports").doc();
    const historyRef = reportRef.collection("statusHistory").doc();
    const now = Timestamp.now();
    const receiptNumber = `MA-${now.toDate().toISOString().slice(0, 10).replace(/-/g, "")}-${reportRef.id.slice(0, 8).toUpperCase()}`;

    try {
      const outcome = await db.runTransaction(async (transaction) => {
        const existingKey = await transaction.get(keyRef);
        if (existingKey.exists) return existingKey.data() as {reportId: string; receiptNumber: string};
        transaction.create(reportRef, {
          reportId: reportRef.id,
          receiptNumber,
          ownerUid,
          caseId: parsed.input.caseId || null,
          reportType: parsed.input.reportType,
          occurredAt: parsed.input.occurredAt,
          exactLocation: parsed.input.location,
          rawText: parsed.input.description,
          mediaIds,
          mediaDraftId: parsed.input.clientRequestId,
          consent: parsed.input.consent,
          status: "submitted",
          visibility: "private",
          version: 1,
          createdAt: now,
          updatedAt: now,
          retentionReviewAt: Timestamp.fromMillis(now.toMillis() + 365 * 24 * 60 * 60_000),
        });
        transaction.create(historyRef, {from: null, to: "submitted", actorType: "user", actorUidHash: crypto.createHash("sha256").update(ownerUid).digest("hex").slice(0, 24), createdAt: now});
        if (encryptedContact) transaction.create(reportRef.collection("private").doc("contact"), encryptedContact);
        transaction.create(keyRef, {ownerUidHash: crypto.createHash("sha256").update(ownerUid).digest("hex").slice(0, 24), reportId: reportRef.id, receiptNumber, createdAt: now, expiresAt: Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60_000)});
        return {reportId: reportRef.id, receiptNumber};
      });
      return res.status(201).json({success: true, ...outcome, displayStatus: "접수 완료", version: 1, nextActions: ["내 제보에서 처리 상태 확인", "추가 요청이 오면 보완 정보 제출"]});
    } catch (error: unknown) {
      logger.error("V2 report create failed", {
        errorCode: typeof error === "object" && error && "code" in error ? String((error as {code?: unknown}).code) : "unknown",
        errorName: error instanceof Error ? error.name : "unknown",
        errorMessage: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });
      return res.status(500).json({success: false, error: "REPORT_CREATE_FAILED"});
    }
  });

  app.get("/api/v2/reports/my", authenticate, async (req: AuthedRequest, res: Response) => {
    const ownerUid = req.user?.uid;
    if (!ownerUid) return res.status(401).json({success: false, error: "AUTH_REQUIRED"});
    try {
      const snapshot = await db.collection("sightingReports").where("ownerUid", "==", ownerUid).orderBy("createdAt", "desc").limit(100).get();
      return res.json({success: true, reports: snapshot.docs.map((document) => toOwnListItem(document.id, document.data())), total: snapshot.size});
    } catch {
      return res.status(500).json({success: false, error: "REPORT_LIST_FAILED"});
    }
  });

  app.get("/api/v2/reports/:reportId", authenticate, async (req: AuthedRequest, res: Response) => {
    const ownerUid = req.user?.uid;
    const snapshot = await db.collection("sightingReports").doc(req.params.reportId).get();
    const data = snapshot.data();
    if (!snapshot.exists) return res.status(404).json({success: false, error: "REPORT_NOT_FOUND"});
    if (!ownerUid || data?.ownerUid !== ownerUid) return res.status(403).json({success: false, error: "REPORT_FORBIDDEN"});
    return res.json({success: true, report: {...toOwnListItem(snapshot.id, data), description: String(data.rawText || "").slice(0, 2000), mediaCount: Array.isArray(data.mediaIds) ? data.mediaIds.length : 0}});
  });

  app.post("/api/v2/reports/:reportId/additional-information", authenticate, flag, rateLimit, async (req: AuthedRequest, res: Response) => {
    const ownerUid = req.user?.uid;
    const expectedVersion = Number(req.body?.expectedVersion);
    const message = typeof req.body?.message === "string"
      ? req.body.message.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000)
      : "";
    const containsSensitiveIdentifier = /(?:^|\D)\d{6}-?[1-4]\d{6}(?:\D|$)/.test(message);
    const urlCount = (message.match(/https?:\/\/|www\./gi) || []).length;
    if (!Number.isInteger(expectedVersion) || message.length < 10 || containsSensitiveIdentifier || urlCount > 2) return res.status(400).json({success: false, error: "INVALID_ADDITIONAL_INFORMATION"});
    const reportRef = db.collection("sightingReports").doc(req.params.reportId);
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reportRef);
        const data = snapshot.data();
        if (!snapshot.exists) throw new Error("REPORT_NOT_FOUND");
        if (!ownerUid || data?.ownerUid !== ownerUid) throw new Error("REPORT_FORBIDDEN");
        if (data?.version !== expectedVersion) throw new Error("REVIEW_CONFLICT");
        if (data?.status !== "needs_information") throw new Error("INVALID_STATUS_TRANSITION");
        const now = Timestamp.now();
        transaction.update(reportRef, {
          status: "triage", version: expectedVersion + 1, updatedAt: now,
          "ownerRequest.respondedAt": now, "ownerRequest.responsePendingReview": true,
        });
        transaction.create(reportRef.collection("additionalInformation").doc(), {message, ownerUidHash: crypto.createHash("sha256").update(ownerUid).digest("hex").slice(0, 24), createdAt: now});
        transaction.create(reportRef.collection("statusHistory").doc(), {from: "needs_information", to: "triage", actorType: "user", createdAt: now});
        transaction.create(reportRef.collection("moderationActions").doc(), {action: "additional_information_submitted", actorUidHash: crypto.createHash("sha256").update(ownerUid).digest("hex").slice(0, 24), createdAt: now});
      });
      return res.json({success: true, version: expectedVersion + 1, displayStatus: "검토 중"});
    } catch (error: any) {
      const status = error?.message === "REPORT_NOT_FOUND" ? 404 : error?.message === "REPORT_FORBIDDEN" ? 403 : error?.message === "REVIEW_CONFLICT" ? 409 : 422;
      return res.status(status).json({success: false, error: error?.message || "ADDITIONAL_INFORMATION_FAILED"});
    }
  });

  app.post("/api/v2/reports/:reportId/withdraw", authenticate, async (req: AuthedRequest, res: Response) => {
    const ownerUid = req.user?.uid;
    const reportRef = db.collection("sightingReports").doc(req.params.reportId);
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reportRef);
        const data = snapshot.data();
        if (!snapshot.exists) throw new Error("REPORT_NOT_FOUND");
        if (!ownerUid || data?.ownerUid !== ownerUid) throw new Error("REPORT_FORBIDDEN");
        if (!["submitted", "triage", "needs_information"].includes(data?.status)) throw new Error("INVALID_STATUS_TRANSITION");
        const now = Timestamp.now();
        transaction.update(reportRef, {status: "withdrawn", visibility: "private", version: FieldValue.increment(1), updatedAt: now, purgeAfter: Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60_000)});
        transaction.create(reportRef.collection("statusHistory").doc(), {from: data?.status, to: "withdrawn", actorType: "user", createdAt: now});
      });
      return res.json({success: true, displayStatus: "사용자 취소"});
    } catch (error: any) {
      const status = error?.message === "REPORT_NOT_FOUND" ? 404 : error?.message === "REPORT_FORBIDDEN" ? 403 : 409;
      return res.status(status).json({success: false, error: error?.message || "REPORT_WITHDRAW_FAILED"});
    }
  });
};
