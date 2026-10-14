// One-time recovery: never prints credentials or bearer tokens.
const {GoogleAuth} = require('../functions/node_modules/google-auth-library');
(async () => {
  const auth = new GoogleAuth({
    credentials: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/firebase'],
  });
  const client = await auth.getClient();
  const root = 'https://firebasehosting.googleapis.com/v1beta1/';
  const site = 'sites/missing-person-alram';
  const request = async (path, method = 'GET', data) =>
    (await client.request({url: root + path, method, data})).data;
  const list = await request(site + '/channels/live/releases?pageSize=30');
  const releases = (list.releases || []).sort((a,b) => b.releaseTime.localeCompare(a.releaseTime));
  console.log('Live release history:', releases.map(r => ({name:r.name, time:r.releaseTime, version:r.version?.name})));
  const candidate = releases.find(r => r.releaseTime < '2026-10-14T12:00:00Z' && r.version?.name);
  if (!candidate) throw new Error('No pre-incident production release retained; refusing guessed recovery');
  const files = await request(candidate.version.name + '/files?pageSize=1000');
  if (!(files.files || []).some(f => f.path.endsWith('static/js/main.4ea8c6ea.js'))) {
    throw new Error('Candidate does not contain observed original production bundle; refusing recovery');
  }
  const current = releases[0];
  if (current.version.name === candidate.version.name) { console.log('Original production version already active'); return; }
  if (!current.releaseTime.startsWith('2026-10-14T12:')) throw new Error('Unexpected newer deployment; refusing to overwrite it');
  const release = await request(site + '/releases?versionName=' + encodeURIComponent(candidate.version.name), 'POST',
    {message: 'Restore original production after detecting repository/live source drift during CAPTCHA hotfix'});
  if (release.version?.name !== candidate.version.name) throw new Error('Release version verification failed');
  console.log('Restored production:', {name:release.name, version:release.version.name});
})().catch(err => { console.error('Recovery failed:', err.response?.status || '', err.message); process.exit(1); });
