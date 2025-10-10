const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const email = process.argv[2];
if (!email) {
  console.error('이메일을 입력하세요: node setAdminClaim.js user@example.com');
  process.exit(1);
}

admin.auth().getUserByEmail(email)
  .then(user => {
    return admin.auth().setCustomUserClaims(user.uid, { admin: true });
  })
  .then(() => {
    console.log(`✅ ${email}에게 관리자 권한 부여 완료`);
    process.exit(0);
  })
  .catch(error => {
    console.error('오류:', error);
    process.exit(1);
  });