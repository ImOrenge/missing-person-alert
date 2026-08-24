import {onObjectFinalized} from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import sharp from "sharp";
import {loadReportingFeatureFlags} from "../runtimeConfig";

const ORIGINAL_PATH = /^report-private\/([^/]+)\/drafts\/([A-Za-z0-9_-]{16,80})\/([a-f0-9]{32})$/;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const signatureMatches = (contentType: string, header: Buffer): boolean => {
  if (contentType === "image/jpeg") return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (contentType === "image/png") return header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === "image/webp") return header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
};

export const processReportMediaUpload = onObjectFinalized({
  region: "asia-east1",
  memory: "1GiB",
  timeoutSeconds: 120,
}, async (event) => {
  const object = event.data;
  const name = object.name || "";
  const match = ORIGINAL_PATH.exec(name);
  if (!match) return;
  const [, ownerUid, draftId, mediaId] = match;
  const db = admin.firestore();
  const bucket = admin.storage().bucket(object.bucket);
  const sourceFile = bucket.file(name);
  const mediaRef = db.collection("reportMediaDrafts").doc(draftId).collection("media").doc(mediaId);
  const contentType = object.contentType || "";
  const size = Number(object.size || 0);
  const inputPath = path.join(os.tmpdir(), `missingalert-media-${event.id}-${mediaId}.input`);
  const outputPath = path.join(os.tmpdir(), `missingalert-media-${event.id}-${mediaId}.webp`);

  try {
    const flags = await loadReportingFeatureFlags(db);
    if (!flags.reports_media_enabled) throw new Error("MEDIA_FEATURE_DISABLED");
    if (!ALLOWED_CONTENT_TYPES.has(contentType) || !Number.isFinite(size) || size <= 0 || size > MAX_BYTES) throw new Error("MEDIA_POLICY_REJECTED");
    await sourceFile.download({destination: inputPath});
    const handle = await fs.open(inputPath, "r");
    const header = Buffer.alloc(16);
    await handle.read(header, 0, 16, 0);
    await handle.close();
    if (!signatureMatches(contentType, header)) throw new Error("MEDIA_SIGNATURE_MISMATCH");

    const metadata = await sharp(inputPath, {failOn: "error", limitInputPixels: 40_000_000}).metadata();
    if (!metadata.width || !metadata.height) throw new Error("MEDIA_DIMENSIONS_INVALID");
    await sharp(inputPath, {failOn: "error", limitInputPixels: 40_000_000})
      .rotate()
      .resize({width: 2400, height: 2400, fit: "inside", withoutEnlargement: true})
      .webp({quality: 85})
      .toFile(outputPath);

    const normalizedPath = `report-private/${ownerUid}/normalized/${draftId}/${mediaId}.webp`;
    await bucket.upload(outputPath, {
      destination: normalizedPath,
      metadata: {contentType: "image/webp", cacheControl: "private,max-age=0,no-store", metadata: {ownerUid, draftId, mediaId, exifStripped: "true"}},
    });
    await mediaRef.set({
      mediaId, ownerUid, draftId, originalPath: name, normalizedPath,
      originalContentType: contentType, originalSize: size,
      width: metadata.width, height: metadata.height,
      scanStatus: "normalized", exifStripped: true,
      manualMaskConfirmed: false, createdAt: FieldValue.serverTimestamp(),
    }, {merge: false});
  } catch (error: any) {
    const quarantinePath = `report-quarantine/${ownerUid}/${draftId}/${mediaId}`;
    try {
      await sourceFile.copy(bucket.file(quarantinePath));
      await sourceFile.delete();
    } catch {
      // 후속 보안 작업이 원본을 공개하지 않으며 Rules도 직접 읽기를 차단한다.
    }
    await mediaRef.set({
      mediaId, ownerUid, draftId, scanStatus: "rejected",
      rejectionCode: String(error?.message || "MEDIA_PROCESSING_FAILED").slice(0, 80),
      createdAt: FieldValue.serverTimestamp(),
    }, {merge: false});
  } finally {
    await Promise.all([fs.rm(inputPath, {force: true}), fs.rm(outputPath, {force: true})]);
  }
});
