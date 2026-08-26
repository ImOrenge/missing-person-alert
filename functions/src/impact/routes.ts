import type * as admin from "firebase-admin";
import type {Express, Request, Response} from "express";
import {projectPublicImpactMonth} from "./model";

export const registerPublicImpactRoutes = (app: Express, db: admin.firestore.Firestore): void => {
  app.get("/api/public/impact/monthly", async (_req: Request, res: Response) => {
    try {
      const snapshot = await db.collection("impact_monthly").where("published", "==", true).limit(36).get();
      const items = snapshot.docs
        .map((doc) => projectPublicImpactMonth(doc.data()))
        .filter((item): item is Record<string, unknown> => item !== null)
        .sort((left, right) => String(left.month).localeCompare(String(right.month)));
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400");
      res.json({success: true, items});
    } catch (_error) {
      res.set("Cache-Control", "no-store");
      res.status(503).json({success: false, items: [], error: "impact_temporarily_unavailable"});
    }
  });
};
