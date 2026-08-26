import {HttpsError, onCall} from "firebase-functions/v2/https";
import {ingestStatisticsBuffer} from "./ingest";
import {getHighestPublicDataRole, hasPublicDataRole} from "../publicDataRoles";

interface ImportRequest {
  contentBase64: string;
  encoding?: "cp949" | "utf8" | "utf-8";
  dryRun?: boolean;
  datasetCutoff?: string | null;
  officialPageUrl?: string | null;
  reason?: string;
}

export const importPoliceStatistics = onCall({
  region: "asia-northeast3",
  enforceAppCheck: true,
  timeoutSeconds: 120,
  memory: "512MiB",
  maxInstances: 2,
}, async (request) => {
  const token = (request.auth?.token || {}) as Record<string, unknown>;
  if (!hasPublicDataRole(token, ["admin", "operator"])) throw new HttpsError("permission-denied", "Public data operator permission required");

  const data = request.data as Partial<ImportRequest>;
  if (!data.contentBase64 || typeof data.contentBase64 !== "string") throw new HttpsError("invalid-argument", "contentBase64 is required");
  const buffer = Buffer.from(data.contentBase64, "base64");
  if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) throw new HttpsError("invalid-argument", "CSV must be between 1 byte and 5 MiB");

  const dryRun = data.dryRun !== false;
  const reason = String(data.reason || "").trim();
  if (!dryRun && (reason.length < 3 || reason.length > 500)) throw new HttpsError("invalid-argument", "reason must be 3-500 characters for import");
  return ingestStatisticsBuffer({
    buffer,
    encoding: data.encoding || "cp949",
    trigger: "manual_admin",
    actorUid: request.auth?.uid,
    dryRun,
    datasetCutoff: data.datasetCutoff || null,
    officialPageUrl: data.officialPageUrl || null,
    reason: reason || null,
    actorRole: getHighestPublicDataRole(token),
  });
});
