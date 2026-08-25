import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifySeoOperationalReadiness } from './check-seo-operational.mjs';

const REGION_SLUGS = [
  'seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong',
  'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam', 'gyeongbuk', 'gyeongnam', 'jeju',
];

const HEADER_ALIASES = {
  date: ['date', '날짜'],
  query: ['top queries', 'query', '검색어', '인기 검색어'],
  page: ['top pages', 'page', '페이지', '인기 페이지'],
  clicks: ['clicks', '클릭수', '클릭'],
  impressions: ['impressions', '노출수', '노출'],
  ctr: ['ctr'],
  position: ['position', '게재순위', '게재 순위', '평균 게재순위', '평균 게재 순위'],
};

const normalizeHeader = (value) => String(value || '').replace(/^\uFEFF/, '').trim().toLowerCase();
const findHeader = (headers, aliases) => headers.find((header) => aliases.includes(normalizeHeader(header)));
const numberValue = (value) => {
  const normalized = String(value ?? '').replace(/,/g, '').replace(/%/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, '').trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
};

export const classifySearchConsoleRows = (rows) => {
  if (rows.length === 0) return null;
  const headers = Object.keys(rows[0]);
  for (const kind of ['date', 'query', 'page']) {
    const primary = findHeader(headers, HEADER_ALIASES[kind]);
    const clicks = findHeader(headers, HEADER_ALIASES.clicks);
    const impressions = findHeader(headers, HEADER_ALIASES.impressions);
    if (primary && clicks && impressions) return { kind, primary, clicks, impressions, headers };
  }
  return null;
};

const pathFromPage = (value) => {
  try {
    return new URL(value, 'https://missingalert.kr').pathname;
  } catch {
    return '';
  }
};

const percent = (numerator, denominator) => denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
const rounded = (value) => Math.round(value * 10) / 10;
const LOWER_IS_BETTER = new Set([
  'query_missing_status',
  'query_missing_lookup',
  'query_missing',
  'home_share',
  'duplicate_urls',
]);

