require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodeCron = require('node-cron');
const APIPoller = require('./services/apiPoller');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 설정
const corsOptions = {
  origin: function (origin, callback) {
    // 개발 환경 origin 목록
    const devOrigins = [
      'http://localhost:5173',
      'http://localhost:3001',
      'http://localhost:4173',
      'https://localhost:5173'
    ];

    // 배포 환경 origin 목록 (환경변수에서 쉼표로 구분된 목록)
    const prodOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : [];

    // 단일 프론트엔드 URL (하위 호환성)
    if (process.env.FRONTEND_URL) {
      prodOrigins.push(process.env.FRONTEND_URL);
    }

    const allowedOrigins = [...devOrigins, ...prodOrigins].filter(Boolean);

    // origin이 없는 경우 (서버 간 통신, Postman 등)
    if (!origin) {
      return callback(null, true);
    }

    // 허용된 origin인 경우
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // production 환경에서 허용되지 않은 origin
    if (process.env.NODE_ENV === 'production') {
      console.warn(`⚠️ CORS 차단: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    }

    // development 환경에서는 모든 origin 허용
    callback(null, true);
  },
  credentials: true, // 쿠키 및 인증 헤더 허용
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-recaptcha-token', 'x-guest-id']
};

app.use(cors(corsOptions));
app.use(express.json());

// Guest ID 로깅 미들웨어
const { logGuestId } = require('./middleware/authMiddleware');
app.use(logGuestId);

// 라우터
const authRouter = require('./routes/auth');
const reportsRouter = require('./routes/reports');
const apiRouter = require('./routes/api');
const adminRouter = require('./routes/admin');
const viewsRouter = require('./routes/views');
const missingPagesRouter = require('./routes/missingPages');
app.use('/api/auth', authRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/views', viewsRouter);
app.use('/api', apiRouter);
app.use('/', missingPagesRouter);

console.log('✅ 실종자 제보 API 서버 시작');

// 주기적 API Poller 초기화 (Firestore 기반, WebSocket 제거됨)
const apiPoller = new APIPoller();

const pollIntervalMinutes = Number(process.env.API_POLL_INTERVAL_MINUTES || '5');
const cronExpression = `*/${pollIntervalMinutes} * * * *`;

nodeCron.schedule(cronExpression, async () => {
  try {
    console.log(`⏱️  주기적 API 업데이트 시작 - ${pollIntervalMinutes}분 주기`);
    await apiPoller.pollMissingPersonsAPI();
  } catch (error) {
    console.error('❌ 주기적 API 업데이트 실패:', error.message);
  }
}, {
  timezone: 'Asia/Seoul'
});

// REST API 엔드포인트

// 헬스 체크
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// 서버 상태
app.get('/api/status', (req, res) => {
  res.json({
    server: 'running',
    service: 'missing-person-reports',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Express 서버 시작
app.listen(PORT, () => {
  console.log(`\n🚀 서버 시작 완료!`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📡 REST API: http://localhost:${PORT}`);
  console.log(`🌍 환경: ${process.env.NODE_ENV || 'development'}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
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
