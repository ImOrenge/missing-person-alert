const express = require('express');
const router = express.Router();
const { getFirestore } = require('../services/firebaseAdminApp');
const db = getFirestore();

/**
 * POST /api/views/:id/increment
 * 실종자 조회수 증가
 *
 * 요청:
 * - params.id: 실종자 ID
 * - body.guestId: 게스트 ID (선택)
 * - body.userId: 사용자 ID (선택, 로그인한 경우)
 *
 * 응답:
 * - viewCount: 업데이트된 조회수
 */
router.post('/:id/increment', async (req, res) => {
  try {
    const { id } = req.params;
    const { guestId, userId } = req.body;

    if (!id) {
      return res.status(400).json({ error: '실종자 ID가 필요합니다.' });
    }

    // 실종자 문서 참조
    const personRef = db.collection('missingPersons').doc(id);
    const personDoc = await personRef.get();

    if (!personDoc.exists) {
      return res.status(404).json({ error: '실종자 정보를 찾을 수 없습니다.' });
    }

    // 조회 기록 생성 (중복 조회 방지용)
    const viewId = userId || guestId || `anonymous_${Date.now()}`;
    const viewLogRef = db.collection('viewLogs').doc(`${id}_${viewId}`);
    const viewLogDoc = await viewLogRef.get();

    // 최근 1시간 이내 조회한 경우 카운트하지 않음
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (viewLogDoc.exists && viewLogDoc.data().lastViewed > oneHourAgo) {
      const personData = personDoc.data();
      return res.json({
        viewCount: personData.viewCount || 0,
        alreadyViewed: true
      });
    }

    // Firestore transaction으로 조회수 증가
    const result = await db.runTransaction(async (transaction) => {
      const person = await transaction.get(personRef);

      if (!person.exists) {
        throw new Error('실종자 정보를 찾을 수 없습니다.');
      }

      const currentData = person.data();
      const currentViewCount = currentData.viewCount || 0;
      const currentViewStats = currentData.viewStats || { total: 0 };

      // 조회수 증가
      const newViewCount = currentViewCount + 1;
      const newViewStats = {
        total: newViewCount,
        lastViewed: Date.now(),
        uniqueViewers: currentViewStats.uniqueViewers || 0
      };

      // 처음 조회하는 사용자인 경우 고유 조회자 수 증가
      if (!viewLogDoc.exists) {
        newViewStats.uniqueViewers += 1;
      }

      // 실종자 문서 업데이트
      transaction.update(personRef, {
        viewCount: newViewCount,
        viewStats: newViewStats,
        updatedAt: Date.now()
      });

      // 조회 기록 저장/업데이트
      transaction.set(viewLogRef, {
        personId: id,
        viewerId: viewId,
        viewerType: userId ? 'user' : 'guest',
        lastViewed: Date.now(),
        viewCount: (viewLogDoc.exists ? viewLogDoc.data().viewCount || 0 : 0) + 1
      }, { merge: true });

      return { viewCount: newViewCount, viewStats: newViewStats };
    });

    res.json({
      viewCount: result.viewCount,
      viewStats: result.viewStats,
      success: true
    });

  } catch (error) {
    console.error('조회수 증가 실패:', error);
    res.status(500).json({
      error: '조회수 증가에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * GET /api/views/:id
 * 실종자 조회수 조회
 *
 * 응답:
 * - viewCount: 조회수
 * - viewStats: 조회 통계
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: '실종자 ID가 필요합니다.' });
    }

    const personRef = db.collection('missingPersons').doc(id);
    const personDoc = await personRef.get();

    if (!personDoc.exists) {
      return res.status(404).json({ error: '실종자 정보를 찾을 수 없습니다.' });
    }

    const personData = personDoc.data();

    res.json({
      viewCount: personData.viewCount || 0,
      viewStats: personData.viewStats || { total: 0 }
    });

  } catch (error) {
    console.error('조회수 조회 실패:', error);
    res.status(500).json({
      error: '조회수 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * GET /api/views/top
 * 조회수 기준 상위 실종자 목록
 *
 * 쿼리 파라미터:
 * - limit: 가져올 개수 (기본값: 10, 최대: 50)
 *
 * 응답:
 * - 조회수 기준 상위 실종자 목록
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const snapshot = await db.collection('missingPersons')
      .where('status', '==', 'active')
      .orderBy('viewCount', 'desc')
      .limit(limit)
      .get();

    const topPersons = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      persons: topPersons,
      count: topPersons.length
    });

  } catch (error) {
    console.error('상위 조회수 목록 조회 실패:', error);
    res.status(500).json({
      error: '상위 조회수 목록 조회에 실패했습니다.',
      details: error.message
    });
  }
});

module.exports = router;
