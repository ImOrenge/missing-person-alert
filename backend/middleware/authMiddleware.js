const { getAuth } = require('firebase-admin/auth');
const admin = require('firebase-admin');
const path = require('path');
const recaptchaService = require('../services/recaptchaService');

// Firebase Admin 초기화 (한번만 실행)
if (!admin.apps.length) {
  try {
    // 서비스 계정 키 파일 경로 또는 환경 변수 사용
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (serviceAccountPath) {
      // 절대 경로로 변환
      const absolutePath = path.isAbsolute(serviceAccountPath)
        ? serviceAccountPath
        : path.resolve(__dirname, '..', serviceAccountPath);

      // 서비스 계정 키 파일이 있는 경우
      const serviceAccount = require(absolutePath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID || 'missing-person-alram',
      });
    } else {
      // 개발 환경: 인증 없이 초기화 (토큰 검증만 사용)
      // 프로덕션에서는 서비스 계정 키 필수
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'missing-person-alram',
      });
    }
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

    // 디버깅: 토큰 정보 로그
    console.log('🔍 토큰 정보:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      phone_number: decodedToken.phone_number,
      firebase: decodedToken.firebase
    });

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

    // 토큰에 전화번호가 없으면 Firebase에서 사용자 정보 조회
    if (!req.user.phoneNumber) {
      try {
        const userRecord = await getAuth().getUser(req.user.uid);

        console.log('🔍 Firebase 사용자 정보:', {
          uid: userRecord.uid,
          email: userRecord.email,
          phoneNumber: userRecord.phoneNumber,
          emailVerified: userRecord.emailVerified
        });

        // Firebase에서 조회한 전화번호 정보로 업데이트
        if (userRecord.phoneNumber) {
          req.user.phoneNumber = userRecord.phoneNumber;
        } else {
          return res.status(403).json({
            success: false,
            error: '전화번호 인증이 필요합니다',
            code: 'PHONE_VERIFICATION_REQUIRED'
          });
        }
      } catch (error) {
        console.error('Firebase 사용자 조회 실패:', error.message);
        return res.status(403).json({
          success: false,
          error: '전화번호 인증이 필요합니다',
          code: 'PHONE_VERIFICATION_REQUIRED'
        });
      }
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

    // 개발 환경이거나 서비스 계정 키가 없는 경우
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const hasServiceAccount = !!process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (!hasServiceAccount) {
      console.warn('⚠️ Firebase 서비스 계정 키가 설정되지 않았습니다.');

      if (isDevelopment) {
        // 개발 환경: 관리자 이메일 목록으로 확인
        const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(e => e);

        if (adminEmails.length > 0 && req.user.email && adminEmails.includes(req.user.email)) {
          console.log(`✅ 개발 모드: ${req.user.email} 관리자 권한 부여`);
          return next();
        }

        return res.status(403).json({
          success: false,
          error: '관리자 권한이 필요합니다',
          code: 'ADMIN_REQUIRED'
        });
      }

      // 프로덕션에서 서비스 계정 키 없으면 오류
      return res.status(500).json({
        success: false,
        error: '서버 설정 오류: Firebase 서비스 계정 키가 필요합니다'
      });
    }

    // 서비스 계정 키가 있는 경우: Firebase에서 사용자 정보 가져오기
    const userRecord = await getAuth().getUser(req.user.uid);

    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    const adminUids = (process.env.ADMIN_UIDS || '')
      .split(',')
      .map((uid) => uid.trim())
      .filter(Boolean);

    const hasCustomClaim = !!(userRecord.customClaims && userRecord.customClaims.admin);
    const emailMatch = userRecord.email ? adminEmails.includes(userRecord.email.toLowerCase()) : false;
    const uidMatch = adminUids.includes(userRecord.uid);

    if (!hasCustomClaim && !emailMatch && !uidMatch) {
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
const MAX_MAP_SIZE = 10000; // 최대 10,000개 항목으로 제한

const rateLimit = (req, res, next) => {
  const identifier = req.user?.uid || req.ip;
  const now = Date.now();

  // Map 크기 제한 체크 및 즉시 정리
  if (rateLimitMap.size >= MAX_MAP_SIZE) {
    // 오래된 항목 즉시 정리
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetTime) {
        rateLimitMap.delete(key);
      }
    }

    // 정리 후에도 크기가 크면 오래된 순서로 삭제
    if (rateLimitMap.size >= MAX_MAP_SIZE) {
      const entries = Array.from(rateLimitMap.entries());
      entries.sort((a, b) => a[1].resetTime - b[1].resetTime);
      const toDelete = entries.slice(0, Math.floor(MAX_MAP_SIZE * 0.1)); // 10% 삭제
      toDelete.forEach(([key]) => rateLimitMap.delete(key));
    }
  }

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

/**
 * Google reCAPTCHA Enterprise 검증 미들웨어
 */
const verifyRecaptcha = async (req, res, next) => {
  try {
    const recaptchaToken = req.headers['x-recaptcha-token'];

    if (!recaptchaToken) {
      return res.status(400).json({
        success: false,
        error: 'reCAPTCHA 토큰이 제공되지 않았습니다',
        code: 'RECAPTCHA_TOKEN_MISSING'
      });
    }

    const projectId = process.env.RECAPTCHA_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'missing-person-alram';
    const siteKey = process.env.RECAPTCHA_SITE_KEY || process.env.RECAPTCHA_WEB_SITE_KEY;

    const expectedAction = req.recaptchaAction || 'report_submit';

    const assessment = await recaptchaService.assessToken({
      token: recaptchaToken,
      action: expectedAction,
      siteKey,
      projectId,
      userIp: req.headers['x-forwarded-for'] || req.ip,
      userAgent: req.get('user-agent')
    });

    if (!assessment.valid) {
      console.error('❌ reCAPTCHA 토큰 무효:', assessment.invalidReason);
      return res.status(400).json({
        success: false,
        error: 'reCAPTCHA 검증에 실패했습니다',
        code: 'RECAPTCHA_VERIFICATION_FAILED',
        details: assessment.invalidReason
      });
    }

    const action = assessment.action || 'unknown';
    if (action !== expectedAction) {
      console.warn(`⚠️ reCAPTCHA 액션 불일치: ${action} (예상: ${expectedAction})`);
    }

    const score = typeof assessment.score === 'number' ? assessment.score : 0;
    const reasons = assessment.reasons || [];
    const MIN_SCORE = parseFloat(process.env.RECAPTCHA_MIN_SCORE) || 0.5;

    if (score < MIN_SCORE) {
      console.warn(`⚠️ reCAPTCHA 점수가 낮습니다: ${score} (최소: ${MIN_SCORE})`);
      return res.status(403).json({
        success: false,
        error: '보안 검증에 실패했습니다. 다시 시도해주세요.',
        code: 'RECAPTCHA_SCORE_TOO_LOW',
        score,
        reasons
      });
    }

    console.log(`✅ reCAPTCHA Enterprise 검증 성공 (점수: ${score}, 액션: ${action})`);

    req.recaptcha = {
      success: true,
      score,
      action,
      reasons,
      assessmentName: assessment.name
    };

    next();
  } catch (error) {
    console.error('❌ reCAPTCHA 검증 중 오류:', error.message);

    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({
        success: false,
        error: 'reCAPTCHA 검증 중 오류가 발생했습니다'
      });
    }

    console.warn('⚠️ 개발 환경: reCAPTCHA 검증 오류 무시');
    req.recaptcha = {
      success: true,
      score: 1.0,
      action: 'development'
    };
    next();
  }
};

/**
 * Guest ID 로깅 미들웨어
 * 요청 헤더에서 Guest ID를 추출하여 로그에 기록
 */
const logGuestId = (req, res, next) => {
  try {
    const guestId = req.headers['x-guest-id'];
    const userId = req.user?.uid;

    if (userId) {
      // 인증된 사용자
      console.log(`👤 사용자 요청 [UID: ${userId}] ${req.method} ${req.path}`);
    } else if (guestId) {
      // Guest 사용자
      console.log(`👻 Guest 요청 [Guest ID: ${guestId}] ${req.method} ${req.path}`);
      req.guestId = guestId;
    } else {
      // ID 없음
      console.log(`❓ 익명 요청 ${req.method} ${req.path}`);
    }

    next();
  } catch (error) {
    // 에러가 발생해도 계속 진행
    console.error('Guest ID 로깅 오류:', error.message);
    next();
  }
};

module.exports = {
  verifyFirebaseToken,
  verifyPhoneAuthenticated,
  verifyAdmin,
  rateLimit,
  optionalAuth,
  verifyRecaptcha,
  logGuestId
};