export const evaluateSeoKpis = ({ dateRows, queryRows, pageRows, operationalEvidence = null }) => {
  const dateMeta = classifySearchConsoleRows(dateRows);
  const queryMeta = classifySearchConsoleRows(queryRows);
  const pageMeta = classifySearchConsoleRows(pageRows);
  if (dateMeta?.kind !== 'date' || queryMeta?.kind !== 'query' || pageMeta?.kind !== 'page') {
    throw new Error('Dates, Queries, and Pages Search Console tables are required.');
  }

  const normalizedDates = dateRows.map((row) => ({
    date: String(row[dateMeta.primary] || '').trim(),
    clicks: numberValue(row[dateMeta.clicks]),
    impressions: numberValue(row[dateMeta.impressions]),
  })).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date)).sort((a, b) => a.date.localeCompare(b.date));
  if (normalizedDates.length === 0) throw new Error('No valid daily rows were found.');
  const exportStartDate = normalizedDates[0].date;
  const endDate = normalizedDates.at(-1).date;
  const exportWindowDays = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${exportStartDate}T00:00:00Z`)) / 86400000) + 1;
  const endTimestamp = Date.parse(`${endDate}T00:00:00Z`);
  const startDate = new Date(endTimestamp - 6 * 86400000).toISOString().slice(0, 10);
  const dateMap = new Map(normalizedDates.map((row) => [row.date, row]));
  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.parse(`${startDate}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10);
    return dateMap.get(date) || { date, clicks: 0, impressions: 0 };
  });
  const sevenDayClicks = lastSevenDays.reduce((sum, row) => sum + row.clicks, 0);
  const sevenDayImpressions = lastSevenDays.reduce((sum, row) => sum + row.impressions, 0);

  const queryPositionHeader = findHeader(queryMeta.headers, HEADER_ALIASES.position);
  const queryMap = new Map(queryRows.map((row) => [String(row[queryMeta.primary] || '').trim(), {
    impressions: numberValue(row[queryMeta.impressions]),
    position: queryPositionHeader ? numberValue(row[queryPositionHeader]) : null,
  }]));

  const normalizedPages = pageRows.map((row) => ({
    page: String(row[pageMeta.primary] || '').trim(),
    impressions: numberValue(row[pageMeta.impressions]),
  }));
  const totalPageImpressions = normalizedPages.reduce((sum, row) => sum + row.impressions, 0);
  const homeImpressions = normalizedPages.filter((row) => pathFromPage(row.page) === '/').reduce((sum, row) => sum + row.impressions, 0);
  const expansionImpressions = normalizedPages.filter((row) => {
    const pagePath = pathFromPage(row.page);
    return pagePath.startsWith('/missing/type/') || pagePath === '/missing/recent' || pagePath === '/missing/statistics' || pagePath.startsWith('/guide/');
  }).reduce((sum, row) => sum + row.impressions, 0);
  const exposedRegions = REGION_SLUGS.filter((slug) => normalizedPages.some((row) => pathFromPage(row.page) === `/missing/region/${slug}` && row.impressions > 0));
  const duplicatePages = normalizedPages.filter((row) => {
    try {
      const url = new URL(row.page, 'https://missingalert.kr');
      return [...url.searchParams.keys()].some((key) => ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'sort', 'gender', 'age', 'view', 'personid'].includes(key.toLowerCase()));
    } catch {
      return false;
    }
  }).map((row) => row.page);

  const queryPosition = (query) => queryMap.get(query)?.position ?? null;
  const delistingAutomation = operationalEvidence?.requirements?.delistingAutomation;
  const conversionDashboard = operationalEvidence?.requirements?.conversionDashboard;
  const checks = [
    { id: 'impressions_7d_avg', label: 'Google 7일 평균 노출 1,000회 이상', value: rounded(sevenDayImpressions / 7), target: 1000, passed: sevenDayImpressions / 7 >= 1000, evidenceWindow: 'daily_7d' },
    { id: 'clicks_7d_avg', label: '자연검색 클릭 7일 평균 70회 이상', value: rounded(sevenDayClicks / 7), target: 70, passed: sevenDayClicks / 7 >= 70, evidenceWindow: 'daily_7d' },
    { id: 'ctr_7d', label: '검색 CTR 7% 이상', value: percent(sevenDayClicks, sevenDayImpressions), target: 7, passed: percent(sevenDayClicks, sevenDayImpressions) >= 7, evidenceWindow: 'daily_7d' },
    { id: 'query_missing_status', label: '실종자 현황 평균순위 5위 이내', value: queryPosition('실종자 현황'), target: 5, passed: queryPosition('실종자 현황') !== null && queryPosition('실종자 현황') <= 5, evidenceWindow: 'export_aggregate' },
    { id: 'query_missing_lookup', label: '실종자 조회 평균순위 5위 이내', value: queryPosition('실종자 조회'), target: 5, passed: queryPosition('실종자 조회') !== null && queryPosition('실종자 조회') <= 5, evidenceWindow: 'export_aggregate' },
    { id: 'query_missing', label: '실종자 평균순위 10위 이내', value: queryPosition('실종자'), target: 10, passed: queryPosition('실종자') !== null && queryPosition('실종자') <= 10, evidenceWindow: 'export_aggregate' },
    { id: 'regions_exposed', label: '17개 시·도 페이지 모두 노출', value: exposedRegions.length, target: 17, passed: exposedRegions.length === 17, evidenceWindow: 'export_aggregate' },
    { id: 'expansion_share', label: '유형·최근·통계·가이드 노출 비중 30% 이상', value: percent(expansionImpressions, totalPageImpressions), target: 30, passed: percent(expansionImpressions, totalPageImpressions) >= 30, evidenceWindow: 'export_aggregate' },
    { id: 'home_share', label: '홈페이지 노출 의존도 40% 이하', value: percent(homeImpressions, totalPageImpressions), target: 40, passed: totalPageImpressions > 0 && percent(homeImpressions, totalPageImpressions) <= 40, evidenceWindow: 'export_aggregate' },
    { id: 'duplicate_urls', label: '내부 UTM·필터 URL 검색 노출 0건', value: duplicatePages.length, target: 0, passed: duplicatePages.length === 0, evidenceWindow: 'export_aggregate' },
    { id: 'delisting_automation', label: '종료 사건 검색결과 제거 프로세스 자동화', value: delistingAutomation ? (delistingAutomation.passed ? 1 : 0) : null, target: 1, passed: delistingAutomation?.passed === true, evidenceWindow: 'operational', evidence: delistingAutomation?.evidence || [] },
    { id: 'conversion_dashboard', label: '검색 유입→조회→공유→제보 전환 대시보드 구축', value: conversionDashboard ? (conversionDashboard.passed ? 1 : 0) : null, target: 1, passed: conversionDashboard?.passed === true, evidenceWindow: 'operational', evidence: conversionDashboard?.evidence || [] },
  ];

  return {
    window: { startDate, endDate },
    aggregateWindow: { startDate: exportStartDate, endDate, days: exportWindowDays },
    checks,
    summary: {
      passed: checks.filter((check) => check.passed).length,
      total: checks.length,
      completionReady: checks.every((check) => check.passed),
      sevenDayAverageImpressions: rounded(sevenDayImpressions / 7),
      sevenDayAverageClicks: rounded(sevenDayClicks / 7),
      sevenDayCtr: percent(sevenDayClicks, sevenDayImpressions),
      exposedRegions,
      missingRegions: REGION_SLUGS.filter((slug) => !exposedRegions.includes(slug)),
      duplicatePages,
    },
    operationalEvidence: operationalEvidence ? {
      checkedAt: operationalEvidence.checkedAt || null,
      origin: operationalEvidence.origin || null,
      evidenceBoundary: operationalEvidence.evidenceBoundary || null,
    } : null,
    evidenceBoundary: operationalEvidence
      ? 'Search metrics cover only the supplied Search Console rows; operational requirements use the attached current source/live verification.'
      : 'Results cover only the supplied Search Console rows. Operational evidence was not supplied, so the two operational completion requirements fail closed.',
  };
};

