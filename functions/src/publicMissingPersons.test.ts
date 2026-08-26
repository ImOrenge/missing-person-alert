import * as assert from "node:assert";
import {projectPublicMissingPerson} from "./publicMissingPersons";

const projected = projectPublicMissingPerson("case-1", {
  name: "공개 이름",
  source: "api",
  status: "active",
  seoVisible: true,
  location: {lat: 37.5, lng: 127, address: "서울특별시 중구"},
  reportedBy: {uid: "must-not-leak", phone: "010-0000-0000"},
  contentFingerprint: "internal-hash",
  sourceTrace: {agency: "경찰청", sourceRecordKey: "internal-record-key"},
}, "2026-08-26T00:00:00.000Z");

assert.ok(projected);
assert.equal(projected?.id, "case-1");
assert.equal((projected?.sourceTrace as Record<string, unknown>).agency, "경찰청");
assert.equal(JSON.stringify(projected).includes("must-not-leak"), false);
assert.equal(JSON.stringify(projected).includes("internal-record-key"), false);
assert.equal(JSON.stringify(projected).includes("internal-hash"), false);
assert.equal(projectPublicMissingPerson("case-2", {source: "api", status: "found"}), null);

console.log("publicMissingPersons projection contract passed");
