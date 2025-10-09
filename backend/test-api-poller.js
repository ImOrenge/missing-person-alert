/**
 * API Poller 테스트 스크립트
 * Firebase 연동 및 안전드림 API 호출 테스트
 */

require('dotenv').config();
const firebaseService = require('./services/firebaseService');
const APIPoller = require('./services/apiPoller');

// 테스트용 WebSocket Manager 모의 객체
class MockWSManager {
  constructor() {
    this.clients = [];
    this.newConnectionCallback = null;
  }

  setOnNewConnection(callback) {
    this.newConnectionCallback = callback;
  }

  broadcast(event, data) {
    console.log(`📡 WebSocket broadcast: ${event} - ${data.length}건`);
  }

  sendToClient(client, event, data) {
    console.log(`📡 WebSocket sendToClient: ${event} - ${data.length}건`);
  }
}

async function testAPIPoller() {
  console.log('🧪 API Poller 테스트 시작\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // 1. Firebase 연결 확인
    console.log('\n1️⃣ Firebase 연결 확인...');
    const testData = await firebaseService.getMissingPersons(1);
    console.log(`✅ Firebase 연결 성공 (기존 데이터 ${testData.length}건)`);

    // 2. API Poller 인스턴스 생성
    console.log('\n2️⃣ API Poller 인스턴스 생성...');
    const mockWS = new MockWSManager();
    const apiPoller = new APIPoller(mockWS);
    console.log('✅ API Poller 생성 완료');

    // 3. 안전드림 API 호출 및 Firebase 저장
    console.log('\n3️⃣ 안전드림 API 호출 및 Firebase 저장...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await apiPoller.pollMissingPersonsAPI();

    // 4. 저장된 데이터 확인
    console.log('\n4️⃣ Firebase에 저장된 데이터 확인...');
    const savedData = await firebaseService.getMissingPersons(5);
    console.log(`✅ 최근 데이터 ${savedData.length}건 조회 완료`);

    if (savedData.length > 0) {
      console.log('\n📋 최근 저장된 실종자 정보 (최대 3건):');
      savedData.slice(0, 3).forEach((person, index) => {
        console.log(`\n  ${index + 1}. ${person.name} (${person.age}세, ${person.gender === 'M' ? '남성' : person.gender === 'F' ? '여성' : '미상'})`);
        console.log(`     실종 장소: ${person.location.address}`);
        console.log(`     실종 일시: ${new Date(person.missingDate).toLocaleDateString('ko-KR')}`);
        console.log(`     유형: ${person.type}`);
        console.log(`     출처: ${person.source}`);
      });
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 모든 테스트 완료!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ 테스트 실패:', error.message);
    console.error(error);
  }

  process.exit(0);
}

// 테스트 실행
testAPIPoller();
