import {CreateReportInput, ReportType} from "./contracts";

const REPORT_TYPES: ReportType[] = ["sighting", "lead", "new_case_lead"];
const CLIENT_REQUEST_ID = /^[A-Za-z0-9_-]{16,80}$/;
const CASE_ID = /^[A-Za-z0-9_-]{1,200}$/;
const MEDIA_ID = /^[a-f0-9]{32}$/;
const PHONE = /^\+?[0-9][0-9 -]{7,19}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,30}$/;
const RESIDENT_NUMBER = /(?:^|\D)\d{6}-?[1-4]\d{6}(?:\D|$)/;
const URL = /https?:\/\/|www\./gi;
const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));

const cleanText = (value: unknown, maxLength: number): string =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength) : "";

export const validateCreateReportInput = (value: unknown): {ok: true; input: CreateReportInput} | {ok: false; error: string} => {
  if (!value || typeof value !== "object") return {ok: false, error: "INVALID_BODY"};
  const source = value as Record<string, any>;
  if (!hasOnlyKeys(source, ["clientRequestId", "caseId", "reportType", "occurredAt", "location", "description", "mediaIds", "contact", "consent"])) return {ok: false, error: "UNKNOWN_INPUT_FIELD"};
  const clientRequestId = cleanText(source.clientRequestId, 80);
  const caseId = cleanText(source.caseId, 200) || undefined;
  const reportType = source.reportType as ReportType;
  const occurredAt = cleanText(source.occurredAt, 40);
  const occurredAtMillis = Date.parse(occurredAt);
  const now = Date.now();
  const location = source.location && typeof source.location === "object" ? source.location : {};
  const address = cleanText(location.address, 300);
  if (!hasOnlyKeys(location, ["address", "lat", "lng", "placeId"])) return {ok: false, error: "UNKNOWN_LOCATION_FIELD"};
  const lat = location.lat;
  const lng = location.lng;
  const description = cleanText(source.description, 2000);
  const rawMediaIds = source.mediaIds === undefined ? [] : source.mediaIds;
  if (!Array.isArray(rawMediaIds) || rawMediaIds.length > 5 || rawMediaIds.some((item: unknown) => typeof item !== "string" || !MEDIA_ID.test(item))) return {ok: false, error: "INVALID_MEDIA_IDS"};
  const mediaIds = Array.from(new Set(rawMediaIds as string[]));
  const consent = source.consent && typeof source.consent === "object" ? source.consent : {};
  if (!hasOnlyKeys(consent, ["processing", "accuracy", "sensitiveLocation"])) return {ok: false, error: "UNKNOWN_CONSENT_FIELD"};

  if (!CLIENT_REQUEST_ID.test(clientRequestId)) return {ok: false, error: "INVALID_CLIENT_REQUEST_ID"};
  if (!REPORT_TYPES.includes(reportType)) return {ok: false, error: "INVALID_REPORT_TYPE"};
  if (reportType !== "new_case_lead" && !caseId) return {ok: false, error: "CASE_ID_REQUIRED"};
  if (caseId && !CASE_ID.test(caseId)) return {ok: false, error: "INVALID_CASE_ID"};
  if (!Number.isFinite(occurredAtMillis) || occurredAtMillis > now + 5 * 60_000 || occurredAtMillis < now - 365 * 24 * 60 * 60_000) return {ok: false, error: "INVALID_OCCURRED_AT"};
  if (!address || address.length < 3 || typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39.5 || lng < 124 || lng > 132) return {ok: false, error: "INVALID_LOCATION"};
  if (typeof source.description !== "string" || source.description.length > 2000 || description.length < 20) return {ok: false, error: "INVALID_DESCRIPTION"};
  if (RESIDENT_NUMBER.test(description)) return {ok: false, error: "SENSITIVE_IDENTIFIER_NOT_ALLOWED"};
  if ((description.match(URL) || []).length > 2) return {ok: false, error: "URL_SPAM_NOT_ALLOWED"};
  if (consent.processing !== true || consent.accuracy !== true || consent.sensitiveLocation !== true) return {ok: false, error: "CONSENT_REQUIRED"};

  const contactSource = source.contact && typeof source.contact === "object" ? source.contact : undefined;
  if (contactSource && !hasOnlyKeys(contactSource, ["phone", "email", "preferred"])) return {ok: false, error: "UNKNOWN_CONTACT_FIELD"};
  const phone = cleanText(contactSource?.phone, 30);
  const email = cleanText(contactSource?.email, 200).toLowerCase();
  if ((phone && !PHONE.test(phone)) || (email && !EMAIL.test(email))) return {ok: false, error: "INVALID_CONTACT"};
  const preferred = contactSource?.preferred === "email" && email ? "email" as const : phone ? "phone" as const : "email" as const;
  const contact = phone || email ? {phone: phone || undefined, email: email || undefined, preferred} : undefined;
  const placeId = cleanText(location.placeId, 200);
  const normalizedLocation: CreateReportInput["location"] = {address, lat, lng};
  if (placeId) normalizedLocation.placeId = placeId;

  return {ok: true, input: {
    clientRequestId, caseId, reportType, occurredAt: new Date(occurredAtMillis).toISOString(),
    location: normalizedLocation,
    description, mediaIds, contact,
    consent: {processing: true, accuracy: true, sensitiveLocation: true},
  }};
};
