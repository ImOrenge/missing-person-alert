import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const buildRoot = path.resolve('frontend/build/static');
const findMainAsset = async (kind, extension) => {
  const directory = path.join(buildRoot, kind);
  const names = await readdir(directory);
  const name = names.find((candidate) => candidate.startsWith('main.') && candidate.endsWith(extension));
  assert.ok(name, `main ${extension} asset is missing`);
  return path.join(directory, name);
};

const budgets = [
  { label: 'main JavaScript', file: await findMainAsset('js', '.js'), maxBytes: 350 * 1024 },
  { label: 'main CSS', file: await findMainAsset('css', '.css'), maxBytes: 15 * 1024 },
];

for (const budget of budgets) {
  const gzipBytes = gzipSync(await readFile(budget.file), { level: 9 }).byteLength;
  assert.ok(gzipBytes <= budget.maxBytes, `${budget.label} gzip ${gzipBytes} exceeds ${budget.maxBytes}`);
  console.log(`${budget.label}: ${(gzipBytes / 1024).toFixed(2)} KiB gzip / ${(budget.maxBytes / 1024).toFixed(0)} KiB budget`);
}
