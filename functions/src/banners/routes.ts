import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import * as crypto from "crypto";
import {Express, NextFunction, Request, Response} from "express";

type AuthedRequest = Request & {user?: admin.auth.DecodedIdToken};
type Middleware = (req: any, res: Response, next: NextFunction) => unknown;
interface Dependencies { db: admin.firestore.Firestore; authenticate: Middleware; }
type BannerState = "draft" | "pending_approval" | "scheduled" | "published" | "ended" | "archived";
const SEVERITY_ORDER = {critical: 0, high: 1, normal: 2} as const;

const hasRole = (user: admin.auth.DecodedIdToken | undefined, roles: string[]) => !!user && roles.some((role) => (user as Record<string, unknown>)[role] === true);
const requireRoles = (roles: string[]): Middleware => (req: AuthedRequest, res, next) => hasRole(req.user, roles) ? next() : res.status(403).json({success: false, error: "ADMIN_ROLE_REQUIRED"});
const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const actorHash = (uid: string) => crypto.createHash("sha256").update(uid).digest("hex").slice(0, 24);
const toDate = (value: unknown): Date | null => { const parsed = typeof value === "string" ? new Date(value) : null; return parsed && Number.isFinite(parsed.getTime()) ? parsed : null; };

const publicDto = (id: string, data: Record<string, any>) => ({
  id, kind: data.kind, severity: data.severity, title: data.title, summary: data.summary,
  sourceLabel: data.sourceLabel, targetRegionCodes: data.targetRegionCodes || [],
  startsAt: data.startsAt?.toDate?.().toISOString(), endsAt: data.endsAt?.toDate?.().toISOString(),
  action: data.action, dismissible: data.dismissible === true, revision: data.revision || 1,
  approvedAt: data.approvedAt?.toDate?.().toISOString(),
});

