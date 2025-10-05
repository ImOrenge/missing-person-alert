const express = require('express');
const router = express.Router();

/**
 * 인증 상태 확인 미들웨어
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다' });
  }

  // 클라이언트에서 Firebase Auth로 검증된 토큰을 전송하므로
  // 여기서는 토큰 존재 여부만 확인
  req.token = token;
  next();
};

/**
 * POST /api/auth/register
 * 사용자 회원가입 (이메일/비밀번호)
 * 클라이언트에서 Firebase Auth로 처리 후 결과만 전달받음
 */
router.post('/register', async (req, res) => {
  try {
    const { uid, email, displayName } = req.body;

    if (!uid || !email) {
      return res.status(400).json({ error: 'UID와 이메일은 필수입니다' });
    }

    // 사용자 정보를 추가적으로 DB에 저장하거나 처리할 수 있음
    console.log('✅ 회원가입 완료:', { uid, email, displayName });

    res.json({
      success: true,
      message: '회원가입이 완료되었습니다',
      user: { uid, email, displayName }
    });
  } catch (error) {
    console.error('❌ 회원가입 실패:', error);
    res.status(500).json({ error: '회원가입 처리 중 오류가 발생했습니다' });
  }
});

/**
 * POST /api/auth/login
 * 사용자 로그인 (이메일/비밀번호 또는 Google)
 * 클라이언트에서 Firebase Auth로 처리 후 결과만 전달받음
 */
router.post('/login', async (req, res) => {
  try {
    const { uid, email, displayName, photoURL, provider } = req.body;

    if (!uid || !email) {
      return res.status(400).json({ error: 'UID와 이메일은 필수입니다' });
    }

    console.log('✅ 로그인 성공:', { uid, email, displayName, provider });

    res.json({
      success: true,
      message: '로그인이 완료되었습니다',
      user: { uid, email, displayName, photoURL, provider }
    });
  } catch (error) {
    console.error('❌ 로그인 실패:', error);
    res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다' });
  }
});

/**
 * POST /api/auth/logout
 * 사용자 로그아웃
 */
router.post('/logout', async (req, res) => {
  try {
    console.log('✅ 로그아웃 완료');

    res.json({
      success: true,
      message: '로그아웃이 완료되었습니다'
    });
  } catch (error) {
    console.error('❌ 로그아웃 실패:', error);
    res.status(500).json({ error: '로그아웃 처리 중 오류가 발생했습니다' });
  }
});

/**
 * GET /api/auth/user
 * 현재 로그인된 사용자 정보 조회 (인증 필요)
 */
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const { uid, email, displayName } = req.body;

    res.json({
      success: true,
      user: { uid, email, displayName }
    });
  } catch (error) {
    console.error('❌ 사용자 정보 조회 실패:', error);
    res.status(500).json({ error: '사용자 정보 조회 중 오류가 발생했습니다' });
  }
});

module.exports = router;
