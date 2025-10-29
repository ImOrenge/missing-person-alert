const axios = require('axios');
const cheerio = require('cheerio');
const NodeGeocoder = require('node-geocoder');
const firebaseService = require('./firebaseService');
const storageService = require('./storageService');

class APIPoller {
  constructor() {
    this.lastFetchTime = new Date();

    // Geocoder 설정 (Google Maps API 또는 무료 대안 사용)
    this.geocoder = NodeGeocoder({
      provider: 'openstreetmap', // 무료 서비스
      formatter: null,
      language: 'ko'
    });

    // 주소-좌표 캐시 (반복 조회 방지)
    this.locationCache = new Map();
  }

  /**
   * 안전드림 182 API를 통한 실종자 데이터 조회
   * API 엔드포인트: https://www.safe182.go.kr/api/lcm/findChildList.do
   */
  async pollMissingPersonsAPI() {
    try {
      console.log('🔍 안전드림 182 API 호출 시작...');

      // API 인증 정보
      const esntlId = process.env.SAFE182_ESNTL_ID;
      const authKey = process.env.SAFE182_AUTH_KEY;

      if (!esntlId || !authKey) {
        console.error('❌ 안전드림 API 인증정보 누락');
        return;
      }

      console.log(`🔑 인증정보: esntlId=${esntlId}, authKey=${authKey.substring(0, 4)}****`);

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

        // 대상 구분 추가
        // 010: 아동, 020: 일반가출, 040: 시설보호자
        // 060: 지적장애, 061: 18세미만 지적장애, 062: 18세이상 지적장애
        // 070: 치매, 080: 신원불상
        params.append('writngTrgetDscds', '010'); // 아동
        params.append('writngTrgetDscds', '020'); // 일반가출
        params.append('writngTrgetDscds', '040'); // 시설보호자
        params.append('writngTrgetDscds', '060'); // 지적장애
        params.append('writngTrgetDscds', '061'); // 18세미만 지적장애
        params.append('writngTrgetDscds', '062'); // 18세이상 지적장애
        params.append('writngTrgetDscds', '070'); // 치매
        params.append('writngTrgetDscds', '080'); // 신원불상

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
        const { created = 0, updated = 0 } = await firebaseService.saveMissingPersons(transformedItems);
        const totalChanges = created + updated;

        if (totalChanges > 0) {
          console.log(`💾 신규 ${created}건, 갱신 ${updated}건 처리`);
          console.log(`✅ Firestore 실시간 리스너를 통해 프론트엔드에 자동 전파됩니다`);
          this.lastFetchTime = new Date();
        } else {
          console.log('⏭️  저장할 신규/갱신 데이터 없음');
        }
      }

      // 자동 발견 처리: API에서 설정된 기간 이상 나타나지 않은 실종자 처리
      try {
        const autoMarkFoundDays = parseInt(process.env.AUTO_MARK_FOUND_DAYS) || 7;
        const { markedAsFound } = await firebaseService.markStaleMissingPersonsAsFound(autoMarkFoundDays);
        if (markedAsFound > 0) {
          console.log(`✅ ${markedAsFound}건 자동 발견 처리 완료 (Firestore 실시간 업데이트)`);
        }
      } catch (error) {
        console.error('⚠️ 자동 발견 처리 실패:', error.message);
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

    // 대상 구분을 타입으로 변환 (세부 분류)
    const age = parseInt(apiData.ageNow) || parseInt(apiData.age) || 0;
    let type = 'runaway'; // 기본값: 가출인

    switch (apiData.writngTrgetDscd) {
      case '010': // 아동
        type = 'missing_child';
        break;
      case '020': // 일반가출
        type = 'runaway';
        break;
      case '040': // 시설보호자
        type = 'facility';
        break;
      case '060': // 지적장애
      case '061': // 18세미만 지적장애
      case '062': // 18세이상 지적장애
        type = 'disabled';
        break;
      case '070': // 치매
        type = 'dementia';
        break;
      case '080': // 신원불상
        type = 'unknown';
        break;
      default:
        type = age < 18 ? 'missing_child' : 'runaway';
    }

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

    const photos = await storageService.ensurePhotos(id, photo ? [photo] : []);
    const primaryPhoto = photos.length > 0 ? photos[0] : photo || undefined;

    return {
      id,
      name: apiData.nm || '미상',
      age: age,
      gender,
      location,
      photo: primaryPhoto,
      photos,
      description: apiData.alldressingDscd || '특이사항 없음',
      missingDate,
      type,
      status: 'active',
      source: 'api', // API 데이터 표시
      lastSeenInAPI: Date.now(), // API에서 확인된 현재 시간
      height: apiData.height || null,
      weight: apiData.bdwgh || null,
      clothes: apiData.alldressingDscd || null,
      // 추가 상세 정보
      bodyType: apiData.frmDscd || null,
      faceShape: apiData.faceshpeDscd || null,
      hairShape: apiData.hairshpeDscd || null,
      hairColor: apiData.haircolrDscd || null,
      // API 원본 대상 구분 코드 (디버깅/확인용)
      apiTargetCode: apiData.writngTrgetDscd || null
    };
  }


  /**
   * 주소를 좌표로 변환 (Geocoding)
   * 한국 주요 도시 좌표 사용
   */
  async geocodeAddress(address) {
    try {
      // 캐시 확인
      const raw = typeof address === 'string' ? address : '';
      const normalizedInput = raw.replace(/\s+/g, ' ').trim();
      const cacheKey = normalizedInput || raw;

      if (this.locationCache.has(cacheKey)) {
        return this.locationCache.get(cacheKey);
      }

      // 주소가 너무 짧거나 미상인 경우 기본값 반환
      if (!normalizedInput || normalizedInput === '주소 미상' || normalizedInput.length < 3) {
        return { lat: 37.5665, lng: 126.9780, address: '서울특별시' };
      }

      // 1차: Google Geocoding API (정확 좌표)
      const googleLocation = await this.geocodeUsingGoogle(normalizedInput);
      if (googleLocation) {
        this.locationCache.set(cacheKey, googleLocation);
        return googleLocation;
      }

      // 2차: OSM 기반 지오코딩 시도
      const geocodeResults = await this.geocoder.geocode(normalizedInput);

      if (Array.isArray(geocodeResults) && geocodeResults.length > 0) {
        const primary = geocodeResults[0];
        if (primary && typeof primary.latitude === 'number' && typeof primary.longitude === 'number') {
          const preciseLocation = {
            lat: primary.latitude,
            lng: primary.longitude,
            address: primary.formattedAddress || normalizedInput
          };
          this.locationCache.set(cacheKey, preciseLocation);
          return preciseLocation;
        }
      }

      // 3차: 주소 구성요소 축약 (구/군, 시/도만 사용)
      const simplifiedAddress = this.extractAdministrativeArea(normalizedInput);
      if (simplifiedAddress && simplifiedAddress !== normalizedInput) {
        const simplifiedResults = await this.geocoder.geocode(simplifiedAddress);
        if (Array.isArray(simplifiedResults) && simplifiedResults.length > 0) {
          const primary = simplifiedResults[0];
          if (primary && typeof primary.latitude === 'number' && typeof primary.longitude === 'number') {
            const simplifiedLocation = {
              lat: primary.latitude,
              lng: primary.longitude,
              address: primary.formattedAddress || simplifiedAddress
            };
            this.locationCache.set(cacheKey, simplifiedLocation);
            return simplifiedLocation;
          }
        }
      }

      // 4차: 한국 주요 도시/지역 좌표 매핑 (fallback)
      const fallbackLocation = this.getKoreanCityCoordinates(normalizedInput);
      this.locationCache.set(cacheKey, fallbackLocation);
      return fallbackLocation;

    } catch (error) {
      console.error(`  ⚠️ Geocoding 오류 (${address}):`, error.message);
      return { lat: 37.5665, lng: 126.9780, address: address };
    }
  }

  async geocodeUsingGoogle(address) {
    const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
    if (!apiKey) {
      return null;
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address,
          key: apiKey,
          region: 'kr',
          language: 'ko'
        },
        timeout: 10000
      });

