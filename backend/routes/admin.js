const express = require('express');
const router = express.Router();
const { verifyFirebaseToken, verifyAdmin } = require('../middleware/authMiddleware');
const admin = require('firebase-admin');

// 모든 관리자 라우트에 인증 및 관리자 권한 체크
router.use(verifyFirebaseToken);
router.use(verifyAdmin);

// 유저 목록 조회
router.get('/users', async (req, res) => {
  try {
    const db = admin.firestore();

    // Firebase Auth에서 모든 사용자 가져오기
    const listUsersResult = await admin.auth().listUsers();

    // Firestore에서 각 사용자의 제보 수 가져오기
    const usersWithStats = await Promise.all(
      listUsersResult.users.map(async (userRecord) => {
        const reportsSnapshot = await db
          .collection('missing_persons')
          .where('reportedBy.uid', '==', userRecord.uid)
          .get();

        return {
          uid: userRecord.uid,
          email: userRecord.email || null,
          phoneNumber: userRecord.phoneNumber || null,
          displayName: userRecord.displayName || null,
          createdAt: userRecord.metadata.creationTime,
          lastSignInTime: userRecord.metadata.lastSignInTime || null,
          disabled: userRecord.disabled || false,
          reportCount: reportsSnapshot.size,
          isAdmin: false // 실제 관리자 체크 로직은 adminUtils 참조
        };
      })
    );

    res.json({
      success: true,
      users: usersWithStats,
      total: usersWithStats.length
    });
  } catch (error) {
    console.error('유저 목록 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '유저 목록 조회 중 오류가 발생했습니다'
    });
  }
});

// 사용자 상태 토글 (활성화/비활성화)
router.post('/users/:uid/toggle-status', async (req, res) => {
  try {
    const { uid } = req.params;
    const { disable } = req.body;

    // Firebase Auth에서 사용자 상태 업데이트
    await admin.auth().updateUser(uid, {
      disabled: disable
    });

    res.json({
      success: true,
      message: `사용자가 ${disable ? '비활성화' : '활성화'}되었습니다`
    });
  } catch (error) {
    console.error('사용자 상태 변경 실패:', error);
    res.status(500).json({
      success: false,
      error: '사용자 상태 변경 중 오류가 발생했습니다'
    });
  }
});

// 통계 조회
router.get('/statistics', async (req, res) => {
  try {
    const { range = 'week' } = req.query;
    const db = admin.firestore();

    // 시간 범위 계산
    const now = new Date();
    let startDate;

    switch (range) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // 전체 제보 가져오기
    const reportsSnapshot = await db.collection('missing_persons').get();
    const allReports = reportsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // 제보 통계
    const userReports = allReports.filter(r => r.source === 'user_report');
    const apiReports = allReports.filter(r => r.source !== 'user_report');
    const activeReports = allReports.filter(r => r.status === 'active');
    const resolvedReports = allReports.filter(r => r.status === 'resolved');

    // 오늘, 이번 주, 이번 달 제보
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const todayReports = allReports.filter(r =>
      r.reportedBy?.reportedAt && new Date(r.reportedBy.reportedAt) >= todayStart
    );
    const weekReports = allReports.filter(r =>
      r.reportedBy?.reportedAt && new Date(r.reportedBy.reportedAt) >= weekStart
    );
    const monthReports = allReports.filter(r =>
      r.reportedBy?.reportedAt && new Date(r.reportedBy.reportedAt) >= monthStart
    );

    // 사용자 통계
    const listUsersResult = await admin.auth().listUsers();
    const allUsers = listUsersResult.users;
    const activeUsers = allUsers.filter(u => !u.disabled);

    const usersWithReports = new Set(
      allReports
        .filter(r => r.reportedBy?.uid)
        .map(r => r.reportedBy.uid)
    );

    const todayUsers = allUsers.filter(u =>
      new Date(u.metadata.creationTime) >= todayStart
    );
    const weekUsers = allUsers.filter(u =>
      new Date(u.metadata.creationTime) >= weekStart
    );

    // 지역별 제보 통계
    const locationCounts = {};
    allReports.forEach(report => {
      if (report.location?.address) {
        // 주소에서 시/도 추출 (예: "서울특별시", "경기도")
        const match = report.location.address.match(/^([가-힣]+(?:특별시|광역시|특별자치시|도|특별자치도))/);
        const region = match ? match[1] : '기타';
        locationCounts[region] = (locationCounts[region] || 0) + 1;
      }
    });

    const locations = Object.entries(locationCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // 최근 활동
    const recentActivity = [];

    // 최근 제보 추가
    const recentReports = allReports
      .filter(r => r.reportedBy?.reportedAt)
      .sort((a, b) => new Date(b.reportedBy.reportedAt) - new Date(a.reportedBy.reportedAt))
      .slice(0, 5);

    recentReports.forEach(report => {
      recentActivity.push({
        type: 'report',
        description: `${report.name} (${report.age}세) 실종자 제보`,
        timestamp: report.reportedBy.reportedAt
      });
    });

    // 최근 가입 사용자 추가
    const recentUsers = allUsers
      .sort((a, b) => new Date(b.metadata.creationTime) - new Date(a.metadata.creationTime))
      .slice(0, 5);

    recentUsers.forEach(user => {
      recentActivity.push({
        type: 'user',
        description: `${user.displayName || user.email || '사용자'} 가입`,
        timestamp: user.metadata.creationTime
      });
    });

    // 시간순 정렬
    recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      statistics: {
        reports: {
          total: allReports.length,
          userReports: userReports.length,
          apiReports: apiReports.length,
          activeReports: activeReports.length,
          resolvedReports: resolvedReports.length,
          todayReports: todayReports.length,
          weekReports: weekReports.length,
          monthReports: monthReports.length
        },
        users: {
          total: allUsers.length,
          active: activeUsers.length,
          withReports: usersWithReports.size,
          todayRegistered: todayUsers.length,
          weekRegistered: weekUsers.length
        },
        locations,
        recentActivity: recentActivity.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('통계 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '통계 조회 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;
