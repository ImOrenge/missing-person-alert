# Comment submission reCAPTCHA failure (2026-10-14)

## Confirmed defect and fix

The community composer (`CommunityFeed.handleCreatePost`) and case comments
(`MissingPersonComments/CommentsPanel`) both call `createComment`. It generated a
`comment_create` token but sent `x-recaptcha-action: comment`. The Functions
`ensureRecaptcha` verifier expects the header value (default `comment`) and rejects
a different returned action. Replies, user reports and admin reports had the same
problem (`comment_reply`, `comment_report`, `comment_report_admin`). All four now
use `COMMENT_RECAPTCHA_ACTION = comment` for both token generation and the header.
This preserves compatibility with the currently deployed server contract and does
not bypass CAPTCHA, lower the score threshold, or change authentication.

The report wizard is a separate private-report path using `report_submit` and
`/api/v2/reports`. Its action already matches its header. `ReportModal` is a
legacy path calling `/api/reports`, which is retired in current Functions code;
it is not the active App report composer.

## Safe reproduction and validation

Run:

```
CI=true npm test --prefix frontend -- --watchAll=false --runInBand --runTestsByPath src/services/commentService.test.ts src/features/reports/ReportWizard.test.tsx
npm run build --prefix frontend
```

The comment service tests mock Google, Firebase auth and fetch. Before the fix,
all four submission cases rejected with the CAPTCHA failure. After the fix,
all four pass; token-generation failure still prevents any submission. No live
comments, reports, media uploads, notifications or database records are created.
Hosting CI now runs the regression test and rejects missing CAPTCHA site keys
before building, without printing secret values.

## Production observations before release

- `https://missingalert.kr` returned HTTP 200, Last-Modified 2026-08-28.
- Served bundle `/static/js/main.4ea8c6ea.js` contained a nonempty CAPTCHA site
  key, Enterprise script URL, and the same `comment_create` / `comment` mismatch.
  Missing frontend key is therefore not the observed deployment's cause.
- `/community` renders the public community feed; writing requires sign-in.
  This investigation did not sign in or submit a public test post.
- The bundle uses `https://api-oueta2xr6q-du.a.run.app` for the API.
  A read-only CORS OPTIONS request to `/api/comments` returned 204 and allowed
  authorization, content-type, x-recaptcha-token and x-recaptcha-action.
  The repository CORS list omits the last header, but this is NOT reproduced
  against that live endpoint and is not asserted as the incident cause.
- GitHub's latest main Hosting run was successful for `deecd08` (2026-08-26).
  The Hosting workflows do not deploy Functions; source and live backend
  configuration must not be assumed identical.

## Remaining operational verification

The following require Firebase/Google Cloud access and an authenticated test
session; they are not established by local tests or a Hosting deployment:

1. Check the key's permitted domains include the actual serving hosts
   (`missingalert.kr`, and `www.missingalert.kr` if served). Check key type,
   ownership/project, quota, billing and domain-verification settings. Do not
   disable domain verification to work around failures.
2. Check `RECAPTCHA_SECRET_KEY` and `RECAPTCHA_MIN_SCORE` on the deployed API.
   Functions currently uses legacy SiteVerify; the separate Render backend uses
   Enterprise assessments. Confirm which is actually serving each request and
   that its secret/assessment site key matches the frontend key. Enterprise
   JavaScript plus SiteVerify alone is not proof of a mismatch: migrated keys
   can retain SiteVerify support (Google migration documentation).
3. Inspect sanitized verifier logs for missing config, invalid token, action
   mismatch, score rejection and upstream failures. Never log tokens/secrets.
   Existing Functions code also trusts the caller action and can fail open on
   upstream exceptions when NODE_ENV is not production; hardening requires a
   separately tested server deployment, not a speculative frontend hotfix.
4. On the released build, use an authenticated session to generate a fresh
   `comment` token and send an empty body to `/api/comments`. Confirm the known
   validation-only 400 (`missingPersonId가 필요합니다`) *after* CAPTCHA succeeds.
   The route validates that field before any Firestore writes. Do not use a real
   person ID, content, or report payload. This checks auth + CAPTCHA + handler
   without creating a public comment; inspect logs to distinguish rejection
   stages. Do not bypass CAPTCHA or reuse consumed tokens.
5. Confirm normal UI and production bundle after release. Only report the
   incident resolved to the reporter once production verification passes.

Official references:
- https://docs.cloud.google.com/recaptcha/docs/migrate-recaptcha
- https://docs.cloud.google.com/recaptcha/docs/verify