      const data = response.data;
      if (!data || data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
        if (data && data.error_message) {
          console.warn(`  ⚠️ Google Geocoding 오류 (${address}): ${data.error_message}`);
        }
        return null;
      }

      const bestMatch = data.results[0];
      if (!bestMatch.geometry || !bestMatch.geometry.location) {
        return null;
      }

      const preciseLocation = {
        lat: bestMatch.geometry.location.lat,
        lng: bestMatch.geometry.location.lng,
        address: bestMatch.formatted_address || address
      };

      return preciseLocation;
    } catch (error) {
      console.warn(`  ⚠️ Google Geocoding 요청 실패 (${address}):`, error.message);
      return null;
    }
  }

  /**
   * 주소에서 시/도 + 구/군 등 행정구역 텍스트만 추출
   */
  extractAdministrativeArea(address) {
    if (!address) {
      return null;
    }

    const match = address.match(/([가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도))?\s*([가-힣]+(?:시|군|구))/);
    if (match) {
      const [, siDo, siGunGu] = match;
      return [siDo, siGunGu].filter(Boolean).join(' ');
    }

    return null;
  }

  /**
   * 한국 주요 도시 좌표 반환
   */
  getKoreanCityCoordinates(address) {
    // 시/도 단위 좌표 매핑 (긴 형식 우선 매칭)
    const cityCoordinates = {
      '서울특별시': { lat: 37.5665, lng: 126.9780 },
      '서울': { lat: 37.5665, lng: 126.9780 },
      '부산광역시': { lat: 35.1796, lng: 129.0756 },
      '부산': { lat: 35.1796, lng: 129.0756 },
      '대구광역시': { lat: 35.8714, lng: 128.6014 },
      '대구': { lat: 35.8714, lng: 128.6014 },
      '인천광역시': { lat: 37.4563, lng: 126.7052 },
      '인천': { lat: 37.4563, lng: 126.7052 },
      '광주광역시': { lat: 35.1595, lng: 126.8526 },
      '광주': { lat: 35.1595, lng: 126.8526 },
      '대전광역시': { lat: 36.3504, lng: 127.3845 },
      '대전': { lat: 36.3504, lng: 127.3845 },
      '울산광역시': { lat: 35.5384, lng: 129.3114 },
      '울산': { lat: 35.5384, lng: 129.3114 },
      '세종특별자치시': { lat: 36.4800, lng: 127.2890 },
      '세종': { lat: 36.4800, lng: 127.2890 },
      '경기도': { lat: 37.4138, lng: 127.5183 },
      '경기': { lat: 37.4138, lng: 127.5183 },
      '강원특별자치도': { lat: 37.8228, lng: 128.1555 },
      '강원도': { lat: 37.8228, lng: 128.1555 },
      '강원': { lat: 37.8228, lng: 128.1555 },
      '충청북도': { lat: 36.8000, lng: 127.7000 },
      '충북': { lat: 36.8000, lng: 127.7000 },
      '충청남도': { lat: 36.5184, lng: 126.8000 },
      '충남': { lat: 36.5184, lng: 126.8000 },
      '전북특별자치도': { lat: 35.7175, lng: 127.1530 },
      '전라북도': { lat: 35.7175, lng: 127.1530 },
      '전북': { lat: 35.7175, lng: 127.1530 },
      '전라남도': { lat: 34.8679, lng: 126.9910 },
      '전남': { lat: 34.8679, lng: 126.9910 },
      '경상북도': { lat: 36.4919, lng: 128.8889 },
      '경북': { lat: 36.4919, lng: 128.8889 },
      '경상남도': { lat: 35.4606, lng: 128.2132 },
      '경남': { lat: 35.4606, lng: 128.2132 },
      '제주특별자치도': { lat: 33.4890, lng: 126.4983 },
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
      '평창': { lat: 37.3704, lng: 128.3903 },
      // 경상북도 주요 시/군
      '포항': { lat: 36.0190, lng: 129.3435 },
      '경주': { lat: 35.8562, lng: 129.2247 },
      '안동': { lat: 36.5684, lng: 128.7294 },
      '구미': { lat: 36.1196, lng: 128.3446 },
      '영주': { lat: 36.8056, lng: 128.6239 },
      '영천': { lat: 35.9733, lng: 128.9386 },
      '상주': { lat: 36.4109, lng: 128.1590 },
      '문경': { lat: 36.5865, lng: 128.1867 },
      '김천': { lat: 36.1399, lng: 128.1137 },
      '칠곡군': { lat: 35.9956, lng: 128.4019 },
      // 경상남도 주요 시/군
      '창원': { lat: 35.2281, lng: 128.6811 },
      '진주': { lat: 35.1800, lng: 128.1076 },
      '통영': { lat: 34.8544, lng: 128.4331 },
      '사천': { lat: 34.9419, lng: 128.0642 },
      '김해': { lat: 35.2285, lng: 128.8894 },
      '밀양': { lat: 35.5038, lng: 128.7467 },
      '거제': { lat: 34.8806, lng: 128.6211 },
      '양산': { lat: 35.3350, lng: 129.0375 },
      '함안군': { lat: 35.2722, lng: 128.4061 },
      '창녕군': { lat: 35.5444, lng: 128.4922 }
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
