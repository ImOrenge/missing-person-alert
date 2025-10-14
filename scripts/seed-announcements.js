const path = require('path');
const admin = require(path.join(__dirname, '../backend/node_modules/firebase-admin'));
const serviceAccount = require(path.join(__dirname, '../backend/serviceAccountKey.json'));

// Firebase Admin 초기화
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const sampleAnnouncements = [
  {
    text: "실종자를 발견하시면 즉시 112 또는 182(실종아동찾기센터)로 신고해주세요",
    type: "info",
    displayType: "banner",
    active: true,
    priority: 1,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    createdBy: "admin"
  },
  {
    text: "허위 신고 시 법적 책임을 질 수 있습니다",
    type: "warning",
    displayType: "banner",
    active: true,
    priority: 2,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    createdBy: "admin"
  },
  {
    text: "실시간 알림을 켜두시면 새로운 실종자 정보를 즉시 받아보실 수 있습니다",
    type: "info",
    displayType: "banner",
    active: true,
    priority: 3,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    createdBy: "admin"
  },
  {
    text: "중요한 시스템 업데이트가 있습니다!\n\n실종자 알림 서비스가 새롭게 개선되었습니다.\n- 실시간 위치 기반 알림\n- 개선된 검색 기능\n- 더 빠른 제보 시스템\n\n계속 이용해주셔서 감사합니다.",
    type: "info",
    displayType: "popup",
    active: true,
    priority: 1,
    popupTitle: "🎉 서비스 업데이트 안내",
    popupButtonText: "확인했습니다",
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    createdBy: "admin"
  },
  {
    text: "⚠️ 실종 골든타임은 48시간입니다!\n\n실종자를 발견하신 경우:\n1. 즉시 112에 신고\n2. 안전하게 보호\n3. 위치 정보 제공\n\n신속한 제보가 생명을 살립니다.\n여러분의 관심과 협조가 실종자를 찾는데 큰 힘이 됩니다.",
    type: "warning",
    displayType: "popup",
    active: true,
    priority: 2,
    popupTitle: "⚠️ 중요 안내",
    popupButtonText: "숙지했습니다",
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    createdBy: "admin"
  },
  {
    text: "실종자 정보는 경찰청 공공데이터를 기반으로 제공됩니다.\n\n이 서비스는 실종자 조기 발견을 돕기 위한 목적으로 운영되고 있습니다.",
    type: "info",
    displayType: "both",
    active: true,
    priority: 10,
    popupTitle: "📢 서비스 안내",
    popupButtonText: "알겠습니다",
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    createdBy: "admin"
  }
];

async function seedAnnouncements() {
  try {
    console.log('🌱 공지사항 샘플 데이터 추가 시작...\n');

    for (const announcement of sampleAnnouncements) {
      const docRef = await db.collection('announcements').add(announcement);
      console.log(`✅ 추가됨: ${announcement.text.substring(0, 50)}... (ID: ${docRef.id})`);
    }

    console.log(`\n✨ 완료! ${sampleAnnouncements.length}개의 공지사항이 추가되었습니다.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

seedAnnouncements();
