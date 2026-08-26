import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {REQUIRED_EVIDENCE_FILES, validateImpactEvidenceDirectory} from './validate-impact-evidence.mjs';

const makePack = async (month = '2026-08') => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'missingalert-evidence-'));
  const directory = path.join(root, month);
  await import('node:fs/promises').then(({mkdir}) => mkdir(directory));
  const json = {
    'impact-summary.json': {month, events: {caseImpressions: 10, caseViews: 2}, aggregation: {queryVersion: 'impact-v1', rawMonthlyValidated: true}, review: {state: 'approved'}},
    'bigquery-raw-counts.json': {month, queryVersion: 'impact-v1', events: {caseImpressions: 10, caseViews: 2}},
    'source-status.json': {sources: []},
    'sync-run-summary.json': {runs: []},
    'approval-record.json': {month, state: 'approved', published: true},
  };
  for (const file of REQUIRED_EVIDENCE_FILES) {
    const content = json[file] ? JSON.stringify(json[file]) : file.endsWith('.png') ? 'png-placeholder' : file === 'bigquery-query-version.txt' ? 'impact-v1' : '# 검토 완료\nCTA 클릭은 실제 제보가 아니다.';
    await writeFile(path.join(directory, file), content);
  }
  return directory;
};

test('accepts a complete approved and raw-validated evidence pack', async () => {
  const directory = await makePack();
  assert.deepEqual(await validateImpactEvidenceDirectory(directory), {valid: true, errors: []});
});

test('rejects unapproved values and exaggerated discovery claims', async () => {
  const directory = await makePack();
  await writeFile(path.join(directory, 'approval-record.json'), JSON.stringify({month: '2026-08', state: 'draft', published: false}));
  await writeFile(path.join(directory, 'bigquery-raw-counts.json'), JSON.stringify({month: '2026-08', queryVersion: 'impact-v1', events: {caseImpressions: 9, caseViews: 2}}));
  await writeFile(path.join(directory, 'data-quality-summary.md'), 'MissingAlert가 3명을 발견했다.');
  const result = await validateImpactEvidenceDirectory(directory);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('approval-not-published'));
  assert.ok(result.errors.includes('forbidden-impact-claim'));
  assert.ok(result.errors.includes('raw-event-count-mismatch'));
});
