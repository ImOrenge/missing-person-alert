import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {onRequest} from "firebase-functions/v2/https";
import {buildActiveShareHtml, buildUnavailableShareHtml} from "./sharePage";

const isSafeCaseId = (value: string): boolean =>
  value.length > 0 && value.length <= 200 && !/[\/\u0000-\u001f\u007f]/.test(value);

const caseIdFromPath = (path: string): string | null => {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0 || segments[segments.length - 1] === "share") return null;
  const raw = segments[segments.lastIndexOf("share") + 1] || segments[segments.length - 1] || "";
  try {
    const decoded = decodeURIComponent(raw);
    return isSafeCaseId(decoded) ? decoded : null;
  } catch (_error) {
    return null;
  }
};

const htmlHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

export const renderSharePage = onRequest({
  region: "asia-northeast3",
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 5,
}, async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).set({...htmlHeaders, Allow: "GET, HEAD", "Cache-Control": "no-store"}).send(buildUnavailableShareHtml());
    return;
  }
  const caseId = caseIdFromPath(req.path);
  if (!caseId) {
    res.status(400).set({...htmlHeaders, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive"}).send(buildUnavailableShareHtml());
    return;
  }
  try {
    const snapshot = await admin.firestore().collection("missingPersons").doc(caseId).get();
    const data = snapshot.data();
    if (!snapshot.exists || !data) {
      res.status(404).set({...htmlHeaders, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive"}).send(buildUnavailableShareHtml());
      return;
    }
    const shareable = data.source === "api" && data.status === "active" && data.seoVisible !== false
      && data.visibility?.public !== false && data.visibility?.shareable !== false;
    if (!shareable) {
      res.status(410).set({...htmlHeaders, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive"}).send(buildUnavailableShareHtml());
      return;
    }
    res.status(200).set({
      ...htmlHeaders,
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=60",
      "X-Robots-Tag": "noindex, follow, noarchive",
    }).send(buildActiveShareHtml({id: snapshot.id, ...data}));
  } catch (error) {
    logger.error("Share preview rendering failed", {caseIdLength: caseId.length, errorCode: error instanceof Error ? error.name : "unknown"});
    res.status(503).set({...htmlHeaders, "Cache-Control": "no-store", "Retry-After": "60", "X-Robots-Tag": "noindex, nofollow"}).send(buildUnavailableShareHtml());
  }
});
