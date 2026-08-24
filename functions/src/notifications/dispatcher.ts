import * as admin from "firebase-admin";
import {getFunctions} from "firebase-admin/functions";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {onTaskDispatched} from "firebase-functions/v2/tasks";
import * as crypto from "crypto";
import {loadReportingFeatureFlags} from "../runtimeConfig";

const REGION = "asia-northeast3";
const TARGET_QUEUE = `locations/${REGION}/functions/targetNotificationEventTask`;
const DELIVERY_QUEUE = `locations/${REGION}/functions/deliverNotificationTask`;
const ALLOWED_TYPES = new Set(["new_missing_case", "new_approved_report", "report_confirmed", "report_needs_information", "case_found", "case_closed", "notification_test"]);
const REGION_CENTERS: Record<string, {lat: number; lng: number}> = {
  seoul: {lat: 37.5665, lng: 126.9780}, busan: {lat: 35.1796, lng: 129.0756}, daegu: {lat: 35.8714, lng: 128.6014},
  incheon: {lat: 37.4563, lng: 126.7052}, gwangju: {lat: 35.1595, lng: 126.8526}, daejeon: {lat: 36.3504, lng: 127.3845},
  ulsan: {lat: 35.5384, lng: 129.3116}, sejong: {lat: 36.4800, lng: 127.2890}, gyeonggi: {lat: 37.4138, lng: 127.5183},
  gangwon: {lat: 37.8228, lng: 128.1555}, chungbuk: {lat: 36.8000, lng: 127.7000}, chungnam: {lat: 36.5184, lng: 126.8000},
  jeonbuk: {lat: 35.7175, lng: 127.1530}, jeonnam: {lat: 34.8679, lng: 126.9910}, gyeongbuk: {lat: 36.4919, lng: 128.8889},
  gyeongnam: {lat: 35.4606, lng: 128.2132}, jeju: {lat: 33.4890, lng: 126.4983},
};

type EventData = Record<string, any>;
type SubscriptionData = Record<string, any>;

const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const radians = (degrees: number) => degrees * Math.PI / 180;
const distanceKm = (a: {lat: number; lng: number}, b: {lat: number; lng: number}) => {
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export const deriveRegionCode = (label: unknown): string | null => {
  const text = typeof label === "string" ? label : "";
  const entries: Array<[string, RegExp]> = [
    ["seoul", /서울/], ["busan", /부산/], ["daegu", /대구/], ["incheon", /인천/], ["gwangju", /광주/], ["daejeon", /대전/],
    ["ulsan", /울산/], ["sejong", /세종/], ["gyeonggi", /경기/], ["gangwon", /강원/], ["chungbuk", /충북|충청북/],
    ["chungnam", /충남|충청남/], ["jeonbuk", /전북|전라북/], ["jeonnam", /전남|전라남/], ["gyeongbuk", /경북|경상북/],
    ["gyeongnam", /경남|경상남/], ["jeju", /제주/],
  ];
  return entries.find(([, pattern]) => pattern.test(text))?.[0] || null;
};

export const subscriptionMatchesEvent = (subscription: SubscriptionData, event: EventData): boolean => {
  if (subscription.pushEnabled !== true) return false;
  const targetUserIds = Array.isArray(event.targetUserIds) ? event.targetUserIds : [];
  if (event.type === "notification_test") return targetUserIds.includes(subscription.userId);
  if (targetUserIds.length > 0) return targetUserIds.includes(subscription.userId);
  if (typeof event.ownerUid === "string" && event.ownerUid) return subscription.userId === event.ownerUid;
  const caseIds = Array.isArray(subscription.caseIds) ? subscription.caseIds : [];
  if (event.caseId && caseIds.includes(event.caseId)) return true;
  const regionCode = typeof event.regionCode === "string" ? event.regionCode : deriveRegionCode(event.regionLabel);
  const regionCodes = Array.isArray(subscription.regionCodes) ? subscription.regionCodes : [];
  if (regionCode && regionCodes.includes(regionCode)) return true;
  const radius = subscription.radius;
  const center = radius && REGION_CENTERS[String(radius.regionCode || "")];
  const location = event.publicLocation;
  if (center && location && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))) {
    return distanceKm(center, {lat: Number(location.lat), lng: Number(location.lng)}) <= Math.min(50, Math.max(1, Number(radius.distanceKm) || 10));
  }
  return false;
};

