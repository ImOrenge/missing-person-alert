/**
 * 실종자 위치 좌표 재수집 스크립트
 * usage: node scripts/reloadMissingPersonLocations.js
 */

const path = require('path');

if (typeof globalThis.File === 'undefined') {
  try {
    const { File } = require('undici');
    globalThis.File = File;
  } catch (error) {
    class PolyfillFile extends Blob {
      constructor(bits, name, options = {}) {
        super(bits, options);
        this.name = name;
        this.lastModified = options.lastModified ?? Date.now();
      }
    }
    globalThis.File = PolyfillFile;
  }
}

const admin = require('firebase-admin');
const firebaseService = require('../services/firebaseService');
const APIPoller = require('../services/apiPoller');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const serviceAccountPath = serviceAccountEnv
  ? (path.isAbsolute(serviceAccountEnv) ? serviceAccountEnv : path.resolve(__dirname, '..', serviceAccountEnv))
  : path.resolve(__dirname, '..', 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
  });
}

const firestore = admin.firestore();

const processBatch = async (docs, apiPoller) => {
  const updates = [];

  for (const doc of docs) {
    const data = doc.data();
    const currentLocation = data.location;
    const address = currentLocation?.address;

    if (!address || address === '주소 미상') {
      console.warn(`  ⚠️ [${doc.id}] 주소 없음, 스킵`);
      continue;
    }

    const newLocation = await apiPoller.geocodeAddress(address);

    if (!newLocation) {
      console.warn(`  ⚠️ [${doc.id}] 새 좌표 계산 실패 (${address})`);
      continue;
    }

    const needsUpdate =
      !currentLocation ||
      Number(currentLocation.lat) !== Number(newLocation.lat) ||
      Number(currentLocation.lng) !== Number(newLocation.lng) ||
      currentLocation.address !== newLocation.address;

    if (!needsUpdate) {
      continue;
    }

    console.log(`  ↻ 좌표 갱신: ${doc.id} (${address}) -> (${newLocation.lat}, ${newLocation.lng})`);
    updates.push({
      id: doc.id,
      data: {
        location: newLocation,
        updatedAt: admin.firestore.Timestamp.now()
      }
    });
  }

  return updates;
};

const main = async () => {
  console.log('🚀 실종자 좌표 재수집 스크립트 시작');

  const dummyWsManager = {
    setOnNewConnection: () => {},
    sendToClient: () => {}
  };
  const apiPoller = new APIPoller(dummyWsManager);
  const batchSize = 50;
  let lastDoc = null;
  let totalProcessed = 0;
  let totalUpdated = 0;

  while (true) {
    let query = firestore.collection('missingPersons').orderBy('updatedAt', 'desc').limit(batchSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    const updates = await processBatch(snapshot.docs, apiPoller);

    for (const update of updates) {
      await firestore.collection('missingPersons').doc(update.id).update(update.data);
      totalUpdated += 1;
    }

    totalProcessed += snapshot.size;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    console.log(`✅ 처리 진행: ${totalProcessed}건 (업데이트 ${totalUpdated}건)`);
  }

  console.log(`🎉 좌표 재수집 완료 - 총 ${totalProcessed}건 처리, ${totalUpdated}건 갱신`);
  process.exit(0);
};

main().catch((error) => {
  console.error('❌ 스크립트 실행 실패:', error);
  process.exit(1);
});
