const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

let initialized = false;

const resolveServiceAccount = () => {
  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (configuredPath) {
    const absolutePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);

    if (fs.existsSync(absolutePath)) {
      return require(absolutePath);
    }

    console.warn(`⚠️  지정한 서비스 계정 파일을 찾을 수 없습니다: ${absolutePath}`);
  }

  const bundledPath = path.resolve(__dirname, '..', 'serviceAccountKey.json');
  if (fs.existsSync(bundledPath)) {
    return require(bundledPath);
  }

  return null;
};

const ensureFirebaseAdmin = () => {
  if (initialized || admin.apps.length > 0) {
    initialized = true;
    return admin.app();
  }

  try {
    const serviceAccount = resolveServiceAccount();
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID || 'missing-person-alram'
      });
    }

    initialized = true;
    console.log('✅ Firebase Admin (messaging) 초기화 완료');
    return admin.app();
  } catch (error) {
    console.error('❌ Firebase Admin 초기화 실패:', error.message);
    throw error;
  }
};

const getMessaging = () => {
  const app = ensureFirebaseAdmin();
  return admin.messaging(app);
};

const getFirestore = () => {
  const app = ensureFirebaseAdmin();
  return admin.firestore(app);
};

module.exports = {
  admin,
  ensureFirebaseAdmin,
  getMessaging,
  getFirestore
};
