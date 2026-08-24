#!/usr/bin/env node
const admin = require("firebase-admin");
const crypto = require("crypto");
const {execFileSync} = require("child_process");
const {getGcloudCredential} = require("./gcloud-credential.js");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const confirmed = process.argv.includes("--confirm");
const ticket = "ops-20260823-sole-admin-contact-access";
const grantedRoles = ["agencyOperator", "privacyOfficer"];
const hash = (input) => crypto.createHash("sha256").update(String(input)).digest("hex").slice(0, 24);

const writeAuditLogsViaRest = async (targetUidHash) => {
  const executable = process.platform === "win32" ? "gcloud.cmd" : "gcloud";
  const accessToken = execFileSync(executable, ["auth", "print-access-token", "--quiet"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
  }).trim();
  const createdAt = new Date().toISOString();
  const writes = grantedRoles.map((role) => ({update: {
    name: `projects/${projectId}/databases/(default)/documents/roleAuditLogs/${ticket}-${role}`,
    fields: {
      action: {stringValue: "reporting_role_grant"},
      role: {stringValue: role},
      targetUidHash: {stringValue: targetUidHash},
      actorHash: {stringValue: hash("user-authorized-operational-fix")},
      ticket: {stringValue: ticket},
      exception: {stringValue: "sole_operator_emergency_access"},
      createdAt: {timestampValue: createdAt},
    },
  }}));
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
    method: "POST",
    headers: {Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "x-goog-user-project": projectId},
    body: JSON.stringify({writes}),
  });
  if (!response.ok) throw new Error(`ROLE_AUDIT_REST_${response.status}`);
};

if (!projectId || !confirmed) {
  console.error("Usage: GCLOUD_PROJECT=<project> USE_GCLOUD_CREDENTIAL=true node scripts/grant-sole-admin-operational-roles.js --confirm");
  process.exit(2);
}

if (!admin.apps.length) {
  admin.initializeApp({
    projectId,
    ...(process.env.USE_GCLOUD_CREDENTIAL === "true" ? {credential: getGcloudCredential()} : {}),
  });
}

(async () => {
  const auth = admin.auth();
  const candidates = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    candidates.push(...page.users.filter((user) => !user.disabled && user.customClaims?.seniorModerator === true));
    pageToken = page.pageToken;
  } while (pageToken);

  if (candidates.length !== 1) throw new Error(`SOLE_SENIOR_MODERATOR_REQUIRED:${candidates.length}`);
  const target = candidates[0];
  const claims = {...(target.customClaims || {})};
  delete claims.admin;
  for (const role of grantedRoles) claims[role] = true;

  await auth.setCustomUserClaims(target.uid, claims);
  await writeAuditLogsViaRest(hash(target.uid));

  console.log(JSON.stringify({
    success: true,
    projectId,
    targetUidHash: hash(target.uid),
    grantedRoles,
    retainedRoles: Object.keys(claims).filter((role) => claims[role] === true).sort(),
    ticket,
    tokenRefreshRequired: true,
  }, null, 2));
})().catch((error) => {
  console.error(JSON.stringify({success: false, error: String(error?.code || error?.message || "SOLE_ADMIN_ROLE_GRANT_FAILED").slice(0, 200)}));
  process.exit(1);
});
