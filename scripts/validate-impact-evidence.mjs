import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const REQUIRED_EVIDENCE_FILES = [
  'impact-summary.json',
  'bigquery-raw-counts.json',
  'bigquery-query-version.txt',
  'source-status.json',
  'sync-run-summary.json',
  'screenshot-statistics.png',
  'screenshot-impact.png',
  'data-quality-summary.md',
  'approval-record.json',
];

const FORBIDDEN_CLAIMS = [
  /MissingAlert(?:가|에서)\s*\d+명(?:을|의)?\s*(?:발견|구조|찾)/i,
  /경찰청보다\s*(?:더\s*)?빠르/i,
  /정확히\s*\d+명(?:의)?\s*시민/i,
];

const readJson = async (directory, file) => JSON.parse(await readFile(path.join(directory, file), 'utf8'));
const sortedEvents = (value) => Object.fromEntries(Object.entries(value || {}).sort(([left], [right]) => left.localeCompare(right)));

export const validateImpactEvidenceDirectory = async (directory) => {
  const errors = [];
  for (const file of REQUIRED_EVIDENCE_FILES) {
    try { await access(path.join(directory, file)); } catch { errors.push(`missing:${file}`); }
  }
  if (errors.length > 0) return {valid: false, errors};

  let impact; let approval; let rawCounts;
  try { impact = await readJson(directory, 'impact-summary.json'); } catch { errors.push('invalid-json:impact-summary.json'); }
  try { rawCounts = await readJson(directory, 'bigquery-raw-counts.json'); } catch { errors.push('invalid-json:bigquery-raw-counts.json'); }
  try { approval = await readJson(directory, 'approval-record.json'); } catch { errors.push('invalid-json:approval-record.json'); }
  try { await readJson(directory, 'source-status.json'); } catch { errors.push('invalid-json:source-status.json'); }
  try { await readJson(directory, 'sync-run-summary.json'); } catch { errors.push('invalid-json:sync-run-summary.json'); }

  const folderMonth = path.basename(path.resolve(directory));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(folderMonth)) errors.push('invalid-folder-month');
  if (impact && impact.month !== folderMonth) errors.push('month-mismatch:impact-summary.json');
  if (rawCounts && rawCounts.month !== folderMonth) errors.push('month-mismatch:bigquery-raw-counts.json');
  if (approval && approval.month !== folderMonth) errors.push('month-mismatch:approval-record.json');
  if (approval && (approval.state !== 'approved' || approval.published !== true)) errors.push('approval-not-published');
  if (impact && impact.review?.state !== 'approved') errors.push('impact-not-approved');
  if (impact && impact.aggregation?.rawMonthlyValidated !== true) errors.push('raw-monthly-not-validated');
  if (impact && Object.values(impact.events || {}).some((value) => !Number.isFinite(value) || value < 0)) errors.push('invalid-event-count');
  if (rawCounts && Object.values(rawCounts.events || {}).some((value) => !Number.isFinite(value) || value < 0)) errors.push('invalid-raw-event-count');
  if (impact && rawCounts && JSON.stringify(sortedEvents(impact.events)) !== JSON.stringify(sortedEvents(rawCounts.events))) errors.push('raw-event-count-mismatch');

  const queryVersion = (await readFile(path.join(directory, 'bigquery-query-version.txt'), 'utf8')).trim();
  if (!queryVersion) errors.push('missing-query-version');
  if (impact?.aggregation?.queryVersion && impact.aggregation.queryVersion !== queryVersion) errors.push('query-version-mismatch');
  if (rawCounts?.queryVersion && String(rawCounts.queryVersion) !== queryVersion) errors.push('raw-query-version-mismatch');

  const qualitySummary = await readFile(path.join(directory, 'data-quality-summary.md'), 'utf8');
  if (FORBIDDEN_CLAIMS.some((pattern) => pattern.test(qualitySummary))) errors.push('forbidden-impact-claim');

  return {valid: errors.length === 0, errors};
};

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const directory = process.argv[2];
  if (!directory) {
    console.error('Usage: node scripts/validate-impact-evidence.mjs <evidence/YYYY-MM>');
    process.exitCode = 2;
  } else {
    const result = await validateImpactEvidenceDirectory(path.resolve(directory));
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  }
}
