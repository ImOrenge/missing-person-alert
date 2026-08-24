import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {Express, NextFunction, Request, Response} from "express";

type AuthedRequest = Request & {user?: admin.auth.DecodedIdToken};
type Middleware = (req: any, res: Response, next: NextFunction) => unknown;
interface Dependencies { db: admin.firestore.Firestore; authenticate: Middleware; }

const FIXED_MODULES = ["overview", "status-summary", "search", "urgent-cases", "quick-actions"];
const OPTIONAL_MODULES = ["news", "region-summary"];
const ALL_MODULES = [...FIXED_MODULES, ...OPTIONAL_MODULES];

const normalizePreferences = (value: any) => {
  const requestedOrder = Array.isArray(value?.moduleOrder) ? value.moduleOrder.filter((item: unknown): item is string => typeof item === "string" && ALL_MODULES.includes(item)) : [];
  const optionalOrder = Array.from(new Set(requestedOrder.filter((item: string) => OPTIONAL_MODULES.includes(item))));
  OPTIONAL_MODULES.forEach((item) => { if (!optionalOrder.includes(item)) optionalOrder.push(item); });
  return {
    schemaVersion: 1,
    viewport: value?.viewport === "mobile" ? "mobile" : "desktop",
    moduleOrder: [...FIXED_MODULES, ...optionalOrder],
    collapsed: Array.from(new Set((Array.isArray(value?.collapsed) ? value.collapsed : []).filter((item: unknown): item is string => typeof item === "string" && OPTIONAL_MODULES.includes(item)))),
    hidden: Array.from(new Set((Array.isArray(value?.hidden) ? value.hidden : []).filter((item: unknown): item is string => typeof item === "string" && OPTIONAL_MODULES.includes(item)))),
    density: value?.density === "compact" ? "compact" : "comfortable",
    defaultRegionCode: typeof value?.defaultRegionCode === "string" && /^[a-z0-9_-]{2,40}$/i.test(value.defaultRegionCode) ? value.defaultRegionCode : null,
    defaultExploreView: ["list", "map", "split", "cards"].includes(value?.defaultExploreView) ? value.defaultExploreView : "list",
  };
};

export const registerDashboardPreferenceRoutes = (app: Express, {db, authenticate}: Dependencies): void => {
  app.get("/api/v2/dashboard/preferences", authenticate, async (req: AuthedRequest, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({success: false, error: "AUTH_REQUIRED"});
    const snapshot = await db.collection("dashboardPreferences").doc(uid).get();
    return res.json({success: true, preferences: normalizePreferences(snapshot.data())});
  });
  app.put("/api/v2/dashboard/preferences", authenticate, async (req: AuthedRequest, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({success: false, error: "AUTH_REQUIRED"});
    const preferences = normalizePreferences(req.body);
    await db.collection("dashboardPreferences").doc(uid).set({...preferences, userId: uid, updatedAt: FieldValue.serverTimestamp()}, {merge: false});
    return res.json({success: true, preferences});
  });
};
