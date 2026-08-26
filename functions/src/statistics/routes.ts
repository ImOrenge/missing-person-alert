import type * as admin from "firebase-admin";
import type {Express, Request, Response} from "express";
import {POLICE_STATISTICS_SEED} from "./seed";

const projectPublishedYear = (row: Record<string, any>): Record<string, unknown> => ({
  year: row.year,
  categories: row.categories,
  totals: row.totals,
  derived: row.derived,
  source: {
    sourceId: row.source?.sourceId,
    datasetTitle: row.source?.datasetTitle,
    datasetCutoff: row.source?.datasetCutoff,
    sourceHash: row.source?.sourceHash,
    encoding: row.source?.encoding,
    officialPageUrl: row.source?.officialPageUrl || null,
  },
  schemaVersion: row.schemaVersion,
  published: row.published === true,
});

export const registerPublicStatisticsRoutes = (app: Express, db: admin.firestore.Firestore): void => {
  app.get("/api/public/statistics/yearly", async (_req: Request, res: Response) => {
    try {
      const snapshot = await db.collection("statistics_yearly").where("published", "==", true).get();
      const firestoreRows = snapshot.docs.map((doc) => projectPublishedYear(doc.data())).sort((left, right) => Number(left.year) - Number(right.year));
      const items = firestoreRows.length ? firestoreRows : POLICE_STATISTICS_SEED;
      res.set("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
      res.json({success: true, source: firestoreRows.length ? "firestore" : "verified_seed", items});
    } catch (error) {
      res.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=3600");
      res.status(200).json({success: true, source: "verified_seed", stale: true, items: POLICE_STATISTICS_SEED});
    }
  });
};
