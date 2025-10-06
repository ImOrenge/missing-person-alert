const axios = require('axios');
const cheerio = require('cheerio');
const NodeGeocoder = require('node-geocoder');
const firebaseService = require('./firebaseService');

class APIPoller {
  constructor(wsManager) {
    this.wsManager = wsManager;
    this.lastFetchTime = new Date();

    // Geocoder 설정 (Google Maps API 또는 무료 대안 사용)
    this.geocoder = NodeGeocoder({
      provider: 'openstreetmap', // 무료 서비스
      formatter: null
    });

    // 주소-좌표 캐시 (반복 조회 방지)
    this.locationCache = new Map();

    // 새 클라이언트 연결 시 Firebase에서 데이터 전송
    this.wsManager.setOnNewConnection(async (client) => {
      const recentData = await firebaseService.getMissingPersons(10);
      if (recentData.length > 0) {
        console.log(`🔄 새 클라이언트에게 Firebase에서 ${recentData.length}건 전송`);
        this.wsManager.sendToClient(client, 'NEW_MISSING_PERSON', recentData);
      }
    });
  }

  /**
   * 안전드림 182 API를 통한 실종자 데이터 조회
   * API 엔드포인트: https://www.safe182.go.kr/api/lcm/findChildList.do
   */
  async pollMissingPersonsAPI() {
    try {
      console.log('🔍 안전드림 182 API 호출 시작...');

      // API 인증 정보
      const esntlId = process.env.SAFE182_ESNTL_ID || '10011616';
      const authKey = process.env.SAFE182_AUTH_KEY || 'd4dce53abbc84060';

      let allItems = [];
      let currentPage = 1;
      const rowSize = 100; // API 최대 허용 건수
      let hasMoreData = true;

      // 페이지네이션으로 모든 데이터 수집
      while (hasMoreData) {
        if (currentPage === 1) {
          console.log(`📄 데이터 조회 중...`);
        }

        // API 파라미터 설정
        const params = new URLSearchParams({
          esntlId: esntlId,
          authKey: authKey,
          rowSize: rowSize.toString(),
          page: currentPage.toString()
        });

        // 대상 구분 추가 (010: 아동, 020: 일반가출, 060: 지적장애, 070: 치매)
        params.append('writngTrgetDscds', '010');
        params.append('writngTrgetDscds', '020');
        params.append('writngTrgetDscds', '060');
        params.append('writngTrgetDscds', '070');

        // API 호출
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

        // API 응답 확인 (result: "00" = 성공, "01" = 실패)
        if (!response.data || (response.data.result !== '00' && response.data.result !== 'true')) {
          console.warn('⚠️  API 호출 실패:', response.data?.msg || '알 수 없는 오류');
          break;
        }

        const apiList = response.data.list || [];
        const totalCount = response.data.totalCount || 0;

        if (apiList.length === 0) {
          if (currentPage === 1) {
            console.log(`📭 실종자 정보 없음`);
          }
          hasMoreData = false;
          break;
        }

        console.log(`  ✓ ${apiList.length}건 수신 (전체 ${totalCount}건 중)`);
        if (currentPage > 1) {
          console.log(`📄 페이지 ${currentPage} 조회 완료`);
        }

        allItems = allItems.concat(apiList);

        // 마지막 페이지인지 확인
        if (allItems.length >= totalCount || apiList.length < rowSize) {
          hasMoreData = false;
        } else {
          currentPage++;
          // API 부하 방지를 위해 페이지 간 대기
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (allItems.length === 0) {
        return;
      }

      console.log(`\n📊 총 ${allItems.length}건 수집 완료`);

      // API 데이터를 내부 형식으로 변환
      const transformedItems = [];

      for (const item of allItems) {
        try {
          const transformedItem = await this.transformAPIData(item);
          transformedItems.push(transformedItem);
        } catch (error) {
          console.error(`  ⚠️ 데이터 변환 실패 (${item.nm}):`, error.message);
        }
      }

      console.log(`✅ ${transformedItems.length}건 변환 완료`);

      // 실종일 기준 최신순 정렬
      transformedItems.sort((a, b) => {
        try {
          const dateA = new Date(a.missingDate).getTime();
          const dateB = new Date(b.missingDate).getTime();
          return dateB - dateA;
        } catch (error) {
          return 0;
        }
      });

      // Firebase에 저장
      if (transformedItems.length > 0) {
        const saveResult = await firebaseService.saveMissingPersons(transformedItems);

        if (saveResult.saved > 0) {
          console.log(`💾 ${saveResult.saved}건 저장 (중복 ${saveResult.duplicates}건 제외)`);

          // Firebase에서 최근 저장된 데이터 조회 후 WebSocket 전송
          const recentlySaved = await firebaseService.getMissingPersons(saveResult.saved);

          if (recentlySaved.length > 0) {
            this.wsManager.broadcast('NEW_MISSING_PERSON', recentlySaved);
            console.log(`📡 ${recentlySaved.length}건 WebSocket 전송 완료`);
          }

          this.lastFetchTime = new Date();
        } else {
          console.log(`⏭️  모두 중복 (${saveResult.duplicates}건)`);
        }
      }

    } catch (error) {
      console.error('❌ 안전드림 API 호출 오류:', error.message);
      if (error.response) {
        console.error('응답 상태:', error.response.status);
        console.error('응답 데이터:', error.response.data);
      }
    }
  }

  /**
   * 안전드림 API 데이터를 내부 형식으로 변환
   */
  async transformAPIData(apiData) {
    // ID 생성 (msspsnIdntfccd 사용 또는 고유값 생성) - 항상 문자열로 변환
    const id = String(apiData.msspsnIdntfccd || `safe182_${apiData.nm}_${apiData.age}`);

    // 성별 변환 (남자/여자 -> M/F)
    const gender = apiData.sexdstnDscd === '남자' ? 'M' :
                   apiData.sexdstnDscd === '여자' ? 'F' : 'U';

    // 대상 구분을 타입으로 변환
    let type = 'missing_child';
    if (apiData.writngTrgetDscd === '070') type = 'dementia';
    else if (apiData.writngTrgetDscd === '060') type = 'disabled';
    else if (apiData.writngTrgetDscd === '020') type = 'runaway';
    else if (apiData.writngTrgetDscd === '010') type = 'missing_child';

    // 실종일시 파싱 (YYYYMMDD 형식을 ISO 형식으로 변환)
    let missingDate;
    try {
      if (apiData.occrde) {
        const dateStr = apiData.occrde.toString();
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        missingDate = new Date(`${year}-${month}-${day}`).toISOString();
      } else {
        missingDate = new Date().toISOString();
      }
    } catch (error) {
      missingDate = new Date().toISOString();
    }

    // 주소에서 좌표 가져오기
    const location = await this.geocodeAddress(apiData.occrAdres || '주소 미상');

    // 사진 URL 생성
    const photo = apiData.tknphotolength !== '0' && apiData.msspsnIdntfccd
      ? `https://www.safe182.go.kr/api/lcm/imgView.do?msspsnIdntfccd=${apiData.msspsnIdntfccd}`
      : null;

    return {
      id,
      name: apiData.nm || '미상',
      age: parseInt(apiData.ageNow) || parseInt(apiData.age) || 0,
      gender,
      location,
      photo,
      description: apiData.alldressingDscd || '특이사항 없음',
      missingDate,
      type,
      status: 'active',
      height: apiData.height || null,
      weight: apiData.bdwgh || null,
      clothes: apiData.alldressingDscd || null,
      // 추가 상세 정보
      bodyType: apiData.frmDscd || null,
      faceShape: apiData.faceshpeDscd || null,
      hairShape: apiData.hairshpeDscd || null,
      hairColor: apiData.haircolrDscd || null
    };
  }


  /**
   * 주소를 좌표로 변환 (Geocoding)
   * 한국 주요 도시 좌표 사용
   */
  async geocodeAddress(address) {
    try {
      // 캐시 확인
      if (this.locationCache.has(address)) {
        return this.locationCache.get(address);
      }

      // 주소가 너무 짧거나 미상인 경우 기본값 반환
      if (!address || address === '주소 미상' || address.length < 3) {
        return { lat: 37.5665, lng: 126.9780, address: '서울특별시' };
      }

      // 한국 주요 도시/지역 좌표 매핑 (fallback)
      const location = this.getKoreanCityCoordinates(address);

      // 캐시에 저장
      this.locationCache.set(address, location);

      return location;

    } catch (error) {
      console.error(`  ⚠️ Geocoding 오류 (${address}):`, error.message);
      return { lat: 37.5665, lng: 126.9780, address: address };
    }
  }

  /**
   * 한국 주요 도시 좌표 반환
   */
  getKoreanCityCoordinates(address) {
    // 시/도 단위 좌표 매핑
    const cityCoordinates = {
      '서울': { lat: 37.5665, lng: 126.9780 },
      '부산': { lat: 35.1796, lng: 129.0756 },
      '대구': { lat: 35.8714, lng: 128.6014 },
      '인천': { lat: 37.4563, lng: 126.7052 },
      '광주': { lat: 35.1595, lng: 126.8526 },
      '대전': { lat: 36.3504, lng: 127.3845 },
      '울산': { lat: 35.5384, lng: 129.3114 },
      '세종': { lat: 36.4800, lng: 127.2890 },
      '경기': { lat: 37.4138, lng: 127.5183 },
      '강원': { lat: 37.8228, lng: 128.1555 },
      '충북': { lat: 36.8000, lng: 127.7000 },
      '충남': { lat: 36.5184, lng: 126.8000 },
      '전북': { lat: 35.7175, lng: 127.1530 },
      '전남': { lat: 34.8679, lng: 126.9910 },
      '경북': { lat: 36.4919, lng: 128.8889 },
      '경남': { lat: 35.4606, lng: 128.2132 },
      '제주': { lat: 33.4890, lng: 126.4983 }
    };

    // 구/군 단위 좌표 매핑 (주요 지역)
    const districtCoordinates = {
      '강남구': { lat: 37.5172, lng: 127.0473 },
      '강동구': { lat: 37.5301, lng: 127.1238 },
      '강북구': { lat: 37.6396, lng: 127.0258 },
      '강서구': { lat: 37.5509, lng: 126.8495 },
      '관악구': { lat: 37.4784, lng: 126.9516 },
      '광진구': { lat: 37.5384, lng: 127.0822 },
      '구로구': { lat: 37.4954, lng: 126.8874 },
      '금천구': { lat: 37.4519, lng: 126.8955 },
      '노원구': { lat: 37.6542, lng: 127.0568 },
      '도봉구': { lat: 37.6688, lng: 127.0471 },
      '동대문구': { lat: 37.5744, lng: 127.0398 },
      '동작구': { lat: 37.5124, lng: 126.9393 },
      '마포구': { lat: 37.5663, lng: 126.9019 },
      '서대문구': { lat: 37.5791, lng: 126.9368 },
      '서초구': { lat: 37.4837, lng: 127.0324 },
      '성동구': { lat: 37.5634, lng: 127.0371 },
      '성북구': { lat: 37.5894, lng: 127.0167 },
      '송파구': { lat: 37.5145, lng: 127.1059 },
      '양천구': { lat: 37.5170, lng: 126.8664 },
      '영등포구': { lat: 37.5264, lng: 126.8962 },
      '용산구': { lat: 37.5384, lng: 126.9654 },
      '은평구': { lat: 37.6027, lng: 126.9291 },
      '종로구': { lat: 37.5735, lng: 126.9790 },
      '중구': { lat: 37.5636, lng: 126.9970 },
      '중랑구': { lat: 37.6063, lng: 127.0925 },
      // 부산 주요 구
      '부산진구': { lat: 35.1628, lng: 129.0533 },
      '해운대구': { lat: 35.1631, lng: 129.1635 },
      '영도구': { lat: 35.0913, lng: 129.0679 },
      '동래구': { lat: 35.2048, lng: 129.0837 },
      '남구': { lat: 35.1364, lng: 129.0842 },
      '사하구': { lat: 35.1043, lng: 128.9746 },
      // 경기 주요 시
      '수원': { lat: 37.2636, lng: 127.0286 },
      '성남': { lat: 37.4201, lng: 127.1262 },
      '안양': { lat: 37.3943, lng: 126.9568 },
      '용인': { lat: 37.2411, lng: 127.1776 },
      '평택': { lat: 36.9921, lng: 127.1129 },
      '의정부': { lat: 37.7382, lng: 127.0337 },
      '평창': { lat: 37.3704, lng: 128.3903 }
    };

    // 주소에서 시/도 찾기
    for (const [city, coords] of Object.entries(cityCoordinates)) {
      if (address.includes(city)) {
        // 구/군이 있는지 확인
        for (const [district, districtCoords] of Object.entries(districtCoordinates)) {
          if (address.includes(district)) {
            return { ...districtCoords, address };
          }
        }
        return { ...coords, address };
      }
    }

    // 구/군만 있는 경우
    for (const [district, coords] of Object.entries(districtCoordinates)) {
      if (address.includes(district)) {
        return { ...coords, address };
      }
    }

    // 매칭 없으면 서울 기본값
    return { lat: 37.5665, lng: 126.9780, address };
  }


  /**
   * 안전드림 긴급재난문자 API 폴링 (현재 비활성화)
   * Note: 안전드림 API에는 재난문자 엔드포인트가 별도로 제공되지 않습니다.
   */
  async pollEmergencyMessagesAPI() {
    // 안전드림에서는 실종아동 정보만 제공
    // 재난문자가 필요한 경우 행정안전부 API 사용 필요
    console.log('ℹ️  재난문자 API는 현재 사용 불가');
  }
}

module.exports = APIPoller;
