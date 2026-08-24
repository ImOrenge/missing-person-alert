#!/usr/bin/env node
const admin = require('firebase-admin');
const axios = require('axios');
const {getGcloudCredential} = require('./gcloud-credential.js');
const {buildAlgoliaIndexAction} = require('../lib/search/algolia-indexing.js');
const {algoliaIndexName, normalizeAlgoliaConfig, sanitizeAlgoliaHit} = require('../lib/search/algolia-client.js');
const {FORBIDDEN_PUBLIC_SEARCH_KEYS, PUBLIC_SEARCH_ITEM_KEYS} = require('../lib/search/contracts.js');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const includeReports = args.has('--include-reports');
const confirmation = process.argv.find((value) => value.startsWith('--confirm='))?.slice('--confirm='.length);
const expectedConfirmation = 'missingalert-prod-algolia-sync';

if (apply && confirmation !== expectedConfirmation) {
  throw new Error(`Apply requires --confirm=${expectedConfirmation}`);
}

const useGcloudCredential = process.env.USE_GCLOUD_CREDENTIAL === 'true';
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;

if (!admin.apps.length && !useGcloudCredential) {
  admin.initializeApp({
    projectId,
  });
}

const config = normalizeAlgoliaConfig({
  applicationId: process.env.ALGOLIA_APPLICATION_ID,
  apiKey: process.env.ALGOLIA_WRITE_API_KEY,
  indexPrefix: process.env.ALGOLIA_INDEX_PREFIX || 'missingalert_prod',
});

const sources = [
  {kind: 'case', collection: 'missingPersons'},
  // Always reconcile the report index. When public report indexing is disabled,
  // the projection returns no upserts and the atomic replacement empties any
  // previously indexed report records.
  {kind: 'report', collection: 'publicReports'},
  {kind: 'news', collection: 'newsArticles'},
];

const makeClient = () => axios.create({
  baseURL: `https://${config.applicationId}.algolia.net`,
  timeout: 10000,
  headers: {
    'X-Algolia-Application-Id': config.applicationId,
    'X-Algolia-API-Key': config.apiKey,
    'Content-Type': 'application/json',
  },
});

const waitForTask = async (client, indexName, taskID) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await client.get(`/1/indexes/${encodeURIComponent(indexName)}/task/${taskID}`);
    if (response.data?.status === 'published') return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`ALGOLIA_TASK_TIMEOUT:${indexName}`);
};

const replaceIndexAtomically = async (client, indexName, records) => {
  const tempIndexName = `${indexName}_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const settingsResponse = await client.put(`/1/indexes/${encodeURIComponent(tempIndexName)}/settings`, indexSettings);
    await waitForTask(client, tempIndexName, settingsResponse.data.taskID);
    for (let offset = 0; offset < records.length; offset += 1000) {
      const batch = records.slice(offset, offset + 1000).map((body) => ({action: 'updateObject', body}));
      const response = await client.post(`/1/indexes/${encodeURIComponent(tempIndexName)}/batch`, {requests: batch});
      await waitForTask(client, tempIndexName, response.data.taskID);
    }
    const moveResponse = await client.post(`/1/indexes/${encodeURIComponent(tempIndexName)}/operation`, {
      operation: 'move',
      destination: indexName,
    });
    await waitForTask(client, indexName, moveResponse.data.taskID);
  } catch (error) {
    await client.delete(`/1/indexes/${encodeURIComponent(tempIndexName)}`).catch(() => undefined);
    throw error;
  }
};

const indexSettings = {
  searchableAttributes: [
    'unordered(title)',
    'unordered(summary)',
    'unordered(regionLabel)',
    'unordered(statusLabel)',
    'unordered(sourceLabel)',
  ],
  attributesForFaceting: ['kind', 'searchable(regionLabel)', 'statusLabel'],
  attributesToRetrieve: ['objectID', ...PUBLIC_SEARCH_ITEM_KEYS],
  attributesToHighlight: [],
  attributesToSnippet: [],
  paginationLimitedTo: 1000,
  typoTolerance: true,
};

const decodeFirestoreValue = (value) => {
  if (!value || typeof value !== 'object') return undefined;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('stringValue' in value) return value.stringValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ('mapValue' in value) return decodeFirestoreFields(value.mapValue.fields || {});
  return undefined;
};

const decodeFirestoreFields = (fields) => Object.fromEntries(
  Object.entries(fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)]),
);

const loadDocuments = async (collection) => {
  if (!useGcloudCredential) {
    const snapshot = await admin.firestore().collection(collection).get();
    return snapshot.docs.map((document) => ({id: document.id, data: document.data()}));
  }
  if (!projectId) throw new Error('GCLOUD_PROJECT is required with USE_GCLOUD_CREDENTIAL=true');
  const token = await getGcloudCredential().getAccessToken();
  const documents = [];
  let pageToken;
  do {
    const response = await axios.get(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${encodeURIComponent(collection)}`,
      {
        timeout: 15000,
        headers: {Authorization: `Bearer ${token.access_token}`},
        params: {pageSize: 300, ...(pageToken ? {pageToken} : {})},
      },
    );
    for (const document of response.data.documents || []) {
      const id = String(document.name || '').split('/').pop();
      if (id) documents.push({id, data: decodeFirestoreFields(document.fields)});
    }
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  return documents;
};

(async () => {
  const recordsByKind = new Map();
  const summary = {mode: apply ? 'apply' : 'dry-run', includeReports, reconciliation: 'atomic-replace', scanned: {}, eligible: {}, excluded: {}};

  for (const source of sources) {
    const documents = await loadDocuments(source.collection);
    const records = [];
    let excluded = 0;
    for (const document of documents) {
      const action = buildAlgoliaIndexAction(source.kind, document.id, document.data, includeReports);
      if (action.action === 'upsert') records.push(action.body);
      else excluded += 1;
    }
    recordsByKind.set(source.kind, records);
    summary.scanned[source.kind] = documents.length;
    summary.eligible[source.kind] = records.length;
    summary.excluded[source.kind] = excluded;
  }

  for (const records of recordsByKind.values()) {
    for (const record of records) {
      const sanitized = sanitizeAlgoliaHit(record);
      if (!sanitized) throw new Error('PUBLIC_SEARCH_RECORD_VALIDATION_FAILED');
      const serialized = JSON.stringify(record);
      for (const forbidden of FORBIDDEN_PUBLIC_SEARCH_KEYS) {
        if (serialized.includes(`"${forbidden}"`)) throw new Error(`FORBIDDEN_FIELD:${forbidden}`);
      }
    }
  }

  if (!apply) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  if (!config) throw new Error('ALGOLIA_APPLICATION_ID and restricted ALGOLIA_WRITE_API_KEY are required');

  const client = makeClient();
  for (const [kind, records] of recordsByKind.entries()) {
    const indexName = algoliaIndexName(config.indexPrefix, kind);
    await replaceIndexAtomically(client, indexName, records);
  }
  process.stdout.write(`${JSON.stringify({...summary, applied: true}, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});
