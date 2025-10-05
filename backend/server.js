require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const WebSocketManager = require('./services/websocketManager');
const APIPoller = require('./services/apiPoller');
const firebaseService = require('./services/firebaseService');

const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

// 미들웨어
app.use(cors());
app.use(express.json());

// WebSocket 서버 초기화
const wsManager = new WebSocketManager(WS_PORT);
console.log(`🔌 WebSocket 서버가 포트 ${WS_PORT}에서 실행 중`);

// API 폴러 초기화
const apiPoller = new APIPoller(wsManager);

// 실종자 API 폴링 (10초마다)
const emergencyInterval = parseInt(process.env.POLL_INTERVAL_EMERGENCY) || 10000;
cron.schedule(`*/${emergencyInterval / 1000} * * * * *`, () => {
  apiPoller.pollMissingPersonsAPI();
});
console.log(`⏰ 실종자 API 폴링 시작 (${emergencyInterval / 1000}초마다)`);

// 재난문자 API 폴링 (30초마다)
const generalInterval = parseInt(process.env.POLL_INTERVAL_GENERAL) || 30000;
cron.schedule(`*/${generalInterval / 1000} * * * * *`, () => {
  apiPoller.pollEmergencyMessagesAPI();
});
console.log(`⏰ 재난문자 API 폴링 시작 (${generalInterval / 1000}초마다)`);

// REST API 엔드포인트

// 헬스 체크
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    connectedClients: wsManager.getClientCount(),
    timestamp: new Date().toISOString()
  });
});

// 서버 상태
app.get('/api/status', (req, res) => {
  res.json({
    server: 'running',
    websocket: {
      port: WS_PORT,
      connectedClients: wsManager.getClientCount()
    },
    polling: {
      emergencyInterval: `${emergencyInterval / 1000}초`,
      generalInterval: `${generalInterval / 1000}초`
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

// 수동으로 샘플 데이터 전송 (테스트용)
app.post('/api/test/send-sample', (req, res) => {
  apiPoller.generateSampleMissingPersons();
  res.json({
    success: true,
    message: '샘플 데이터가 전송되었습니다',
    clientCount: wsManager.getClientCount()
  });
});

// 캐시 초기화 (디버깅용)
app.post('/api/test/clear-cache', (req, res) => {
  apiPoller.clearCache();
  res.json({
    success: true,
    message: '캐시가 초기화되었습니다'
  });
});

// 캐시 상태 조회
app.get('/api/test/cache-status', (req, res) => {
  res.json({
    notifiedIds: apiPoller.notifiedIds.size,
    personFingerprints: apiPoller.personFingerprints.size,
    locationCache: apiPoller.locationCache.size
  });
});

// Firebase에서 실종자 데이터 조회
app.get('/api/missing-persons', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const persons = await firebaseService.getMissingPersons(limit);
    res.json({
      success: true,
      data: persons,
      count: persons.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Express 서버 시작
app.listen(PORT, () => {
  console.log(`\n🚀 서버 시작 완료!`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📡 REST API: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${WS_PORT}`);
  console.log(`🌍 환경: ${process.env.NODE_ENV || 'development'}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // 초기 데이터 로드
  console.log('🔄 초기 데이터 로딩...');
  setTimeout(async () => {
    // Firebase에서 기존 데이터 로드
    const existingData = await firebaseService.getMissingPersons(50);
    if (existingData.length > 0) {
      console.log(`📦 Firebase에서 ${existingData.length}건의 기존 데이터 로드됨`);
      apiPoller.recentDataCache = existingData;
    }

    // 새 데이터 폴링 시작
    apiPoller.pollMissingPersonsAPI();
    apiPoller.pollEmergencyMessagesAPI();
  }, 2000);
});

// 에러 핸들링
process.on('uncaughtException', (error) => {
  console.error('❌ 예외 발생:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

// 종료 시 정리
process.on('SIGTERM', () => {
  console.log('🛑 서버 종료 중...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 서버 종료 중...');
  process.exit(0);
});