export const buildNotificationContent = (event: EventData): {title: string; body: string; link: string} => {
  const region = String(event.regionLabel || "관심 지역").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 60);
  const reportLink = event.caseId
    ? `/missing/${encodeURIComponent(String(event.caseId))}`
    : event.reportId
      ? `/map?publicReportId=${encodeURIComponent(String(event.reportId))}`
      : "/map";
  if (event.type === "notification_test") return {title: "MissingAlert 알림 테스트", body: "이 기기에서 안전 알림을 정상적으로 받을 수 있습니다.", link: "/alerts"};
  if (event.type === "report_needs_information") return {title: "제보 추가정보 요청", body: "운영자가 추가정보를 요청했습니다. 내 제보에서 내용을 확인해주세요.", link: "/reports"};
  if (event.type === "case_found") return {title: "실종자 발견 안내", body: "구독한 사건이 발견 상태로 전환되었습니다.", link: `/missing/${encodeURIComponent(String(event.caseId || ""))}`};
  if (event.type === "case_closed") return {title: "사건 알림 종료", body: "구독한 사건의 알림이 종료되었습니다.", link: `/missing/${encodeURIComponent(String(event.caseId || ""))}`};
  if (event.type === "report_confirmed") return {title: "관계기관 확인 제보", body: `${region} 일대 제보가 관계기관 확인 상태로 변경되었습니다.`, link: reportLink};
  if (event.type === "new_missing_case") return {title: "새로운 공식 실종 정보", body: `${region} 일대의 새로운 공식 실종 정보를 확인해주세요.`, link: `/missing/${encodeURIComponent(String(event.caseId || ""))}`};
  return {title: "새로운 검토 완료 제보", body: `${region} 일대에서 새로운 목격 제보가 공개되었습니다.`, link: reportLink};
};

const quietHoursDelay = (subscription: SubscriptionData, event: EventData, now = new Date()): Date | undefined => {
  const quiet = subscription.quietHours;
  if (!quiet?.enabled) return undefined;
  if (event.emergency === true && quiet.allowEmergency === true) return undefined;
  const formatter = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Seoul", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"});
  const values = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const currentMinutes = Number(values.hour) * 60 + Number(values.minute);
  const parse = (value: unknown, fallback: number) => typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : fallback;
  const start = parse(quiet.start, 22 * 60);
  const end = parse(quiet.end, 7 * 60);
  const inside = start < end ? currentMinutes >= start && currentMinutes < end : currentMinutes >= start || currentMinutes < end;
  if (!inside) return undefined;
  const minutesUntilEnd = currentMinutes < end ? end - currentMinutes : (24 * 60 - currentMinutes) + end;
  return new Date(now.getTime() + Math.max(1, minutesUntilEnd) * 60_000);
};

const enqueueTarget = async (eventId: string) => getFunctions().taskQueue(TARGET_QUEUE).enqueue({eventId});
const enqueueDelivery = async (eventId: string, deliveryId: string, scheduleTime?: Date) => getFunctions()
  .taskQueue(DELIVERY_QUEUE)
  .enqueue({eventId, deliveryId}, scheduleTime ? {scheduleTime} : undefined);

const canEnqueueTaskQueue = (): boolean =>
  process.env.FUNCTIONS_EMULATOR !== "true" ||
  process.env.REPORTING_TASK_QUEUE_EMULATOR_ENABLED === "true";

export const materializeNotificationEvent = async (
  db: FirebaseFirestore.Firestore,
  eventId: string,
  enqueue: (eventId: string, deliveryId: string, scheduleTime?: Date) => Promise<void> = enqueueDelivery,
): Promise<{targeted: number; existing: number}> => {
  const eventRef = db.collection("notificationEvents").doc(eventId);
  const eventSnapshot = await eventRef.get();
  if (!eventSnapshot.exists) return {targeted: 0, existing: 0};
  const event = eventSnapshot.data() || {};
  if (!ALLOWED_TYPES.has(event.type)) {
    await eventRef.set({status: "suppressed", suppressionCode: "UNSUPPORTED_EVENT", processedAt: FieldValue.serverTimestamp()}, {merge: true});
    return {targeted: 0, existing: 0};
  }
  await eventRef.set({status: "targeting", targetingStartedAt: FieldValue.serverTimestamp()}, {merge: true});
  const subscriptions = await db.collection("notificationSubscriptions").where("pushEnabled", "==", true).limit(5000).get();
  let targeted = 0;
  let existing = 0;
  for (const document of subscriptions.docs) {
    const subscription = {...document.data(), userId: document.id};
    if (!subscriptionMatchesEvent(subscription, event)) continue;
    const deliveryId = hash(`${document.id}|${event.type}|${event.caseId || ""}|${event.reportId || ""}|fcm`);
    const deliveryRef = eventRef.collection("deliveries").doc(deliveryId);
    const deliveryState = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(deliveryRef);
      if (current.exists) return current.data()?.status === "enqueue_failed" ? "retry_enqueue" : "existing";
      transaction.create(deliveryRef, {
        deliveryId, userId: document.id, userIdHash: hash(document.id).slice(0, 24), channel: "fcm",
        status: "queued", attempts: 0, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      });
      return "created";
    });
    if (deliveryState === "existing") {
      existing += 1;
      continue;
    }
    targeted += 1;
    try {
      await enqueue(eventId, deliveryId, quietHoursDelay(subscription, event));
      if (deliveryState === "retry_enqueue") await deliveryRef.set({status: "queued", lastErrorCode: null, updatedAt: Timestamp.now()}, {merge: true});
    } catch (error: any) {
      await deliveryRef.set({status: "enqueue_failed", lastErrorCode: String(error?.code || "TASK_ENQUEUE_FAILED").slice(0, 80), updatedAt: Timestamp.now()}, {merge: true});
      throw error;
    }
  }
  await eventRef.set({status: "targeted", targetedCount: targeted + existing, newlyTargetedCount: targeted, targetedAt: Timestamp.now()}, {merge: true});
  return {targeted, existing};
};

