#!/usr/bin/env node
const admin = require("firebase-admin");
const crypto = require("crypto");
const {getGcloudCredential} = require("./gcloud-credential.js");

const ROLES = new Set(["reportModerator", "seniorModerator", "agencyOperator", "privacyOfficer", "systemAdmin"]);
const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const uidArg = value("--uid");
const email = value("--email");
const role = value("--role");
const action = value("--action");
const ticket = value("--ticket");
const actor = value("--actor");
const confirmed = args.includes("--confirm");

if ((!uidArg && !email) || (uidArg && email) || (uidArg && !/^[A-Za-z0-9:_-]{1,128}$/.test(uidArg)) || (email && !/^\S+@\S+\.\S+$/.test(email)) || !ROLES.has(role) || !["grant", "revoke"].includes(action) || !ticket || !actor || !confirmed) {
  console.error("Usage: node scripts/set-reporting-role.js (--uid <uid> | --email <email>) --role <approved-role> --action grant|revoke --ticket <change-id> --actor <operator-id> --confirm");
  process.exit(2);
}

const hash = (input) => crypto.createHash("sha256").update(input).digest("hex").slice(0, 24);

(async () => {
  if (!admin.apps.length) {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    admin.initializeApp({
      projectId,
      ...(process.env.USE_GCLOUD_CREDENTIAL === "true" ? {credential: getGcloudCredential()} : {}),
    });
  }
  const auth = admin.auth();
  const user = email ? await auth.getUserByEmail(email) : await auth.getUser(uidArg);
  const uid = user.uid;
  const claims = {...(user.customClaims || {})};
  delete claims.admin;
  if (action === "grant") claims[role] = true;
  else delete claims[role];
  await auth.setCustomUserClaims(uid, claims);
  await admin.firestore().collection("roleAuditLogs").add({
    action: `reporting_role_${action}`,
    role,
    targetUidHash: hash(uid),
    actorHash: hash(actor),
    ticket: String(ticket).slice(0, 100),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(JSON.stringify({success: true, action, role, targetUidHash: hash(uid), tokenRefreshRequired: true}));
})().catch((error) => {
  console.error(JSON.stringify({success: false, error: String(error?.code || error?.message || "ROLE_UPDATE_FAILED").slice(0, 160)}));
  process.exit(1);
});