export const registerBannerRoutes = (app: Express, {db, authenticate}: Dependencies): void => {
  app.get("/api/v2/banners", async (_req, res) => {
    const now = Timestamp.now();
    const snapshot = await db.collection("siteBanners").where("state", "in", ["scheduled", "published"]).limit(50).get();
    const banners = snapshot.docs.map((document) => publicDto(document.id, document.data())).filter((banner) => {
      const starts = banner.startsAt ? Date.parse(banner.startsAt) : 0;
      const ends = banner.endsAt ? Date.parse(banner.endsAt) : Number.MAX_SAFE_INTEGER;
      return starts <= now.toMillis() && ends > now.toMillis();
    }).sort((a, b) => SEVERITY_ORDER[a.severity as keyof typeof SEVERITY_ORDER] - SEVERITY_ORDER[b.severity as keyof typeof SEVERITY_ORDER]);
    res.set("Cache-Control", "public, max-age=30, s-maxage=60");
    return res.json({success: true, banners});
  });

  app.get("/api/v2/admin/banners", authenticate, requireRoles(["reportModerator", "seniorModerator", "systemAdmin"]), async (_req, res) => {
    const snapshot = await db.collection("siteBanners").orderBy("updatedAt", "desc").limit(100).get();
    return res.json({success: true, banners: snapshot.docs.map((document) => ({id: document.id, ...document.data(), startsAt: document.data().startsAt?.toDate?.().toISOString(), endsAt: document.data().endsAt?.toDate?.().toISOString(), createdAt: document.data().createdAt?.toDate?.().toISOString(), updatedAt: document.data().updatedAt?.toDate?.().toISOString()}))});
  });

  app.post("/api/v2/admin/banners", authenticate, requireRoles(["reportModerator", "seniorModerator", "systemAdmin"]), async (req: AuthedRequest, res) => {
    const kind = req.body?.kind === "emergency" ? "emergency" : "info";
    const severity = ["critical", "high", "normal"].includes(req.body?.severity) ? req.body.severity : "normal";
    const title = clean(req.body?.title, 100);
    const summary = clean(req.body?.summary, 500);
    const sourceLabel = clean(req.body?.sourceLabel, 80);
    const actionLabel = clean(req.body?.action?.label, 40);
    const actionHref = clean(req.body?.action?.href, 500);
    const startsAt = toDate(req.body?.startsAt);
    const endsAt = toDate(req.body?.endsAt);
    const targetRegionCodes = Array.isArray(req.body?.targetRegionCodes) ? req.body.targetRegionCodes.filter((item: unknown): item is string => typeof item === "string" && /^[a-z0-9_-]{2,40}$/i.test(item)).slice(0, 20) : [];
    if (!title || summary.length < 10 || !sourceLabel || !startsAt || !endsAt || startsAt >= endsAt || !actionLabel || !/^\/(?!\/)/.test(actionHref)) return res.status(400).json({success: false, error: "INVALID_BANNER"});
    const ref = db.collection("siteBanners").doc();
    const now = Timestamp.now();
    await ref.set({bannerId: ref.id, kind, severity, title, summary, sourceLabel, targetRegionCodes, startsAt: Timestamp.fromDate(startsAt), endsAt: Timestamp.fromDate(endsAt), action: {label: actionLabel, href: actionHref}, dismissible: req.body?.dismissible === true, revision: 1, state: "draft" as BannerState, createdBy: req.user!.uid, createdAt: now, updatedAt: now});
    await ref.collection("audit").add({action: "created", actorUidHash: actorHash(req.user!.uid), createdAt: now});
    return res.status(201).json({success: true, bannerId: ref.id});
  });

  app.post("/api/v2/admin/banners/:bannerId/submit", authenticate, requireRoles(["reportModerator", "seniorModerator", "systemAdmin"]), async (req: AuthedRequest, res) => {
    const ref = db.collection("siteBanners").doc(req.params.bannerId);
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new Error("BANNER_NOT_FOUND");
        if (snapshot.data()?.state !== "draft") throw new Error("INVALID_BANNER_TRANSITION");
        const now = Timestamp.now();
        transaction.update(ref, {state: "pending_approval", submittedAt: now, updatedAt: now});
        transaction.create(ref.collection("audit").doc(), {action: "submitted", actorUidHash: actorHash(req.user!.uid), createdAt: now});
      });
      return res.json({success: true});
    } catch (error: any) { return res.status(error?.message === "BANNER_NOT_FOUND" ? 404 : 409).json({success: false, error: error?.message}); }
  });

  app.post("/api/v2/admin/banners/:bannerId/approve", authenticate, requireRoles(["seniorModerator", "systemAdmin"]), async (req: AuthedRequest, res) => {
    const ref = db.collection("siteBanners").doc(req.params.bannerId);
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const data = snapshot.data();
        if (!snapshot.exists) throw new Error("BANNER_NOT_FOUND");
        if (data?.state !== "pending_approval") throw new Error("INVALID_BANNER_TRANSITION");
        if (data?.createdBy === req.user!.uid) throw new Error("SEPARATION_OF_DUTIES_REQUIRED");
        const now = Timestamp.now();
        const nextState: BannerState = data?.startsAt?.toMillis?.() > now.toMillis() ? "scheduled" : "published";
        transaction.update(ref, {state: nextState, approvedBy: req.user!.uid, approvedAt: now, revision: Number(data?.revision || 0) + 1, updatedAt: now});
        transaction.create(ref.collection("audit").doc(), {action: "approved", actorUidHash: actorHash(req.user!.uid), createdAt: now});
      });
      return res.json({success: true});
    } catch (error: any) { return res.status(error?.message === "BANNER_NOT_FOUND" ? 404 : error?.message === "SEPARATION_OF_DUTIES_REQUIRED" ? 403 : 409).json({success: false, error: error?.message}); }
  });

  app.post("/api/v2/admin/banners/:bannerId/end", authenticate, requireRoles(["seniorModerator", "systemAdmin"]), async (req: AuthedRequest, res) => {
    const ref = db.collection("siteBanners").doc(req.params.bannerId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(404).json({success: false, error: "BANNER_NOT_FOUND"});
    const now = Timestamp.now();
    await ref.update({state: "ended", endedBy: req.user!.uid, endedAt: now, revision: FieldValue.increment(1), updatedAt: now});
    await ref.collection("audit").add({action: "ended", actorUidHash: actorHash(req.user!.uid), createdAt: now});
    return res.json({success: true});
  });
};