export const queueNotificationEvent = onDocumentCreated({region: REGION, document: "notificationEvents/{eventId}"}, async (event) => {
  const db = admin.firestore();
  const flags = await loadReportingFeatureFlags(db).catch(() => null);
  if (!flags?.reports_notifications_enabled || process.env.NOTIFICATION_DELIVERY_ENABLED !== "true") {
    await event.data?.ref.set({status: "awaiting_delivery_activation", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return;
  }
  if (!canEnqueueTaskQueue()) {
    await event.data?.ref.set({
      status: "awaiting_emulator_task_queue",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return;
  }
  await enqueueTarget(event.params.eventId);
  await event.data?.ref.set({status: "queued_for_targeting", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
});

export const createNewMissingCaseNotification = onDocumentCreated({region: REGION, document: "missingPersons/{caseId}"}, async (event) => {
  const data = event.data?.data() || {};
  if (data.source !== "api" || data.status !== "active") return;
  const db = admin.firestore();
  const flags = await loadReportingFeatureFlags(db).catch(() => null);
  if (!flags?.reports_notifications_enabled) return;
  const regionLabel = String(data.location?.address || "지역 정보 확인 필요").slice(0, 80);
  const eventId = `new-missing-case-${event.params.caseId}`;
  await db.collection("notificationEvents").doc(eventId).create({
    eventId, type: "new_missing_case", caseId: event.params.caseId,
    regionLabel, regionCode: deriveRegionCode(regionLabel), emergency: data.emergency === true || data.urgent === true,
    status: "pending", createdAt: Timestamp.now(),
  }).catch((error: any) => {
    if (error?.code !== 6 && error?.code !== "already-exists") throw error;
  });
});

export const targetNotificationEventTask = onTaskDispatched({
  region: REGION,
  retryConfig: {maxAttempts: 5, minBackoffSeconds: 10, maxBackoffSeconds: 300, maxDoublings: 4},
  rateLimits: {maxConcurrentDispatches: 5, maxDispatchesPerSecond: 10},
  timeoutSeconds: 540,
}, async (request) => {
  const eventId = typeof request.data?.eventId === "string" ? request.data.eventId : "";
  if (!eventId) throw new Error("EVENT_ID_REQUIRED");
  await materializeNotificationEvent(admin.firestore(), eventId);
});

const TRANSIENT_CODES = new Set(["messaging/internal-error", "messaging/server-unavailable", "messaging/unknown-error", "messaging/quota-exceeded"]);
const PERMANENT_CODES = new Set(["messaging/invalid-registration-token", "messaging/registration-token-not-registered", "messaging/invalid-argument"]);

export const deliverNotificationTask = onTaskDispatched({
  region: REGION,
  retryConfig: {maxAttempts: 8, minBackoffSeconds: 30, maxBackoffSeconds: 3600, maxDoublings: 6},
  rateLimits: {maxConcurrentDispatches: 20, maxDispatchesPerSecond: 50},
  timeoutSeconds: 120,
}, async (request) => {
  const eventId = typeof request.data?.eventId === "string" ? request.data.eventId : "";
  const deliveryId = typeof request.data?.deliveryId === "string" ? request.data.deliveryId : "";
  if (!eventId || !deliveryId) throw new Error("DELIVERY_ID_REQUIRED");
  const db = admin.firestore();
  const flags = await loadReportingFeatureFlags(db).catch(() => null);
  const eventRef = db.collection("notificationEvents").doc(eventId);
  const deliveryRef = eventRef.collection("deliveries").doc(deliveryId);
  const [eventSnapshot, deliverySnapshot] = await Promise.all([eventRef.get(), deliveryRef.get()]);
  if (!eventSnapshot.exists || !deliverySnapshot.exists) return;
  const delivery = deliverySnapshot.data() || {};
  if (delivery.status === "sent" || delivery.status === "permanent_failed" || delivery.status === "suppressed") return;
  if (!flags?.reports_notifications_enabled || process.env.NOTIFICATION_DELIVERY_ENABLED !== "true") {
    await deliveryRef.set({status: "suppressed", suppressionCode: "DELIVERY_DISABLED", updatedAt: Timestamp.now()}, {merge: true});
    return;
  }
  const userId = typeof delivery.userId === "string" ? delivery.userId : "";
  const tokenRef = db.collection("userTokens").doc(userId);
  const tokenSnapshot = await tokenRef.get();
  const tokenMap = tokenSnapshot.data()?.tokens;
  const entries = tokenMap && typeof tokenMap === "object" ? Object.entries(tokenMap) as Array<[string, any]> : [];
  const tokens = entries.map(([, value]) => value?.token).filter((value): value is string => typeof value === "string" && value.length > 0).slice(0, 20);
  if (tokens.length === 0) {
    await deliveryRef.set({status: "permanent_failed", lastErrorCode: "NO_ACTIVE_TOKEN", updatedAt: Timestamp.now()}, {merge: true});
    return;
  }
  const content = buildNotificationContent(eventSnapshot.data() || {});
  await deliveryRef.set({status: "sending", attempts: FieldValue.increment(1), updatedAt: Timestamp.now()}, {merge: true});
  const result = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {title: content.title, body: content.body},
    data: {eventId, link: content.link, type: String(eventSnapshot.data()?.type || "")},
    webpush: {fcmOptions: {link: content.link}},
  });
  const invalidTokens = new Set<string>();
  let transientFailure = false;
  const providerErrorCodes = Array.from(new Set(
    result.responses
      .map((response) => response.error?.code || "")
      .filter((code) => code.length > 0),
  )).slice(0, 10);
  result.responses.forEach((response, index) => {
    const code = response.error?.code || "";
    if (PERMANENT_CODES.has(code)) invalidTokens.add(tokens[index]);
    if (TRANSIENT_CODES.has(code)) transientFailure = true;
  });
  if (invalidTokens.size > 0 && tokenSnapshot.exists) {
    const retained = Object.fromEntries(entries.filter(([, value]) => !invalidTokens.has(value?.token)));
    await tokenRef.set({tokens: retained, lastPrunedAt: Timestamp.now(), updatedAt: Timestamp.now()}, {merge: true});
  }
  if (transientFailure || (result.failureCount > 0 && result.successCount === 0 && invalidTokens.size === 0)) {
    console.error("[NotificationDelivery] FCM send failed", {eventId, deliveryId, providerErrorCodes});
    await deliveryRef.set({status: "retrying", lastErrorCode: "FCM_TRANSIENT_FAILURE", providerErrorCodes, successCount: result.successCount, failureCount: result.failureCount, updatedAt: Timestamp.now()}, {merge: true});
    throw new Error("FCM_TRANSIENT_FAILURE");
  }
  await deliveryRef.set({
    status: result.successCount > 0 ? "sent" : "permanent_failed",
    lastErrorCode: result.successCount > 0 ? null : "ALL_TOKENS_INVALID",
    providerErrorCodes,
    successCount: result.successCount, failureCount: result.failureCount, sentAt: result.successCount > 0 ? Timestamp.now() : null, updatedAt: Timestamp.now(),
  }, {merge: true});
});

export const requeuePendingNotificationEvents = onSchedule({
  region: REGION, schedule: "every 5 minutes", timeZone: "Asia/Seoul", timeoutSeconds: 300,
}, async () => {
  if (process.env.NOTIFICATION_DELIVERY_ENABLED !== "true") return;
  const db = admin.firestore();
  const flags = await loadReportingFeatureFlags(db).catch(() => null);
  if (!flags?.reports_notifications_enabled) return;
  const snapshots = await Promise.all([
    db.collection("notificationEvents").where("status", "==", "pending").limit(100).get(),
    db.collection("notificationEvents").where("status", "==", "awaiting_delivery_activation").limit(100).get(),
  ]);
  for (const document of snapshots.flatMap((snapshot) => snapshot.docs)) {
    await enqueueTarget(document.id);
    await document.ref.set({status: "queued_for_targeting", updatedAt: Timestamp.now()}, {merge: true});
  }
});
