#!/usr/bin/env node
const admin = require("firebase-admin");
const crypto = require("crypto");
const {execFileSync} = require("child_process");
const {getGcloudCredential} = require("./gcloud-credential.js");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) throw new Error("GCLOUD_PROJECT is required");
const roles = ["reportModerator", "seniorModerator", "agencyOperator", "privacyOfficer", "systemAdmin"];
const hash = (input) => crypto.createHash("sha256").update(String(input)).digest("hex").slice(0, 24);

const readRoleAuditViaRest = async () => {
  const executable = process.platform === "win32" ? "gcloud.cmd" : "gcloud";
  const accessToken = execFileSync(executable, ["auth", "print-access-token", "--quiet"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
  }).trim();
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
    method: "POST",
    headers: {Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "x-goog-user-project": projectId},
    body: JSON.stringify({structuredQuery: {
      from: [{collectionId: "roleAuditLogs"}],
      orderBy: [{field: {fieldPath: "createdAt"}, direction: "DESCENDING"}],
      limit: 50,
    }}),
  });
  if (!response.ok) throw new Error(`ROLE_AUDIT_REST_${response.status}`);
  return response.json();
};

if (!admin.apps.length) {
  admin.initializeApp({
    projectId,
    ...(process.env.USE_GCLOUD_CREDENTIAL === "true" ? {credential: getGcloudCredential()} : {}),
  });
}

(async () => {
  const assignments = [];
  let legacyAdminClaims = 0;
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const user of page.users) {
      const claims = user.customClaims || {};
      if (claims.admin === true) legacyAdminClaims += 1;
      const assignedRoles = roles.filter((role) => claims[role] === true);
      if (assignedRoles.length > 0) {
        assignments.push({
          targetUidHash: hash(user.uid),
          roles: assignedRoles,
          disabled: user.disabled,
          tokenValidAfterTime: user.tokensValidAfterTime || null,
        });
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  let roleAuditLogCount = null;
  const auditCounts = {};
  let roleAuditError = null;
  try {
    const auditRows = await readRoleAuditViaRest();
    const documents = auditRows.map((row) => row.document).filter(Boolean);
    roleAuditLogCount = documents.length;
    for (const document of documents) {
      const action = String(document.fields?.action?.stringValue || "unknown");
      auditCounts[action] = (auditCounts[action] || 0) + 1;
    }
  } catch (error) {
    roleAuditError = String(error?.code || error?.message || "ROLE_AUDIT_READ_FAILED").slice(0, 100);
  }
  const countsByRole = Object.fromEntries(roles.map((role) => [role, assignments.filter((item) => item.roles.includes(role)).length]));
  console.log(JSON.stringify({
    projectId,
    auditedAt: new Date().toISOString(),
    assignmentCount: assignments.length,
    countsByRole,
    assignments,
    legacyAdminClaims,
    roleAuditLogCount,
    auditCounts,
    roleAuditError,
  }, null, 2));
})().catch((error) => {
  console.error(JSON.stringify({success: false, error: String(error?.code || error?.message || "ROLE_AUDIT_FAILED").slice(0, 200)}));
  process.exit(1);
});
