import * as crypto from "crypto";
import {Timestamp} from "firebase-admin/firestore";

export const consumeReportingRateLimit = async (
  db: FirebaseFirestore.Firestore,
  subject: string,
  options: {max: number; windowMs: number; now?: Timestamp} = {max: 20, windowMs: 5 * 60_000},
): Promise<{allowed: boolean; remaining: number; retryAfterSeconds: number}> => {
  const now = options.now || Timestamp.now();
  const windowStart = Math.floor(now.toMillis() / options.windowMs) * options.windowMs;
  const subjectHash = crypto.createHash("sha256").update(subject).digest("hex").slice(0, 32);
  const reference = db.collection("reportRateLimits").doc(`${subjectHash}_${windowStart}`);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const count = Number(snapshot.data()?.count || 0);
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + options.windowMs - now.toMillis()) / 1000));
    if (count >= options.max) return {allowed: false, remaining: 0, retryAfterSeconds};
    transaction.set(reference, {
      subjectHash,
      count: count + 1,
      windowStart: Timestamp.fromMillis(windowStart),
      expiresAt: Timestamp.fromMillis(windowStart + options.windowMs * 2),
      updatedAt: now,
    }, {merge: true});
    return {allowed: true, remaining: Math.max(0, options.max - count - 1), retryAfterSeconds};
  });
};
