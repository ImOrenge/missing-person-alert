const express = require('express');
const router = express.Router();
const firebaseService = require('../services/firebaseService');
const { validateMissingPerson, normalizeMissingPerson } = require('../schemas/firebaseSchema');
const APIPoller = require('../services/apiPoller');
const {
  verifyFirebaseToken,
  verifyPhoneAuthenticated,
  verifyAdmin,
  rateLimit,
  optionalAuth
} = require('../middleware/authMiddleware');

/**
 * POST /api/reports
 * 실종자 제보 등록 (전화번호 인증 필요)
 */
router.post('/', verifyFirebaseToken, verifyPhoneAuthenticated, rateLimit, async (req, res) => {
  try {
    const { person } = req.body;

    if (!person) {
      return res.status(400).json({ error: '실종자 정보가 필요합니다' });
    }

    // 제보자 UID (req.user에서 가져옴)
    const reporterUid = req.user.uid;

    // 주소를 좌표로 변환
    const apiPoller = new APIPoller(null);
    const location = apiPoller.getKoreanCityCoordinates(person.location.address);

    // 실종자 데이터 생성
    const reportData = {
      ...person,
      id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      location: location, // 변환된 좌표 사용
      reportedBy: {
        uid: reporterUid,
        reportedAt: new Date().toISOString()
      },
      status: 'active',
      source: 'user_report', // API와 구분하기 위한 필드
      missingDate: person.missingDate || new Date().toISOString()
    };

    // 데이터 정규화
    const normalized = normalizeMissingPerson(reportData);

    // 스키마 검증
    const validation = validateMissingPerson(normalized);
    if (!validation.valid) {
      return res.status(400).json({
        error: '제보 데이터 검증 실패',
        details: validation.errors
      });
    }

    // Firebase에 저장
    const saveResult = await firebaseService.saveMissingPersons([normalized]);

    if (saveResult.saved > 0) {
      console.log(`✅ 사용자 제보 저장: ${normalized.name} (제보자 UID: ${reporterUid})`);

      // WebSocket으로 실시간 전송 (wsManager가 있다면)
      if (global.wsManager) {
        global.wsManager.broadcast('NEW_MISSING_PERSON', [normalized]);
      }

      res.json({
        success: true,
        message: '제보가 성공적으로 등록되었습니다',
        report: normalized
      });
    } else {
      res.status(409).json({
        error: '이미 등록된 실종자 정보입니다',
        duplicates: saveResult.duplicates
      });
    }
  } catch (error) {
    console.error('❌ 제보 등록 실패:', error);
    res.status(500).json({ error: '제보 처리 중 오류가 발생했습니다' });
  }
});

/**
 * GET /api/reports/my
 * 내가 제보한 실종자 목록 조회 (인증 필요)
 */
router.get('/my', verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;

    // Firebase에서 모든 실종자 데이터 조회
    const allPersons = await firebaseService.getMissingPersons(1000);

    // 내가 제보한 것만 필터링
    const myReports = allPersons.filter(
      (person) => person.reportedBy && person.reportedBy.uid === uid
    );

    console.log(`✅ 제보 기록 조회: ${uid} - ${myReports.length}건`);

    res.json({
      success: true,
      count: myReports.length,
      reports: myReports
    });
  } catch (error) {
    console.error('❌ 제보 기록 조회 실패:', error);
    res.status(500).json({ error: '제보 기록 조회 중 오류가 발생했습니다' });
  }
});

/**
 * GET /api/reports/all
 * 모든 제보 조회 (관리자 전용)
 */
router.get('/all', verifyFirebaseToken, verifyAdmin, async (req, res) => {
  try {
    const uid = req.user.uid;

    // Firebase에서 모든 실종자 데이터 조회
    const allPersons = await firebaseService.getMissingPersons(1000);

    // 사용자 제보만 필터링 (API 데이터 제외)
    const userReports = allPersons.filter(
      (person) => person.source === 'user_report' && person.reportedBy
    );

    console.log(`✅ 전체 제보 조회 (관리자): ${uid} - ${userReports.length}건`);

    res.json({
      success: true,
      count: userReports.length,
      reports: userReports
    });
  } catch (error) {
    console.error('❌ 전체 제보 조회 실패:', error);
    res.status(500).json({ error: '전체 제보 조회 중 오류가 발생했습니다' });
  }
});

/**
 * GET /api/reports/:id
 * 특정 제보 상세 조회
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const person = await firebaseService.getMissingPerson(id);

    if (!person) {
      return res.status(404).json({ error: '제보를 찾을 수 없습니다' });
    }

    res.json({
      success: true,
      report: person
    });
  } catch (error) {
    console.error('❌ 제보 조회 실패:', error);
    res.status(500).json({ error: '제보 조회 중 오류가 발생했습니다' });
  }
});

/**
 * DELETE /api/reports/:id
 * 제보 삭제 (본인만 가능)
 */
router.delete('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.uid;

    // 제보 정보 조회
    const person = await firebaseService.getMissingPerson(id);

    if (!person) {
      return res.status(404).json({ error: '제보를 찾을 수 없습니다' });
    }

    // 본인 확인
    if (person.reportedBy && person.reportedBy.uid !== uid) {
      return res.status(403).json({ error: '본인이 제보한 내용만 삭제할 수 있습니다' });
    }

    // 삭제 (Firebase에서 제거)
    await firebaseService.deleteMissingPerson(id);

    console.log(`✅ 제보 삭제: ${id} (제보자: ${uid})`);

    res.json({
      success: true,
      message: '제보가 삭제되었습니다'
    });
  } catch (error) {
    console.error('❌ 제보 삭제 실패:', error);
    res.status(500).json({ error: '제보 삭제 중 오류가 발생했습니다' });
  }
});

module.exports = router;
