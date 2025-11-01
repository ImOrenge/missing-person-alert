const { Timestamp } = require('firebase-admin/firestore');
const {
  getMessaging,
  getFirestore,
  admin
} = require('./firebaseAdminApp');

const TOKEN_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const MAX_FCM_BATCH_SIZE = 500;

const getDb = () => getFirestore();

const chunkArray = (items, size) => {
  if (items.length <= size) {
    return [items];
  }

  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const isExpired = (metadata) => {
  if (!metadata) return false;
  const lastSeen = metadata.lastSeenAt instanceof Timestamp
    ? metadata.lastSeenAt.toMillis()
    : typeof metadata.lastSeenAt === 'number'
      ? metadata.lastSeenAt
      : 0;

  if (!lastSeen) {
    return false;
  }

  return Date.now() - lastSeen > TOKEN_MAX_AGE_MS;
};

const fetchTokens = async () => {
  const db = getDb();
  const snapshot = await db.collection('userTokens').get();

  const activeTokens = [];
  const tokensToPrune = new Map();

  snapshot.forEach((docSnap) => {
    const uid = docSnap.id;
    const data = docSnap.data() || {};
    const tokenEntries = Object.entries(data.tokens || {});

    tokenEntries.forEach(([token, metadata]) => {
      if (!token) {
        return;
      }

      if (isExpired(metadata)) {
        if (!tokensToPrune.has(uid)) {
          tokensToPrune.set(uid, new Set());
        }
        tokensToPrune.get(uid).add(token);
        return;
      }

      activeTokens.push({
        uid,
        token,
        metadata
      });
    });
  });

  return { activeTokens, tokensToPrune };
};

const removeTokens = async (tokensByUser) => {
  if (!tokensByUser || tokensByUser.size === 0) {
    return;
  }

  const db = getDb();
  const batch = db.batch();

  tokensByUser.forEach((tokenSet, uid) => {
    const docRef = db.collection('userTokens').doc(uid);
    const updates = {};
    Array.from(tokenSet).forEach((token) => {
      updates[`tokens.${token}`] = admin.firestore.FieldValue.delete();
    });
    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    batch.set(docRef, updates, { merge: true });
  });

  await batch.commit();

  console.log(`🧹 정리된 푸시 토큰: ${Array.from(tokensByUser.values()).reduce((acc, set) => acc + set.size, 0)}개`);
};

const sendMulticastMessage = async ({ notification, data }) => {
  const messaging = getMessaging();
  const { activeTokens, tokensToPrune } = await fetchTokens();

  if (activeTokens.length === 0) {
    console.log('ℹ️ 발송할 활성 푸시 토큰이 없습니다');
    if (tokensToPrune.size > 0) {
      await removeTokens(tokensToPrune);
    }
    return {
      successCount: 0,
      failureCount: 0,
      totalTokens: 0
    };
  }

  if (tokensToPrune.size > 0) {
    await removeTokens(tokensToPrune);
  }

  const batchedTokens = chunkArray(activeTokens, MAX_FCM_BATCH_SIZE);
  let successCount = 0;
  let failureCount = 0;
  const invalidTokens = new Map();

  for (const batchTokens of batchedTokens) {
    const tokens = batchTokens.map(item => item.token);

    try {
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification,
        data
      });

      successCount += response.successCount;
      failureCount += response.failureCount;

      response.responses.forEach((result, index) => {
        if (result.success) {
          return;
        }

        const error = result.error;
        const { uid, token } = batchTokens[index];
        const shouldRemove =
          error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered' ||
          error.code === 'messaging/mismatched-credential' ||
          error.code === 'messaging/message-rate-exceeded';

        console.warn(`⚠️ FCM 발송 실패 (${token}):`, error.message);

        if (shouldRemove) {
          if (!invalidTokens.has(uid)) {
            invalidTokens.set(uid, new Set());
          }
          invalidTokens.get(uid).add(token);
        }
      });
    } catch (error) {
      failureCount += batchTokens.length;
      console.error('❌ FCM 멀티캐스트 발송 중 오류:', error);
    }
  }

  if (invalidTokens.size > 0) {
    try {
      await removeTokens(invalidTokens);
    } catch (cleanupError) {
      console.error('❌ 실패 토큰 정리 중 오류:', cleanupError);
    }
  }

  console.log(`📬 푸시 알림 발송 완료: 총 ${activeTokens.length}개 토큰, 성공 ${successCount}, 실패 ${failureCount}`);

  return {
    successCount,
    failureCount,
    totalTokens: activeTokens.length
  };
};

const buildMissingPersonNotification = (missingPerson) => {
  const displayName = missingPerson?.name || '이름 미상';
  const location =
    missingPerson?.location?.address ||
    missingPerson?.lastSeen?.address ||
    missingPerson?.lastSeen?.name ||
    missingPerson?.lastSeenLocation ||
    '위치 미상';

  const notification = {
    title: `🚨 실종 속보: ${displayName}`,
    body: `${location}에서 제보가 접수되었습니다. 빠른 확인이 필요합니다.`
  };

  const deepLinkPath = missingPerson?.id ? `/?personId=${missingPerson.id}&utm_source=push` : '/';
  const seoPath = missingPerson?.id ? `/missing/${missingPerson.id}` : '/';

  const data = {
    missingPersonId: missingPerson?.id ?? '',
    missingPersonName: displayName,
    missingPersonLocation: location,
    missingDate: missingPerson?.missingDate ? String(missingPerson.missingDate) : '',
    source: missingPerson?.source || 'user_report',
    intent: 'missing-person',
    url: deepLinkPath,
    seoUrl: seoPath
  };

  Object.keys(data).forEach((key) => {
    if (data[key] == null) {
      data[key] = '';
      return;
    }
    if (typeof data[key] !== 'string') {
      data[key] = String(data[key]);
    }
  });

  return { notification, data };
};

const sendMissingPersonAlert = async (missingPerson) => {
  try {
    const payload = buildMissingPersonNotification(missingPerson);
    return await sendMulticastMessage(payload);
  } catch (error) {
    console.error('❌ 실종자 푸시 알림 발송 실패:', error);
    throw error;
  }
};

module.exports = {
  sendMissingPersonAlert,
  sendMulticastMessage
};
