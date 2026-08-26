import * as assert from "node:assert";
import {buildImpactMonthlyDraft, emptyImpactEvents, monthBounds, projectPublicImpactMonth, safeImpactRate} from "./model";

assert.deepEqual(monthBounds("2024-02"), {start: "2024-02-01", end: "2024-02-29"});
assert.equal(safeImpactRate(5, 0), null);
const day = {...emptyImpactEvents(), caseImpressions: 100, caseViews: 25, shareClicks: 5, reportCtaClicks: 1};
const draft = buildImpactMonthlyDraft({month: "2026-08", dailyEvents: [day, day], estimatedUsers: 9.9, activeCasesPublishedEndOfMonth: 193, timezone: "Asia/Seoul"});
assert.equal(draft.events.caseImpressions, 200);
assert.equal(draft.rates.detailViewRate, 0.25);
assert.equal(draft.estimatedUsers, 9);
assert.equal(draft.service.activeCasesSnapshotBasis, "aggregation_time");
assert.equal(projectPublicImpactMonth({...draft, published: false}), null);
const publicMonth = projectPublicImpactMonth({...draft, published: true, review: {state: "approved", reviewedBy: "must-not-leak", reason: "internal"}});
assert.ok(publicMonth);
assert.equal(JSON.stringify(publicMonth).includes("must-not-leak"), false);
assert.equal(JSON.stringify(publicMonth).includes("internal"), false);
console.log("impact model contract passed");
