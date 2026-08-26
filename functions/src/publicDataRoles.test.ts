import * as assert from "node:assert";
import {resolvePublicDataRoles} from "./publicDataRoles";

assert.deepEqual(resolvePublicDataRoles({systemAdmin: true}), ["admin", "operator", "analyst"]);
assert.deepEqual(resolvePublicDataRoles({agencyOperator: true}), ["operator", "analyst"]);
assert.deepEqual(resolvePublicDataRoles({reportModerator: true}), ["analyst"]);
assert.deepEqual(resolvePublicDataRoles({privacyOfficer: true}), []);
console.log("public data role mapping passed");