export const loadSearchConsoleDirectory = async (directory) => {
  const names = (await readdir(directory)).filter((name) => name.toLowerCase().endsWith('.csv'));
  const tables = {};
  for (const name of names) {
    const rows = parseCsv(await readFile(path.join(directory, name), 'utf8'));
    const meta = classifySearchConsoleRows(rows);
    if (meta && !tables[meta.kind]) tables[meta.kind] = rows;
  }
  if (!tables.date || !tables.query || !tables.page) {
    throw new Error('Could not find Search Console Dates, Queries, and Pages CSV tables in the directory.');
  }
  return { dateRows: tables.date, queryRows: tables.query, pageRows: tables.page };
};

export const compareSeoKpis = (current, baseline) => {
  const baselineChecks = new Map(baseline.checks.map((check) => [check.id, check]));
  const checks = current.checks.map((check) => {
    const previous = baselineChecks.get(check.id);
    const currentValue = typeof check.value === 'number' ? check.value : null;
    const baselineValue = typeof previous?.value === 'number' ? previous.value : null;
    const delta = currentValue === null || baselineValue === null ? null : rounded(currentValue - baselineValue);
    let trend = 'unavailable';
    if (delta === 0) trend = 'unchanged';
    else if (delta !== null) trend = LOWER_IS_BETTER.has(check.id)
      ? (delta < 0 ? 'improved' : 'regressed')
      : (delta > 0 ? 'improved' : 'regressed');
    return {
      id: check.id,
      label: check.label,
      baseline: baselineValue,
      current: currentValue,
      delta,
      trend,
      passedBefore: previous?.passed ?? false,
      passedNow: check.passed,
    };
  });
  return {
    baselineWindow: baseline.window,
    currentWindow: current.window,
    checks,
    summary: {
      passedDelta: current.summary.passed - baseline.summary.passed,
      impressions7dAverageDelta: rounded(current.summary.sevenDayAverageImpressions - baseline.summary.sevenDayAverageImpressions),
      clicks7dAverageDelta: rounded(current.summary.sevenDayAverageClicks - baseline.summary.sevenDayAverageClicks),
      ctr7dDelta: rounded(current.summary.sevenDayCtr - baseline.summary.sevenDayCtr),
      regionsExposedDelta: current.summary.exposedRegions.length - baseline.summary.exposedRegions.length,
      duplicateUrlsDelta: current.summary.duplicatePages.length - baseline.summary.duplicatePages.length,
    },
  };
};

