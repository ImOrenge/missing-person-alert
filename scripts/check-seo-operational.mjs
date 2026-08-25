import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_ORIGIN = 'https://missingalert.kr';
const ENDED_CASE_SAMPLE_PATH = '/missing/6158970';

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());

const request = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      ...options,
      signal: controller.signal,
      headers: {
        'user-agent': 'MissingAlert-SEO-Operational-Check/1.0',
        ...(options.headers || {}),
      },
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const verifySeoOperationalReadiness = async ({
  origin = DEFAULT_ORIGIN,
  rootDirectory = process.cwd(),
  requestImpl = request,
} = {}) => {
  const checks = [];
  const add = (id, requirement, passed, detail) => checks.push({ id, requirement, passed: Boolean(passed), detail });

  const [functionsSource, adminSource, dashboardSource] = await Promise.all([
    readFile(path.join(rootDirectory, 'functions/src/index.ts'), 'utf8'),
    readFile(path.join(rootDirectory, 'frontend/src/components/AdminDashboard.tsx'), 'utf8'),
    readFile(path.join(rootDirectory, 'frontend/src/features/admin/seo/SeoMetricsTab.tsx'), 'utf8'),
  ]);

  add(
    'delisting_source_guard',
    'delistingAutomation',
    functionsSource.includes('sourceSnapshotComplete ?')
      && functionsSource.includes('seoVisible: false')
      && functionsSource.includes('status: "found"')
      && functionsSource.includes('foundReason: "official_source_removed"'),
    'Poller only delists after a complete official-source snapshot and records the removal reason.',
  );

  const endedCase = await requestImpl(`${origin}${ENDED_CASE_SAMPLE_PATH}`);
  add(
    'delisting_live_response',
    'delistingAutomation',
    [404, 410].includes(endedCase.status) && /noindex/i.test(endedCase.headers['x-robots-tag'] || endedCase.body),
    `${ENDED_CASE_SAMPLE_PATH} returned ${endedCase.status} with a noindex directive.`,
  );

  const sitemapIndex = await requestImpl(`${origin}/sitemap-missing-persons.xml`);
  const publicCaseSitemaps = locs(sitemapIndex.body).filter((url) => /\/sitemaps\/public-cases-\d+\.xml$/.test(url));
  const sitemapBodies = await Promise.all(publicCaseSitemaps.map(async (url) => (await requestImpl(url)).body));
  add(
    'delisting_sitemap_exclusion',
    'delistingAutomation',
    sitemapIndex.status === 200 && publicCaseSitemaps.length > 0
      && sitemapBodies.every((body) => !body.includes(ENDED_CASE_SAMPLE_PATH)),
    `Ended sample is absent from ${publicCaseSitemaps.length} public-case sitemap file(s).`,
  );

  const rss = await requestImpl(`${origin}/rss.xml`);
  add(
    'delisting_rss_exclusion',
    'delistingAutomation',
    rss.status === 200 && !rss.body.includes(ENDED_CASE_SAMPLE_PATH),
    'Ended sample is absent from the live RSS feed.',
  );

  add(
    'dashboard_source_wiring',
    'conversionDashboard',
    adminSource.includes("import SeoMetricsTab from '../features/admin/seo/SeoMetricsTab'")
      && adminSource.includes("activeTab === 'seoMetrics'")
      && dashboardSource.includes('검색 유입 전환 대시보드')
      && dashboardSource.includes('searchToDetailRate')
      && dashboardSource.includes('mapViewRate')
      && dashboardSource.includes('shareRate')
      && dashboardSource.includes('reportStartRate'),
    'Admin navigation mounts the conversion dashboard and renders the required funnel rates.',
  );

  add(
    'dashboard_backend_wiring',
    'conversionDashboard',
    functionsSource.includes('app.post("/api/seo/events"')
      && functionsSource.includes('app.get("/api/admin/seo-metrics"')
      && functionsSource.includes('buildSeoMetricsSummary'),
    'Backend source exposes event ingestion and the admin-only aggregate metrics route.',
  );

  const invalidEvent = await requestImpl(`${origin}/api/seo/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: '__operational_verification_invalid__' }),
  });
  add(
    'dashboard_live_event_route',
    'conversionDashboard',
    invalidEvent.status === 400,
    `Live event route rejected a deliberately invalid, non-writing event with ${invalidEvent.status}.`,
  );

  const adminMetrics = await requestImpl(`${origin}/api/admin/seo-metrics?range=7`);
  add(
    'dashboard_live_auth_boundary',
    'conversionDashboard',
    [401, 403].includes(adminMetrics.status),
    `Live metrics route enforced its authentication boundary with ${adminMetrics.status}.`,
  );

  const home = await requestImpl(`${origin}/`);
  const scriptUrls = [...home.body.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map((match) => new URL(match[1], origin).href);
  const mainScriptUrl = scriptUrls.find((url) => /\/static\/js\/main\.[^/]+\.js$/.test(url));
  const mainScript = mainScriptUrl ? await requestImpl(mainScriptUrl) : null;
  add(
    'dashboard_live_bundle',
    'conversionDashboard',
    home.status === 200
      && mainScript?.status === 200
      && mainScript.body.includes('/api/admin/seo-metrics')
      && mainScript.body.includes('searchToDetailRate')
      && mainScript.body.includes('mapViewRate')
      && mainScript.body.includes('shareRate')
      && mainScript.body.includes('reportStartRate'),
    mainScriptUrl ? 'Deployed frontend bundle contains the admin SEO dashboard.' : 'No deployed main bundle was discovered.',
  );

  const requirement = (name) => {
    const evidence = checks.filter((check) => check.requirement === name);
    return {
      passed: evidence.length > 0 && evidence.every((check) => check.passed),
      evidence: evidence.map(({ id, passed, detail }) => ({ id, passed, detail })),
    };
  };

  return {
    checkedAt: new Date().toISOString(),
    origin,
    requirements: {
      delistingAutomation: requirement('delistingAutomation'),
      conversionDashboard: requirement('conversionDashboard'),
    },
    checks,
    summary: {
      passed: checks.filter((check) => check.passed).length,
      total: checks.length,
      ready: checks.every((check) => check.passed),
    },
    evidenceBoundary: 'Combines current source wiring with unauthenticated live-route, sitemap, RSS, and deployed-bundle checks; it does not impersonate an administrator.',
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await verifySeoOperationalReadiness();
    console.log(JSON.stringify(result, null, 2));
    if (!result.summary.ready) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
