require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(cors());
app.use(express.json());

// 라우터
const authRouter = require('./routes/auth');
const reportsRouter = require('./routes/reports');
const apiRouter = require('./routes/api');
app.use('/api/auth', authRouter);
app.use('/api/reports', reportsRouter);
app.use('/api', apiRouter);

console.log('✅ 실종자 제보 API 서버 시작');

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