const formatReport = (result) => {
  const lines = [`MissingAlert SEO KPI audit (${result.window.startDate} - ${result.window.endDate})`];
  lines.push(`Query/page aggregate window: ${result.aggregateWindow.startDate} - ${result.aggregateWindow.endDate} (${result.aggregateWindow.days} days)`);
  result.checks.forEach((check) => lines.push(`${check.passed ? '[PASS]' : '[WAIT]'} ${check.label}: ${check.value ?? '데이터 없음'}`));
  lines.push(`Summary: ${result.summary.passed}/${result.summary.total} checks passed`);
  lines.push(`Evidence boundary: ${result.evidenceBoundary}`);
  if (result.summary.missingRegions.length) lines.push(`Missing regions: ${result.summary.missingRegions.join(', ')}`);
  if (result.summary.duplicatePages.length) lines.push(`Duplicate URLs: ${result.summary.duplicatePages.join(', ')}`);
  return lines.join('\n');
};

const formatComparison = (comparison) => {
  const lines = [
    `Baseline comparison (${comparison.baselineWindow.startDate} - ${comparison.baselineWindow.endDate} -> ${comparison.currentWindow.startDate} - ${comparison.currentWindow.endDate})`,
  ];
  comparison.checks.forEach((check) => {
    const delta = check.delta === null ? '데이터 없음' : `${check.delta > 0 ? '+' : ''}${check.delta}`;
    lines.push(`[${check.trend.toUpperCase()}] ${check.label}: ${check.baseline ?? '데이터 없음'} -> ${check.current ?? '데이터 없음'} (${delta})`);
  });
  return lines.join('\n');
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directoryIndex = process.argv.indexOf('--dir');
  if (directoryIndex < 0 || !process.argv[directoryIndex + 1]) {
    console.error('Usage: node scripts/check-seo-kpi.mjs --dir <search-console-export-directory> [--baseline <baseline-export-directory>] [--operational-live | --operational-evidence <json-file>] [--json] [--strict]');
    process.exitCode = 2;
  } else {
    try {
      const tables = await loadSearchConsoleDirectory(path.resolve(process.argv[directoryIndex + 1]));
      const operationalEvidenceIndex = process.argv.indexOf('--operational-evidence');
      const useLiveOperationalEvidence = process.argv.includes('--operational-live');
      if (operationalEvidenceIndex >= 0 && useLiveOperationalEvidence) {
        throw new Error('Use either --operational-live or --operational-evidence, not both.');
      }
      let operationalEvidence = null;
      if (useLiveOperationalEvidence) {
        operationalEvidence = await verifySeoOperationalReadiness();
      } else if (operationalEvidenceIndex >= 0) {
        if (!process.argv[operationalEvidenceIndex + 1]) throw new Error('--operational-evidence requires a JSON file.');
        operationalEvidence = JSON.parse(await readFile(path.resolve(process.argv[operationalEvidenceIndex + 1]), 'utf8'));
      }
      const result = evaluateSeoKpis({ ...tables, operationalEvidence });
      const baselineIndex = process.argv.indexOf('--baseline');
      let comparison = null;
      let baseline = null;
      if (baselineIndex >= 0) {
        if (!process.argv[baselineIndex + 1]) throw new Error('--baseline requires a Search Console export directory.');
        baseline = evaluateSeoKpis(await loadSearchConsoleDirectory(path.resolve(process.argv[baselineIndex + 1])));
        comparison = compareSeoKpis(result, baseline);
      }
      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(comparison ? { current: result, baseline, comparison } : result, null, 2));
      } else {
        console.log(`${formatReport(result)}${comparison ? `\n\n${formatComparison(comparison)}` : ''}`);
      }
      if (process.argv.includes('--strict') && !result.summary.completionReady) process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
    }
  }
}
