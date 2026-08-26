import * as assert from "node:assert";
import {parseAndNormalizeStatistics, sha256} from "./normalize";

const csv = `연도,18세_미만_아동_접수,18세_미만_아동_해제,18세_미만_아동_미해제,지적자폐성정신장애인_접수,지적자폐성정신장애인_해제,지적자폐성정신장애인_미해제,치매환자_접수,치매환자_해제,치매환자_미해제,가출인(실종성인)_접수,가출인(실종성인)_해제,가출인(실종성인)_미해제
2024,25692,25602,3,8430,8404,7,15502,15487,10,71854,71703,471
2025,29563,29448,67,8420,8406,31,16586,16570,15,70814,70591,765`;
const buffer = Buffer.from(csv, "utf8");
const rows = parseAndNormalizeStatistics({buffer, encoding: "utf8", sourceHash: sha256(buffer), datasetCutoff: "2025-12-31"});

assert.equal(rows.length, 2);
assert.equal(rows[0].derived.daysInYear, 366);
assert.equal(rows[1].totals.received, 125383);
assert.equal(rows[1].totals.vulnerableReceived, 54569);
assert.equal(rows[1].totals.unresolved, 878);
assert.equal(rows[1].derived.yearOverYearPercent.childrenReceived, 15.067);
assert.throws(() => parseAndNormalizeStatistics({buffer: Buffer.from("연도\n2025\n"), encoding: "utf8", sourceHash: "x"}), /Missing required headers/);

console.log("statistics normalize contract passed");
