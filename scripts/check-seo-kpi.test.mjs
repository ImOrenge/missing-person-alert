import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySearchConsoleRows, compareSeoKpis, evaluateSeoKpis, parseCsv } from './check-seo-kpi.mjs';

test('parses quoted Search Console CSV rows and Korean headers', () => {
  const rows = parseCsv('\uFEFF날짜,클릭수,노출수,CTR,게재순위\r\n2026-08-24,"700","10,000",7%,4.5\r\n');
  assert.equal(rows[0].노출수, '10,000');
  assert.equal(classifySearchConsoleRows(rows)?.kind, 'date');
});

test('evaluates every explicit Search Console completion threshold', () => {
  const dateRows = Array.from({ length: 7 }, (_, index) => ({
    Date: `2026-08-${String(18 + index).padStart(2, '0')}`,
    Clicks: '80', Impressions: '1000', CTR: '8%', Position: '4',
  }));
  const queryRows = [
    { 'Top queries': '실종자 현황', Clicks: '30', Impressions: '300', CTR: '10%', Position: '4.2' },
    { 'Top queries': '실종자 조회', Clicks: '20', Impressions: '250', CTR: '8%', Position: '4.8' },
    { 'Top queries': '실종자', Clicks: '10', Impressions: '150', CTR: '6.7%', Position: '9.5' },
  ];
  const regionRows = ['seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong', 'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam', 'gyeongbuk', 'gyeongnam', 'jeju']
    .map((slug) => ({ 'Top pages': `https://missingalert.kr/missing/region/${slug}`, Clicks: '1', Impressions: '10', CTR: '10%', Position: '5' }));
  const pageRows = [
    { 'Top pages': 'https://missingalert.kr/', Clicks: '20', Impressions: '200', CTR: '10%', Position: '5' },
    { 'Top pages': 'https://missingalert.kr/missing/type/child', Clicks: '20', Impressions: '200', CTR: '10%', Position: '5' },
    { 'Top pages': 'https://missingalert.kr/missing/recent', Clicks: '20', Impressions: '150', CTR: '10%', Position: '5' },
    { 'Top pages': 'https://missingalert.kr/missing/statistics', Clicks: '10', Impressions: '100', CTR: '10%', Position: '5' },
    { 'Top pages': 'https://missingalert.kr/guide/missing-report', Clicks: '10', Impressions: '100', CTR: '10%', Position: '5' },
    ...regionRows,
  ];
  const operationalEvidence = {
    checkedAt: '2026-08-24T00:00:00.000Z',
    origin: 'https://missingalert.kr',
    requirements: {
      delistingAutomation: { passed: true, evidence: [{ id: 'delisting', passed: true }] },
      conversionDashboard: { passed: true, evidence: [{ id: 'dashboard', passed: true }] },
    },
  };
  const result = evaluateSeoKpis({ dateRows, queryRows, pageRows, operationalEvidence });
  assert.equal(result.summary.completionReady, true);
  assert.equal(result.summary.passed, 12);
  assert.deepEqual(result.aggregateWindow, { startDate: '2026-08-18', endDate: '2026-08-24', days: 7 });
  assert.equal(result.summary.exposedRegions.length, 17);
  assert.equal(result.summary.duplicatePages.length, 0);
});

test('fails closed when operational completion evidence is absent', () => {
  const dateRows = Array.from({ length: 7 }, (_, index) => ({
    Date: `2026-08-${String(18 + index).padStart(2, '0')}`,
    Clicks: '80', Impressions: '1000', CTR: '8%', Position: '4',
  }));
  const queryRows = [
    { 'Top queries': '실종자 현황', Clicks: '1', Impressions: '10', Position: '4' },
    { 'Top queries': '실종자 조회', Clicks: '1', Impressions: '10', Position: '4' },
    { 'Top queries': '실종자', Clicks: '1', Impressions: '10', Position: '9' },
  ];
  const regionRows = ['seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong', 'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam', 'gyeongbuk', 'gyeongnam', 'jeju']
    .map((slug) => ({ 'Top pages': `https://missingalert.kr/missing/region/${slug}`, Clicks: '1', Impressions: '10' }));
  const pageRows = [
    { 'Top pages': 'https://missingalert.kr/', Clicks: '1', Impressions: '100' },
    { 'Top pages': 'https://missingalert.kr/missing/recent', Clicks: '1', Impressions: '300' },
    ...regionRows,
  ];

  const result = evaluateSeoKpis({ dateRows, queryRows, pageRows });
  assert.equal(result.summary.completionReady, false);
  assert.equal(result.checks.find((check) => check.id === 'delisting_automation').passed, false);
  assert.equal(result.checks.find((check) => check.id === 'conversion_dashboard').passed, false);
  assert.match(result.evidenceBoundary, /fail closed/);
});

