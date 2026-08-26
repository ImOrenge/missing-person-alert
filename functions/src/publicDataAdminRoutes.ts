import type * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import type {Express, NextFunction, Request, RequestHandler, Response} from "express";
import {resolvePublicDataRoles, type PublicDataRole} from "./publicDataRoles";

type AuthedRequest = Request & {user?: admin.auth.DecodedIdToken};

const serializeTimestamp = (value: any): string | null => value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null;

const roleGuard = (allowed: PublicDataRole[]): RequestHandler => (req: AuthedRequest, res: Response, next: NextFunction) => {
  const roles = resolvePublicDataRoles(req.user as Record<string, unknown> | undefined);
  if (!roles.some((role) => allowed.includes(role))) return res.status(403).json({success: false, error: "공공데이터 운영 권한이 필요합니다"});
  return next();
};

const safeAdminRead = (handler: (req: AuthedRequest, res: Response) => Promise<void>): RequestHandler =>
  async (req: AuthedRequest, res: Response) => {
    try {
      await handler(req, res);
    } catch (error) {
      logger.error("Public data admin read failed", {
        path: req.path,
        errorCode: error instanceof Error ? error.name : "unknown",
      });
      if (!res.headersSent) res.status(500).set("Cache-Control", "no-store").json({success: false, error: "운영 데이터를 불러오지 못했습니다"});
    }
  };

const projectSyncRun = (doc: admin.firestore.QueryDocumentSnapshot): Record<string, unknown> => {
  const data = doc.data();
  return {
    id: doc.id,
    type: data.type || "unknown",
    trigger: data.trigger || "unknown",
    status: data.status || "unknown",
    startedAt: serializeTimestamp(data.startedAt),
    completedAt: serializeTimestamp(data.completedAt),
    counts: data.counts || null,
    sourceHashPrefix: typeof data.sourceHash === "string" ? data.sourceHash.slice(0, 12) : null,
    rebuiltDays: Array.isArray(data.rebuiltDays) ? data.rebuiltDays : [],
    rebuiltMonths: Array.isArray(data.rebuiltMonths) ? data.rebuiltMonths : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    error: data.error ? {code: data.error.code || "unknown", message: String(data.error.message || "").slice(0, 300)} : null,
  };
};

export const registerPublicDataAdminRoutes = (app: Express, input: {db: admin.firestore.Firestore; authenticate: RequestHandler}): void => {
  const {db, authenticate} = input;
  const analyst = roleGuard(["admin", "operator", "analyst"]);

  app.get("/api/v2/admin/public-data/overview", authenticate, analyst, safeAdminRead(async (_req, res) => {
    const [runs, issues, drafts] = await Promise.all([
      db.collection("sync_runs").orderBy("startedAt", "desc").limit(40).get(),
      db.collection("data_quality_issues").where("status", "in", ["open", "investigating"]).limit(100).get(),
      db.collection("impact_monthly_drafts").limit(24).get(),
    ]);
    const projectedRuns = runs.docs.map(projectSyncRun);
    const latestByType = Object.fromEntries(projectedRuns.filter((run, index, all) => all.findIndex((candidate) => candidate.type === run.type) === index).map((run) => [String(run.type), run]));
    const latestDraft = drafts.docs.map((doc) => ({month: doc.id, ...doc.data()} as Record<string, any>)).sort((left, right) => String(right.month).localeCompare(String(left.month)))[0] || null;
    res.set("Cache-Control", "private, no-store").json({success: true, overview: {openIssueCount: issues.size, latestByType, latestImpactDraft: latestDraft ? {month: latestDraft.month, review: latestDraft.review, anomalies: latestDraft.anomalies || [], updatedAt: serializeTimestamp(latestDraft.updatedAt)} : null}});
  }));

  app.get("/api/v2/admin/public-data/sync-runs", authenticate, analyst, safeAdminRead(async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const snapshot = await db.collection("sync_runs").orderBy("startedAt", "desc").limit(limit).get();
    res.set("Cache-Control", "private, no-store").json({success: true, runs: snapshot.docs.map(projectSyncRun)});
  }));

  app.get("/api/v2/admin/public-data/issues", authenticate, analyst, safeAdminRead(async (req, res) => {
    const requestedStatus = String(req.query.status || "open");
    if (!["open", "investigating", "resolved", "ignored", "active"].includes(requestedStatus)) {
      res.status(400).set("Cache-Control", "no-store").json({success: false, error: "지원하지 않는 이슈 상태입니다"});
      return;
    }
    const statuses = requestedStatus === "active" ? ["open", "investigating"] : [requestedStatus];
    const snapshot = await db.collection("data_quality_issues").where("status", "in", statuses).limit(100).get();
    const issues = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {id: doc.id, type: data.type, status: data.status, severity: data.severity, sourceId: data.sourceId, target: data.target, code: data.code, assignedTo: data.assignedTo || null, resolutionReason: data.resolutionReason || null, createdAt: serializeTimestamp(data.createdAt), updatedAt: serializeTimestamp(data.updatedAt)};
    });
    res.set("Cache-Control", "private, no-store").json({success: true, issues});
  }));

  app.get("/api/v2/admin/public-data/impact-drafts", authenticate, analyst, safeAdminRead(async (_req, res) => {
    const snapshot = await db.collection("impact_monthly_drafts").limit(24).get();
    const drafts = snapshot.docs.map((doc) => ({month: doc.id, ...doc.data(), updatedAt: serializeTimestamp(doc.data().updatedAt)})).sort((left, right) => right.month.localeCompare(left.month));
    res.set("Cache-Control", "private, no-store").json({success: true, drafts});
  }));

  app.get("/api/v2/admin/public-data/sources", authenticate, analyst, safeAdminRead(async (_req, res) => {
    const [internalSources, publicSources] = await Promise.all([db.collection("data_sources").get(), db.collection("public_sources").get()]);
    const publicById = new Map(publicSources.docs.map((doc) => [doc.id, doc.data()]));
    const sources = internalSources.docs.map((doc) => {
      const data = doc.data();
      const publicData = publicById.get(doc.id) || {};
      return {id: doc.id, title: data.title || publicData.title, agency: data.agency || publicData.agency, sourceType: data.sourceType, enabled: data.enabled !== false, lastHashPrefix: typeof data.lastHash === "string" ? data.lastHash.slice(0, 12) : null, lastCheckedAt: serializeTimestamp(data.lastCheckedAt), public: {published: publicData.published === true, datasetCutoff: publicData.datasetCutoff || null, lastVerifiedAt: serializeTimestamp(publicData.lastVerifiedAt)}};
    });
    res.set("Cache-Control", "private, no-store").json({success: true, sources});
  }));

  app.get("/api/v2/admin/public-data/audit", authenticate, analyst, safeAdminRead(async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const snapshot = await db.collection("admin_audit_logs").orderBy("createdAt", "desc").limit(limit).get();
    const entries = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {id: doc.id, actorUid: data.actorUid, actorRole: data.actorRole, action: data.action, target: data.target, before: data.before || null, after: data.after || null, reason: data.reason || null, createdAt: serializeTimestamp(data.createdAt)};
    });
    res.set("Cache-Control", "private, no-store").json({success: true, entries});
  }));
};
