import * as admin from "firebase-admin";
import * as crypto from "crypto";
import * as logger from "firebase-functions/logger";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {loadReportingFeatureFlags, loadSearchFeatureFlags} from "../runtimeConfig";
import {applyAlgoliaIndexAction, buildAlgoliaIndexAction} from "./algolia-indexing";
import {PublicSearchKind} from "./contracts";
import {getAlgoliaWriteConfig} from "./algolia-runtime";

const getDb = () => admin.firestore();

const objectIdFingerprint = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);

const syncDocument = async (
  kind: PublicSearchKind,
  objectId: string,
  data: Record<string, unknown> | undefined,
): Promise<void> => {
  const db = getDb();
  const [searchFlags, reportingFlags] = await Promise.all([
    loadSearchFeatureFlags(db),
    loadReportingFeatureFlags(db),
  ]);
  if (!searchFlags.algolia_indexing_enabled) return;
  const includeReports = reportingFlags.reports_public_indexing_enabled;
  const action = buildAlgoliaIndexAction(kind, objectId, data, includeReports);
  await applyAlgoliaIndexAction(await getAlgoliaWriteConfig(), action);
  logger.info("Algolia public index synchronized", {
    kind,
    action: action.action,
    objectIdFingerprint: objectIdFingerprint(objectId),
  });
};

const commonOptions = {
  region: "asia-northeast3",
  memory: "256MiB" as const,
  timeoutSeconds: 60,
  retry: true,
};

export const syncAlgoliaOfficialCase = onDocumentWritten({
  ...commonOptions,
  document: "missingPersons/{documentId}",
}, async (event) => {
  const after = event.data?.after;
  await syncDocument("case", event.params.documentId, after?.exists ? after.data() : undefined);
});

export const syncAlgoliaPublicReport = onDocumentWritten({
  ...commonOptions,
  document: "publicReports/{documentId}",
}, async (event) => {
  const after = event.data?.after;
  await syncDocument("report", event.params.documentId, after?.exists ? after.data() : undefined);
});

export const syncAlgoliaNewsArticle = onDocumentWritten({
  ...commonOptions,
  document: "newsArticles/{documentId}",
}, async (event) => {
  const after = event.data?.after;
  await syncDocument("news", event.params.documentId, after?.exists ? after.data() : undefined);
});
