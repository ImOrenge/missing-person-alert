const express = require('express');
const axios = require('axios');
const router = express.Router();

/**
 * GET /api/safe182/missing-persons
 * 안전드림 API를 통한 실종자 데이터 조회 (CORS 우회용 프록시)
 */
router.get('/safe182/missing-persons', async (req, res) => {
  try {
    const esntlId = process.env.SAFE182_ESNTL_ID || '10000847';
    const authKey = process.env.SAFE182_AUTH_KEY || 'f16ae98f22b44441';

    // URLSearchParams로 POST 요청 파라미터 구성
    const params = new URLSearchParams({
      esntlId: esntlId,
      authKey: authKey,
      rowSize: '100'  // 최대 100건
    });

    // 대상 구분 코드 추가
    params.append('writngTrgetDscds', '010'); // 아동
    params.append('writngTrgetDscds', '020'); // 일반가출
    params.append('writngTrgetDscds', '040'); // 시설보호자
    params.append('writngTrgetDscds', '060'); // 지적장애
    params.append('writngTrgetDscds', '061'); // 18세미만 지적장애
    params.append('writngTrgetDscds', '062'); // 18세이상 지적장애
    params.append('writngTrgetDscds', '070'); // 치매
    params.append('writngTrgetDscds', '080'); // 신원불상

    // POST 요청으로 API 호출
    const response = await axios.post(
      'https://www.safe182.go.kr/api/lcm/findChildList.do',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000
      }
    );

    // API 응답 검증
    if (response.data.result === '99') {
      console.error('❌ 안전드림 API 인증 실패:', response.data.msg);
      return res.status(401).json({
        error: 'API 인증 실패',
        message: response.data.msg,
        list: [] // 빈 배열 반환
      });
    }

    if (response.data.result !== '00') {
      console.warn('⚠️ 안전드림 API 응답 오류:', response.data.msg);
      return res.json({
        result: response.data.result,
        msg: response.data.msg,
        list: [] // 빈 배열 반환
      });
    }

    res.json(response.data);
  } catch (error) {
    console.error('❌ 안전드림 API 호출 오류:', error.message);
    res.status(500).json({
      error: 'API 호출 실패',
      message: error.message
    });
  }
});

/**
 * GET /api/safe182/photo/:id
 * 안전드림 API 이미지 프록시 (CORS 우회)
 */
router.get('/safe182/photo/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: '식별코드가 필요합니다' });
    }

    // 안전드림 API에서 이미지 가져오기
    const response = await axios.get(
      `https://www.safe182.go.kr/api/lcm/imgView.do?msspsnIdntfccd=${id}`,
      {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      }
    );

    // 이미지 타입 설정 (응답 헤더에서 가져오거나 기본값)
    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400'); // 24시간 캐시

    res.send(response.data);
  } catch (error) {
    console.error('❌ 이미지 로드 실패:', error.message);
    res.status(404).json({
      error: '이미지를 찾을 수 없습니다',
      message: error.message
    });
  }
});

module.exports = router;
    