const express = require('express');

const router = express.Router();
const publicOrigin = () => (process.env.PUBLIC_SITE_ORIGIN || 'https://missingalert.kr').replace(/\/+$/, '');

const redirectToCanonical = (pathBuilder) => (req, res) => {
  res.set('X-Robots-Tag', 'noindex, follow');
  return res.redirect(301, `${publicOrigin()}${pathBuilder(req)}`);
};

// Firebase Hosting and Cloud Functions own the canonical, indexable SEO page.
// Keep the legacy Render route as a permanent redirect so two renderers cannot
// publish conflicting titles, canonical URLs, or closed-case visibility rules.
router.get('/missing', redirectToCanonical(() => '/missing'));
router.get('/missing/today', redirectToCanonical(() => '/missing/today'));
router.get('/missing/type/:typeSlug', redirectToCanonical((req) => `/missing/type/${encodeURIComponent(req.params.typeSlug)}`));
router.get('/missing/region/:regionSlug', redirectToCanonical((req) => `/missing/region/${encodeURIComponent(req.params.regionSlug)}`));
router.get('/missing/:id', redirectToCanonical((req) => `/missing/${encodeURIComponent(req.params.id)}`));

module.exports = router;
