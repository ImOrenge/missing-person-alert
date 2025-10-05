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

// 라우터
const authRouter = require('./routes/auth');
app.use('/api/auth', authRouter);

// WebSocket 서버 초기화
const wsManager = new WebSocketManager(WS_PORT);
console.log(`🔌 WebSocket 서버가 포트 ${WS_PORT}에서 실행 중`);

// API 폴러 초기화
const apiPoller = new APIPoller(wsManager);

// 실종자 API 폴링 (5분마다)
const emergencyInterval = parseInt(process.env.POLL_INTERVAL_EMERGENCY) || 300000;
cron.schedule('*/5 * * * *', () => {
  apiPoller.pollMissingPersonsAPI();
});
console.log(`⏰ 실종자 API 폴링 시작 (5분마다)`);

// 재난문자 API 폴링 (30초마다)
const generalInterval = parseInt(process.env.POLL_INTERVAL_GENERAL) || 30000;
cron.schedule(`*/${generalInterval / 1000} * * * * *`, () => {
  apiPoller.pollEmergencyMessagesAPI();
});
console.log(`⏰ 재난문자 API 폴링 시작 (${generalInterval / 1000}초마다)`);

// 중복 데이터 제거 (1시간마다)
cron.schedule('0 * * * *', async () => {
  console.log('🧹 중복 데이터 제거 시작...');
  const removedCount = await firebaseService.removeDuplicates();
  if (removedCount > 0) {
    console.log(`✅ ${removedCount}건의 중복 데이터 제거 완료`);
  }
});
console.log('⏰ 중복 제거 스케줄러 시작 (1시간마다)');

// 24시간 데이터 아카이브 및 초기화 (매일 한국시간 0시)
cron.schedule('0 15 * * *', async () => {
  // UTC 15:00 = KST 00:00 (다음날)
  console.log('🕛 한국시간 0시 - 24시간 데이터 아카이브 및 초기화 시작...');
  const result = await firebaseService.archiveAndReset();
  if (result.reset) {
    console.log(`✅ ${result.archived}건 아카이브 완료 (${result.archiveDate})`);
  }
});
console.log('⏰ 24시간 아카이브 스케줄러 시작 (매일 KST 0시)');

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
      emergencyInterval: '5분',
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

// Firebase 데이터 동기화 상태 조회
app.get('/api/firebase/status', async (req, res) => {
  try {
    const persons = await firebaseService.getMissingPersons(10);
    res.json({
      success: true,
      totalPersons: persons.length,
      latestPersons: persons.slice(0, 3).map(p => ({
        id: p.id,
        name: p.name,
        age: p.age,
        updatedAt: p.updatedAt
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
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

// 수동으로 중복 제거 실행
app.post('/api/remove-duplicates', async (req, res) => {
  try {
    console.log('🧹 수동 중복 제거 요청...');
    const removedCount = await firebaseService.removeDuplicates();
    res.json({
      success: true,
      removed: removedCount,
      message: removedCount > 0
        ? `${removedCount}건의 중복 데이터를 제거했습니다.`
        : '중복 데이터가 없습니다.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 수동으로 24시간 아카이브 및 초기화 실행 (테스트용)
app.post('/api/archive-reset', async (req, res) => {
  try {
    console.log('📦 수동 아카이브 및 초기화 요청...');
    const result = await firebaseService.archiveAndReset();
    res.json({
      success: result.reset,
      archived: result.archived,
      archiveDate: result.archiveDate,
      message: result.reset
        ? `${result.archived}건을 ${result.archiveDate}에 아카이브하고 목록을 초기화했습니다.`
        : '아카이브할 데이터가 없습니다.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 아카이브된 데이터 조회
app.get('/api/archive/:date', async (req, res) => {
  try {
    const dateKey = req.params.date; // YYYY-MM-DD 형식
    const archive = await firebaseService.getArchive(dateKey);

    if (!archive) {
      return res.status(404).json({
        success: false,
        message: `${dateKey} 날짜의 아카이브를 찾을 수 없습니다.`
      });
    }

    res.json({
      success: true,
      date: dateKey,
      count: archive.count,
      data: archive.data
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
