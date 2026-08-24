#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const {getGcloudCredential} = require('./gcloud-credential.js');

const rawArgs = process.argv.slice(2);
const args = new Map();
for (let index = 0; index < rawArgs.length; index += 1) {
  const item = rawArgs[index];
  const equals = item.indexOf('=');
  if (equals > 0) {
    args.set(item.slice(0, equals), item.slice(equals + 1));
  } else if (item.startsWith('--') && rawArgs[index + 1] && !rawArgs[index + 1].startsWith('--')) {
    args.set(item, rawArgs[index + 1]);
    index += 1;
  } else {
    args.set(item, true);
  }
}
const mode = args.has('--apply') ? 'apply' : args.has('--verify') ? 'verify' : args.has('--rollback') ? 'rollback' : 'dry-run';
const runId = String(args.get('--run-id') || `legacy-reports-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const output = path.resolve(String(args.get('--output') || args.get('--report') || path.join(process.cwd(), 'artifacts', 'reporting-refactor', `migration-${runId}.json`)));

if (!admin.apps.length) {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  admin.initializeApp({
    projectId,
    ...(process.env.USE_GCLOUD_CREDENTIAL === 'true' ? {credential: getGcloudCredential()} : {}),
  });
}
const db = admin.firestore();
const {migrateLegacyReports, rollbackLegacyMigration} = require('../lib/reports/legacy-migration.js');
const {encryptContact} = require('../lib/reports/contact-encryption.js');

(async () => {
  if (mode === 'apply' && !process.env.CONTACT_KMS_KEY_NAME) throw new Error('CONTACT_KMS_KEY_NAME is required for apply mode');
  const result = mode === 'rollback'
    ? await rollbackLegacyMigration(db, runId)
    : await migrateLegacyReports(db, {runId, mode, encryptContact: mode === 'apply' ? encryptContact : undefined});
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, {encoding: 'utf8', flag: 'wx'});
  process.stdout.write(`${JSON.stringify(result)}\nReport: ${output}\n`);
})().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});
