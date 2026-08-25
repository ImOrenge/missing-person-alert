import assert from 'node:assert/strict';
import test from 'node:test';
import { verifySeoOperationalReadiness } from './check-seo-operational.mjs';

const response = (status, body = '', headers = {}) => ({ status, body, headers });

const successfulRequest = async (url, options = {}) => {
  if (url.endsWith('/missing/6158970')) return response(410, '', { 'x-robots-tag': 'noindex, nofollow' });
  if (url.endsWith('/sitemap-missing-persons.xml')) {
    return response(200, '<sitemapindex><sitemap><loc>https://missingalert.kr/sitemaps/public-cases-1.xml</loc></sitemap></sitemapindex>');
  }
  if (url.endsWith('/sitemaps/public-cases-1.xml')) return response(200, '<urlset><url><loc>https://missingalert.kr/missing/6161965</loc></url></urlset>');
  if (url.endsWith('/rss.xml')) return response(200, '<rss><channel></channel></rss>');
  if (url.includes('/api/seo/events') && options.method === 'POST') return response(400, '{"success":false}');
  if (url.includes('/api/admin/seo-metrics')) return response(401, '{"success":false}');
  if (url === 'https://missingalert.kr/') return response(200, '<script src="/static/js/main.hash.js"></script>');
  if (url.endsWith('/static/js/main.hash.js')) {
    return response(200, '/api/admin/seo-metrics searchToDetailRate mapViewRate shareRate reportStartRate');
  }
  throw new Error(`Unexpected request: ${url}`);
};

test('verifies both operational completion requirements from source and live signatures', async () => {
  const result = await verifySeoOperationalReadiness({ requestImpl: successfulRequest });
  assert.equal(result.summary.ready, true);
  assert.equal(result.summary.passed, 9);
  assert.equal(result.requirements.delistingAutomation.passed, true);
  assert.equal(result.requirements.conversionDashboard.passed, true);
});

test('fails delisting readiness when an ended case remains in a public sitemap', async () => {
  const requestImpl = async (url, options) => {
    if (url.endsWith('/sitemaps/public-cases-1.xml')) {
      return response(200, '<urlset><url><loc>https://missingalert.kr/missing/6158970</loc></url></urlset>');
    }
    return successfulRequest(url, options);
  };
  const result = await verifySeoOperationalReadiness({ requestImpl });
  assert.equal(result.requirements.delistingAutomation.passed, false);
  assert.equal(result.checks.find((check) => check.id === 'delisting_sitemap_exclusion').passed, false);
  assert.equal(result.summary.ready, false);
});
