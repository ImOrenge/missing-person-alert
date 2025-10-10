const { getAuth } = require('firebase-admin/auth');
const admin = require('firebase-admin');
const axios = require('axios');
const path = require('path');
const { RecaptchaEnterpriseServiceClient } = require('@google-cloud/recaptcha-enterprise');

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

/**
 * Google reCAPTCHA Enterprise 검증 미들웨어
 */
const verifyRecaptcha = async (req, res, next) => {
  try {
    // reCAPTCHA 토큰 추출
    const recaptchaToken = req.headers['x-recaptcha-token'];

    if (!recaptchaToken) {
      return res.status(400).json({
        success: false,
        error: 'reCAPTCHA 토큰이 제공되지 않았습니다',
        code: 'RECAPTCHA_TOKEN_MISSING'
      });
    }

    // 환경 변수 확인
    const projectId = process.env.FIREBASE_PROJECT_ID || 'missing-person-alram';
    const siteKey = process.env.RECAPTCHA_SITE_KEY;

    if (!siteKey) {
      console.error('❌ RECAPTCHA_SITE_KEY가 설정되지 않았습니다');
      return res.status(500).json({
        success: false,
        error: '서버 설정 오류가 발생했습니다'
      });
    }

    // reCAPTCHA Enterprise 클라이언트 생성
    const client = new RecaptchaEnterpriseServiceClient();
    const projectPath = client.projectPath(projectId);

    // Assessment 생성
    const request = {
      parent: projectPath,
      assessment: {
        event: {
          token: recaptchaToken,
          siteKey: siteKey,
          expectedAction: req.recaptchaAction || 'report_submit'
        }
      }
    };

    const [response] = await client.createAssessment(request);

    // 토큰 유효성 검증
    if (!response.tokenProperties.valid) {
      console.error('❌ reCAPTCHA 토큰 무효:', response.tokenProperties.invalidReason);
      return res.status(400).json({
        success: false,
        error: 'reCAPTCHA 검증에 실패했습니다',
        code: 'RECAPTCHA_VERIFICATION_FAILED',
        details: response.tokenProperties.invalidReason
      });
    }

    // 액션 확인
    const expectedAction = req.recaptchaAction || 'report_submit';
    if (response.tokenProperties.action !== expectedAction) {
      console.warn(`⚠️ reCAPTCHA 액션 불일치: ${response.tokenProperties.action} (예상: ${expectedAction})`);
    }

    // 점수 확인 (0.0 ~ 1.0, 높을수록 사람일 가능성이 높음)
    const score = response.riskAnalysis.score;
    const MIN_SCORE = parseFloat(process.env.RECAPTCHA_MIN_SCORE) || 0.5;

    if (score < MIN_SCORE) {
      console.warn(`⚠️ reCAPTCHA 점수가 낮습니다: ${score} (최소: ${MIN_SCORE})`);
      return res.status(403).json({
        success: false,
        error: '보안 검증에 실패했습니다. 다시 시도해주세요.',
        code: 'RECAPTCHA_SCORE_TOO_LOW',
        score: score,
        reasons: response.riskAnalysis.reasons
      });
    }

    console.log(`✅ reCAPTCHA Enterprise 검증 성공 (점수: ${score}, 액션: ${response.tokenProperties.action})`);

    // 검증 결과를 req 객체에 추가
    req.recaptcha = {
      success: true,
      score: score,
      action: response.tokenProperties.action,
      reasons: response.riskAnalysis.reasons
    };

    next();
  } catch (error) {
    console.error('❌ reCAPTCHA 검증 중 오류:', error.message);

    // 프로덕션에서는 차단
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({
        success: false,
        error: 'reCAPTCHA 검증 중 오류가 발생했습니다'
      });
    }

    // 개발 환경에서는 통과
    console.warn('⚠️ 개발 환경: reCAPTCHA 검증 오류 무시');
    req.recaptcha = {
      success: true,
      score: 1.0,
      action: 'development'
    };
    next();
  }
};

module.exports = {
  verifyFirebaseToken,
  verifyPhoneAuthenticated,
  verifyAdmin,
  rateLimit,
  optionalAuth,
  verifyRecaptcha
};