test('reports missing regions and indexed filter URLs without overstating completion', () => {
  const dateRows = [{ Date: '2026-08-24', Clicks: '1', Impressions: '20', CTR: '5%', Position: '20' }];
  const queryRows = [{ 'Top queries': '실종자 현황', Clicks: '1', Impressions: '20', CTR: '5%', Position: '8' }];
  const pageRows = [{ 'Top pages': 'https://missingalert.kr/map?personId=1&utm_source=organic', Clicks: '1', Impressions: '20', CTR: '5%', Position: '20' }];
  const result = evaluateSeoKpis({ dateRows, queryRows, pageRows });
  assert.equal(result.summary.completionReady, false);
  assert.equal(result.summary.missingRegions.length, 17);
  assert.deepEqual(result.summary.duplicatePages, ['https://missingalert.kr/map?personId=1&utm_source=organic']);
});

test('reads the spaced Korean Search Console position header', () => {
  const dateRows = [
    { 날짜: '2026-08-22', 클릭수: '7', 노출: '70', CTR: '10%', '게재 순위': '8' },
  ];
  const queryRows = [
    { '인기 검색어': '실종자 현황', 클릭수: '6', 노출: '73', CTR: '8.22%', '게재 순위': '7.15' },
  ];
  const pageRows = [
    { '인기 페이지': 'https://missingalert.kr/', 클릭수: '7', 노출: '70', CTR: '10%', '게재 순위': '8' },
  ];

  const result = evaluateSeoKpis({ dateRows, queryRows, pageRows });
  const statusQuery = result.checks.find((check) => check.id === 'query_missing_status');

  assert.equal(statusQuery.value, 7.15);
  assert.equal(statusQuery.passed, false);
});

test('compares a new export with the baseline using KPI-specific directionality', () => {
  const baseline = {
    window: { startDate: '2026-08-16', endDate: '2026-08-22' },
    checks: [
      { id: 'impressions_7d_avg', label: '노출', value: 83, passed: false },
      { id: 'query_missing_status', label: '순위', value: 7.15, passed: false },
      { id: 'duplicate_urls', label: '중복', value: 1, passed: false },
    ],
    summary: {
      passed: 1,
      sevenDayAverageImpressions: 83,
      sevenDayAverageClicks: 7.6,
      sevenDayCtr: 9.1,
      exposedRegions: ['seoul'],
      duplicatePages: ['https://missingalert.kr/map?utm_source=organic'],
    },
  };
  const current = {
    window: { startDate: '2026-09-01', endDate: '2026-09-07' },
    checks: [
      { id: 'impressions_7d_avg', label: '노출', value: 300, passed: false },
      { id: 'query_missing_status', label: '순위', value: 4.9, passed: true },
      { id: 'duplicate_urls', label: '중복', value: 0, passed: true },
    ],
    summary: {
      passed: 3,
      sevenDayAverageImpressions: 300,
      sevenDayAverageClicks: 25,
      sevenDayCtr: 8.3,
      exposedRegions: ['seoul', 'busan'],
      duplicatePages: [],
    },
  };

  const comparison = compareSeoKpis(current, baseline);
  assert.equal(comparison.summary.impressions7dAverageDelta, 217);
  assert.equal(comparison.summary.regionsExposedDelta, 1);
  assert.equal(comparison.checks.find((check) => check.id === 'impressions_7d_avg').trend, 'improved');
  assert.equal(comparison.checks.find((check) => check.id === 'query_missing_status').trend, 'improved');
  assert.equal(comparison.checks.find((check) => check.id === 'duplicate_urls').trend, 'improved');
});
