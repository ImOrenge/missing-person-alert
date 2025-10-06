const express = require('express');
const router = express.Router();
const firebaseService = require('../services/firebaseService');
const { validateMissingPerson, normalizeMissingPerson } = require('../schemas/firebaseSchema');
const APIPoller = require('../services/apiPoller');

/**
 * 인증 확인 미들웨어
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '로그인이 필요합니다' });
  }

  req.token = token;
  next();
};

/**
 * POST /api/reports
 * 실종자 제보 등록 (인증 필요)
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { person, reporter } = req.body;

    if (!person || !reporter) {
      return res.status(400).json({ error: '실종자 정보와 제보자 정보가 필요합니다' });
    }

    // 제보자 UID (Firebase Auth에서 전달)
    const reporterUid = req.body.uid || `user_${Date.now()}`;

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
        name: reporter.name,
        phone: reporter.phone,
        relation: reporter.relation,
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
      console.log(`✅ 사용자 제보 저장: ${normalized.name} (제보자: ${reporter.name})`);

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
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const uid = req.body.uid || req.query.uid;

    if (!uid) {
      return res.status(400).json({ error: 'UID가 필요합니다' });
    }

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
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.body.uid;

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
