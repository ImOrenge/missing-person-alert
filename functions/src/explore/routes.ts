import * as admin from "firebase-admin";
import {Express, Request, Response} from "express";
import {loadReportingFeatureFlags} from "../runtimeConfig";
import {distanceBetween, geohashQueryBounds} from "geofire-common";

const numberQuery = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

export const registerPublicExploreRoutes = (app: Express, db: admin.firestore.Firestore): void => {
  app.get("/api/v2/explore/reports", async (req: Request, res: Response) => {
    const flags = await loadReportingFeatureFlags(db).catch(() => null);
    if (!flags?.reports_map_layer_enabled) return res.status(404).json({success: false, error: "REPORT_MAP_LAYER_DISABLED"});
    const west = numberQuery(req.query.west);
    const south = numberQuery(req.query.south);
    const east = numberQuery(req.query.east);
    const north = numberQuery(req.query.north);
    const zoom = numberQuery(req.query.zoom);
    const limit = Math.min(200, Math.max(1, numberQuery(req.query.limit) || 200));
    if ([west, south, east, north, zoom].some((value) => value === null) || west! < 124 || east! > 132 || south! < 33 || north! > 39.5 || west! >= east! || south! >= north!) return res.status(400).json({success: false, error: "INVALID_BBOX"});
    const area = (east! - west!) * (north! - south!);
    const maxArea = zoom! >= 10 ? 4 : zoom! >= 8 ? 20 : 60;
    if (area > maxArea) return res.status(400).json({success: false, error: "BBOX_TOO_LARGE_FOR_ZOOM"});
    const center: [number, number] = [(south! + north!) / 2, (west! + east!) / 2];
    const radiusM = distanceBetween(center, [north!, east!]) * 1000;
    const bounds = geohashQueryBounds(center, radiusM);
    const snapshots = await Promise.all(bounds.map(([start, end]) => db.collection("publicReports")
      .orderBy("publicGeohash")
      .startAt(start)
      .endAt(end)
      .limit(250)
      .get()));
    const documents = Array.from(new Map(snapshots.flatMap((snapshot) => snapshot.docs).map((document) => [document.id, document])).values());
    const items = documents.flatMap((document) => {
      const data = document.data();
      const location = data.publicLocation || {};
      const lat = Number(location.lat);
      const lng = Number(location.lng);
      const expiresAtMillis = typeof data.expiresAt?.toMillis === "function" ? data.expiresAt.toMillis() : NaN;
      if ((Number.isFinite(expiresAtMillis) && expiresAtMillis <= Date.now()) || !["approved", "forwarded", "confirmed"].includes(data.status) || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < south! || lat > north! || lng < west! || lng > east!) return [];
      return [{
        id: document.id, kind: "report", caseId: String(data.caseId || ""), reportType: String(data.reportType || "sighting"),
        occurredAt: String(data.occurredAt || ""), publicDescription: String(data.publicDescription || "").slice(0, 2000),
        publicLocationText: String(data.publicLocationText || "지역 비공개").slice(0, 200),
        publicLocation: {lat, lng}, publicRadiusM: Math.max(500, Number(data.publicRadiusM) || 500),
        publicStatus: data.status, sourceLabel: data.status === "confirmed" ? "사용자 제보 · 관계기관 확인" : data.status === "forwarded" ? "사용자 제보 · 관계기관 전달" : "사용자 제보 · 운영 검토 완료",
        href: data.caseId
          ? `/missing/${encodeURIComponent(String(data.caseId))}#public-report-${encodeURIComponent(document.id)}`
          : `/map?publicReportId=${encodeURIComponent(document.id)}`,
      }];
    }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, limit);
    res.set("Cache-Control", "public, max-age=0, s-maxage=30, must-revalidate");
    return res.json({success: true, items, total: items.length, capped: snapshots.some((snapshot) => snapshot.size >= 250)});
  });
};
