import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {Express, NextFunction, Request, Response} from "express";
import {loadReportingFeatureFlags} from "../runtimeConfig";

type AuthedRequest = Request & {user?: admin.auth.DecodedIdToken};
type Middleware = (req: any, res: Response, next: NextFunction) => unknown;

interface Dependencies { db: admin.firestore.Firestore; authenticate: Middleware; }

const cleanCodes = (value: unknown, max: number): string[] => Array.isArray(value)
  ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && /^[a-z0-9_-]{2,40}$/i.test(item)))).slice(0, max)
  : [];

const MAX_TOKENS_PER_USER = 5;
const TOKEN_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const TOKEN_PATTERN = /^[A-Za-z0-9_:.-]{20,4096}$/;
const ALLOWED_PLATFORMS = new Set(["ios", "android", "windows", "mac", "linux", "web"]);

const cleanToken = (value: unknown): string | null =>
  typeof value === "string" && TOKEN_PATTERN.test(value) ? value : null;

const timestampMillis = (value: unknown): number =>
  value instanceof admin.firestore.Timestamp ? value.toMillis() : 0;

const cleanTokenMap = (value: unknown, nowMs: number): Record<string, admin.firestore.DocumentData> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([token, metadata]) => cleanToken(token) && metadata && typeof metadata === "object")
      .filter(([, metadata]) => nowMs - timestampMillis((metadata as admin.firestore.DocumentData).lastSeenAt) <= TOKEN_MAX_AGE_MS)
      .sort(([, left], [, right]) => timestampMillis((right as admin.firestore.DocumentData).lastSeenAt) - timestampMillis((left as admin.firestore.DocumentData).lastSeenAt))
      .slice(0, MAX_TOKENS_PER_USER - 1),
  );
};

export const registerNotificationSubscriptionRoutes = (app: Express, {db, authenticate}: Dependencies): void => {
  const requireNotifications: Middleware = async (_req, res, next) => {
    try {
      const flags = await loadReportingFeatureFlags(db);
      if (!flags.reports_notifications_enabled) return res.status(404).json({success: false, error: "REPORT_NOTIFICATIONS_DISABLED"});
      return next();
    } catch {
      return res.status(503).json({success: false, error: "RUNTIME_CONFIG_UNAVAILABLE"});
    }
  };

  app.get("/api/v2/alerts/subscriptions", authenticate, requireNotifications, async (req: AuthedRequest, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({success: false, error: "AUTH_REQUIRED"});
    const snapshot = await db.collection("notificationSubscriptions").doc(uid).get();
    const data = snapshot.data() || {};
    return res.json({success: true, subscription: {
      caseIds: cleanCodes(data.caseIds, 50), regionCodes: cleanCodes(data.regionCodes, 5),
      radius: data.radius && typeof data.radius === "object" ? {regionCode: String(data.radius.regionCode || ""), distanceKm: 10} : null,
      pushEnabled: data.pushEnabled === true, quietHours: data.quietHours || {enabled: false, start: "22:00", end: "07:00", allowEmergency: true},
      deliveryReady: process.env.NOTIFICATION_DELIVERY_ENABLED === "true",
    }});
  });

  app.put("/api/v2/alerts/subscriptions", authenticate, requireNotifications, async (req: AuthedRequest, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({success: false, error: "AUTH_REQUIRED"});
    const caseIds = cleanCodes(req.body?.caseIds, 50);
    const regionCodes = cleanCodes(req.body?.regionCodes, 5);
    const radiusRegionCode = typeof req.body?.radius?.regionCode === "string" && /^[a-z0-9_-]{2,40}$/i.test(req.body.radius.regionCode) ? req.body.radius.regionCode : null;
    const quiet = req.body?.quietHours || {};
    const validTime = (value: unknown) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    const quietHours = {
      enabled: quiet.enabled === true,
      start: validTime(quiet.start) ? quiet.start : "22:00",
      end: validTime(quiet.end) ? quiet.end : "07:00",
      allowEmergency: quiet.allowEmergency !== false,
    };
    await db.collection("notificationSubscriptions").doc(uid).set({
      userId: uid, caseIds, regionCodes,
      radius: radiusRegionCode ? {regionCode: radiusRegionCode, distanceKm: 10} : null,
      pushEnabled: req.body?.pushEnabled === true,
      quietHours, channel: "fcm", schemaVersion: 1,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return res.json({success: true, deliveryReady: process.env.NOTIFICATION_DELIVERY_ENABLED === "true"});
  });

  app.put("/api/v2/alerts/device-token", authenticate, requireNotifications, async (req: AuthedRequest, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({success: false, error: "AUTH_REQUIRED"});
    const token = cleanToken(req.body?.token);
    if (!token) return res.status(400).json({success: false, error: "INVALID_DEVICE_TOKEN"});

    const userAgent = typeof req.body?.userAgent === "string" ? req.body.userAgent.slice(0, 500) : null;
    const platform = typeof req.body?.platform === "string" && ALLOWED_PLATFORMS.has(req.body.platform) ? req.body.platform : "web";
    const tokenRef = db.collection("userTokens").doc(uid);

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(tokenRef);
      const now = admin.firestore.Timestamp.now();
      const tokens = cleanTokenMap(snapshot.data()?.tokens, now.toMillis());
      const existing = snapshot.data()?.tokens?.[token];
      tokens[token] = {
        token,
        createdAt: existing?.createdAt instanceof admin.firestore.Timestamp ? existing.createdAt : now,
        lastSeenAt: now,
        userAgent,
        platform,
      };
      transaction.set(tokenRef, {
        userId: uid,
        tokens,
        updatedAt: now,
        lastPrunedAt: now,
      });
    });

    return res.json({success: true});
  });

  app.delete("/api/v2/alerts/device-token", authenticate, requireNotifications, async (req: AuthedRequest, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({success: false, error: "AUTH_REQUIRED"});
    const token = cleanToken(req.body?.token);
    if (!token) return res.status(400).json({success: false, error: "INVALID_DEVICE_TOKEN"});
    const tokenRef = db.collection("userTokens").doc(uid);

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(tokenRef);
      if (!snapshot.exists) return;
      const now = admin.firestore.Timestamp.now();
      const tokens = cleanTokenMap(snapshot.data()?.tokens, now.toMillis());
      delete tokens[token];
      if (Object.keys(tokens).length === 0) {
        transaction.delete(tokenRef);
        return;
      }
      transaction.set(tokenRef, {userId: uid, tokens, updatedAt: now, lastPrunedAt: now});
    });

    return res.json({success: true});
  });
};
