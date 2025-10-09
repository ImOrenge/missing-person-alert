const { getAuth } = require('firebase-admin/auth');
const admin = require('firebase-admin');

// Firebase Admin 초기화 (한번만 실행)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'missing-person-alram',
    });
    console.log('✅ Firebase Admin 초기화 완료');
  } catch (error) {
    console.error('❌ Firebase Admin 초기화 실패:', error.message);
  }
}

/**
 * Firebase 인증 토큰 검증 미들웨어
 */
const verifyFirebaseToken = async (req, res, next) => {
  try {
    // Authorization 헤더에서 토큰 추출
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: '인증 토큰이 제공되지 않았습니다'
      });
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰 형식입니다'
      });
    }

    // 토큰 검증
    const decodedToken = await getAuth().verifyIdToken(token);

    // 사용자 정보를 req 객체에 추가
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      phoneNumber: decodedToken.phone_number,
      emailVerified: decodedToken.email_verified
    };

    next();
  } catch (error) {
    console.error('토큰 검증 실패:', error.message);

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        error: '토큰이 만료되었습니다',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.code === 'auth/invalid-id-token') {
      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다',
        code: 'INVALID_TOKEN'
      });
    }

    return res.status(401).json({
      success: false,
      error: '인증에 실패했습니다',
      code: 'AUTH_FAILED'
    });
  }
};

/**
 * 전화번호 인증 확인 미들웨어
 */
const verifyPhoneAuthenticated = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: '인증이 필요합니다'
      });
    }

    // 전화번호 인증 여부 확인
    if (!req.user.phoneNumber) {
      return res.status(403).json({
        success: false,
        error: '전화번호 인증이 필요합니다',
        code: 'PHONE_VERIFICATION_REQUIRED'
      });
    }

    next();
  } catch (error) {
    console.error('전화번호 인증 확인 실패:', error.message);
    return res.status(500).json({
      success: false,
      error: '인증 확인 중 오류가 발생했습니다'
    });
  }
};

/**
 * 관리자 권한 확인 미들웨어
 */
const verifyAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: '인증이 필요합니다'
      });
    }

    // Firebase에서 사용자 정보 가져오기
    const userRecord = await getAuth().getUser(req.user.uid);

    // 커스텀 클레임에서 관리자 권한 확인
    if (!userRecord.customClaims || !userRecord.customClaims.admin) {
      return res.status(403).json({
        success: false,
        error: '관리자 권한이 필요합니다',
        code: 'ADMIN_REQUIRED'
      });
    }

    next();
  } catch (error) {
    console.error('관리자 권한 확인 실패:', error.message);
    return res.status(500).json({
      success: false,
      error: '권한 확인 중 오류가 발생했습니다'
    });
  }
};

/**
 * Rate Limiting 미들웨어 (간단한 메모리 기반)
 */
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1분
const MAX_REQUESTS = 10; // 1분당 최대 요청 수

const rateLimit = (req, res, next) => {
  const identifier = req.user?.uid || req.ip;
  const now = Date.now();

  if (!rateLimitMap.has(identifier)) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  const userData = rateLimitMap.get(identifier);

  if (now > userData.resetTime) {
    // 윈도우 리셋
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  if (userData.count >= MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((userData.resetTime - now) / 1000)
    });
  }

  userData.count++;
  rateLimitMap.set(identifier, userData);
  next();
};

// 주기적으로 오래된 항목 정리 (메모리 누수 방지)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000); // 5분마다 정리

/**
 * 선택적 인증 미들웨어 (인증되지 않아도 계속 진행)
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];

      if (token) {
        try {
          const decodedToken = await getAuth().verifyIdToken(token);
          req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            phoneNumber: decodedToken.phone_number,
            emailVerified: decodedToken.email_verified
          };
        } catch (error) {
          // 토큰 검증 실패해도 계속 진행
          console.log('토큰 검증 실패 (선택적 인증):', error.message);
        }
      }
    }

    next();
  } catch (error) {
    // 에러가 발생해도 계속 진행
    next();
  }
};

module.exports = {
  verifyFirebaseToken,
  verifyPhoneAuthenticated,
  verifyAdmin,
  rateLimit,
  optionalAuth
};
