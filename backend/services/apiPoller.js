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
   * 안전드림 실종아동 데이터 폴링 (전체 페이지, 역순)
   * 웹사이트: https://www.safe182.go.kr/home/lcm/lcmMssList.do
   */
  async pollMissingPersonsAPI() {
    try {
      console.log('🔍 안전드림 실종아동 데이터 조회 시도...');

      // 1단계: 첫 페이지 조회하여 총 페이지 수 확인
      const firstPageResponse = await axios.get('https://www.safe182.go.kr/home/lcm/lcmMssList.do', {
        params: {
          rptDscd: '2',
          pageIndex: '1',
          pageUnit: '20'
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000
      });

      if (!firstPageResponse.data) {
        console.warn('⚠️  안전드림 응답 없음. 샘플 데이터를 사용합니다.');
        return this.generateSampleMissingPersons();
      }

      // HTML에서 총 페이지 수 파싱
      const totalPages = this.extractTotalPages(firstPageResponse.data);
      console.log(`📊 총 ${totalPages}개 페이지 발견`);

      // 2단계: 1페이지부터 3페이지까지 파싱
      let allItems = [];
      let totalNewCount = 0;
      let totalDuplicateCount = 0;

      const startPage = 1;
      const endPage = Math.min(3, totalPages);

      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        console.log(`\n📄 페이지 ${pageNum}/${totalPages} 파싱 중...`);

        const response = await axios.get('https://www.safe182.go.kr/home/lcm/lcmMssList.do', {
          params: {
            rptDscd: '2',
            pageIndex: pageNum.toString(),
            pageUnit: '20'
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 15000
        });

        if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE')) {
          const items = await this.parseHTMLResponse(response.data);

          if (items && items.length > 0) {
            console.log(`  ✅ ${items.length}건 파싱 완료`);
            allItems = allItems.concat(items);
          }
        }

        // API 부하 방지 (페이지 간 0.5초 대기)
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 3단계: 3달 이상 지난 데이터 필터링
      const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
      const filteredItems = allItems.filter(item => {
        try {
          const missingDate = new Date(item.missingDate).getTime();
          if (missingDate < threeMonthsAgo) {
            console.log(`  🗑️  3달 지난 데이터 폐기: ${item.name} (${item.missingDate})`);
            return false;
          }
          return true;
        } catch (error) {
          // 날짜 파싱 실패 시 유지
          return true;
        }
      });

      console.log(`\n📊 필터링 결과: ${allItems.length}건 → ${filteredItems.length}건 (${allItems.length - filteredItems.length}건 폐기)`);

      // 4단계: 실종일 기준으로 정렬 (최신순)
      filteredItems.sort((a, b) => {
        try {
          const dateA = new Date(a.missingDate).getTime();
          const dateB = new Date(b.missingDate).getTime();
          return dateB - dateA; // 내림차순 (최신순)
        } catch (error) {
          return 0;
        }
      });

      console.log(`📅 데이터 정렬 완료 (최신순)`);

      // 5단계: Firebase에 저장 (중복 체크 포함)
      if (filteredItems.length > 0) {
        const saveResult = await firebaseService.saveMissingPersons(filteredItems);
        totalNewCount = saveResult.saved;
        totalDuplicateCount = saveResult.duplicates;

        if (saveResult.saved > 0) {
          console.log(`💾 ${saveResult.saved}건 저장 (중복 ${saveResult.duplicates}건 제외)`);
        } else {
          console.log(`⏭️  모두 중복 (${saveResult.duplicates}건)`);
        }
      }

      // 6단계: 결과 요약 및 WebSocket 전송
      console.log(`\n📊 전체 파싱 완료: 신규 ${totalNewCount}건, 중복 ${totalDuplicateCount}건`);

      if (totalNewCount > 0) {
        // Firebase에서 최근 저장된 데이터 조회
        const recentlySaved = await firebaseService.getMissingPersons(totalNewCount);

        // WebSocket으로 신규 실종자만 전송
        if (recentlySaved.length > 0) {
          this.wsManager.broadcast('NEW_MISSING_PERSON', recentlySaved);
          console.log(`📡 ${recentlySaved.length}건 WebSocket 전송 완료`);
        }

        this.lastFetchTime = new Date();
      } else {
        console.log('📭 새로운 실종자 정보 없음');
      }

      return;

      // JSON 응답인 경우 처리
      const items = this.extractItems(response.data);

      if (!items || items.length === 0) {
        console.log('📭 새로운 실종자 정보 없음');
        return;
      }

      // 새로운 항목 필터링
      const newItems = items.filter(item => {
        const itemId = item.msspsnIdntfccd || item.num || `${item.nm}_${item.age}`;
        const itemDate = new Date(item.occrde || item.regDt || Date.now());

        return itemDate > this.lastFetchTime && !this.notifiedIds.has(itemId);
      });

      if (newItems.length > 0) {
        console.log(`🚨 새로운 실종자 ${newItems.length}건 발견`);

        // WebSocket으로 전송
        const transformedData = newItems.map(item => this.transformMissingPersonData(item));
        this.wsManager.broadcast('NEW_MISSING_PERSON', transformedData);

        // ID 캐시에 추가
        newItems.forEach(item => {
          const itemId = item.msspsnIdntfccd || item.num || `${item.nm}_${item.age}`;
          this.notifiedIds.add(itemId);
        });

        // 캐시 크기 제한
        this.limitCacheSize();
        this.lastFetchTime = new Date();
      }

    } catch (error) {
      console.error('❌ 실종자 데이터 조회 오류:', error.message);
      if (error.response) {
        console.error('응답 상태:', error.response.status);
      }
      // 오류 발생 시 샘플 데이터로 시스템 시연
      console.log('📝 샘플 데이터로 시스템을 시연합니다.');
      this.generateSampleMissingPersons();
    }
  }

  /**
   * HTML에서 총 페이지 수 추출
   */
  extractTotalPages(html) {
    try {
      const $ = cheerio.load(html);

      // 페이지네이션에서 마지막 페이지 번호 찾기
      // 일반적인 패턴: <a>1</a> <a>2</a> ... <a>마지막</a>
      const pageLinks = $('a[href*="pageIndex"]');

      let maxPage = 1;

      pageLinks.each((index, element) => {
        const href = $(element).attr('href') || '';
        const text = $(element).text().trim();

        // href에서 pageIndex 파라미터 추출
        const pageMatch = href.match(/pageIndex[=:](\d+)/);
        if (pageMatch) {
          const pageNum = parseInt(pageMatch[1]);
          if (pageNum > maxPage) {
            maxPage = pageNum;
          }
        }

        // 텍스트가 숫자인 경우도 체크
        const textNum = parseInt(text);
        if (!isNaN(textNum) && textNum > maxPage) {
          maxPage = textNum;
        }
      });

      // 페이지 정보가 없으면 기본값 1
      if (maxPage === 0) {
        maxPage = 1;
      }

      console.log(`  📄 페이지네이션 분석: 최대 페이지 = ${maxPage}`);
      return maxPage;

    } catch (error) {
      console.error('⚠️ 총 페이지 수 추출 실패:', error.message);
      return 1; // 실패 시 기본값
    }
  }

  /**
   * 안전드림 HTML 응답 파싱
   */
  async parseHTMLResponse(html) {
    try {
      const $ = cheerio.load(html);
      const items = [];

      console.log('📋 HTML 파싱 디버깅 시작...');

      // 실종자 정보가 있는 링크만 선택
      const links = $('a[href*="lcmMssGet.do"]');

      console.log(`  ✓ 실종자 링크 발견: ${links.length}개`);

      if (links.length === 0) {
        console.log('  ✗ 실종자 항목을 찾을 수 없습니다.');
        console.log('  HTML 샘플:', html.substring(0, 1000));
        return [];
      }

      // 중복 방지를 위한 fingerprint Set (이름+나이+성별)
      const processedFingerprints = new Set();

      // 각 링크의 부모 li 요소에서 데이터 추출
      links.each((index, element) => {
        try {
          const $link = $(element);
          const $item = $link.closest('li');

          // 링크에서 ID 추출
          const link = $link.attr('href') || '';
          const idMatch = link.match(/msspsnIdntfccd=(\d+)/);

          // 먼저 이름과 나이를 추출하여 fingerprint 생성
          const fullText = $item.text().trim();
          const nameAgeMatch = fullText.match(/([가-힣]{2,})\s*\((\d+)세\)/);

          if (!nameAgeMatch) {
            return; // 이름 정보 없으면 건너뛰기
          }

          const name = nameAgeMatch[1];
          const age = parseInt(nameAgeMatch[2]);

          // 성별 추출
          const genderMatch = fullText.match(/(남자|여자|남|여)/);
          const gender = genderMatch ? (genderMatch[1] === '남자' || genderMatch[1] === '남' ? 'M' : 'F') : 'U';

          // Fingerprint 생성 (이름+나이+성별)
          const fingerprint = `${name}_${age}_${gender}`;

          // 이미 처리한 동일인이면 건너뛰기
          if (processedFingerprints.has(fingerprint)) {
            console.log(`  ⏭️  중복 건너뜀: ${name} (${age}세, ${gender})`);
            return;
          }
          processedFingerprints.add(fingerprint);

          // ID는 URL에서 추출하거나, fingerprint를 해시하여 생성
          const id = idMatch ? idMatch[1] : `safe182_${Buffer.from(fingerprint).toString('base64').replace(/=/g, '')}`;

          console.log(`\n--- 항목 ${items.length + 1} ---`);
          console.log('링크:', link);
          console.log('ID:', id);
          console.log('이름:', name, '나이:', age, '성별:', gender);

          // 대상구분 추출 (예: "치매", "아동", "장애")
          const targetMatch = fullText.match(/(치매|아동|장애|지적장애)/);
          let type = 'missing_child';
          if (targetMatch) {
            const target = targetMatch[1];
            if (target.includes('치매')) type = 'dementia';
            else if (target.includes('장애')) type = 'disabled';
            else type = 'missing_child';
          }

          // 이미지 URL 추출 (여러 패턴 시도)
          let photo = null;
          const $img = $item.find('img');

          if ($img.length > 0) {
            const imgSrc = $img.attr('src');

            if (imgSrc && !imgSrc.includes('no_image') && !imgSrc.includes('noimage')) {
              // 절대 경로인 경우 그대로 사용
              if (imgSrc.startsWith('http')) {
                photo = imgSrc;
              }
              // 상대 경로인 경우 베이스 URL 추가
              else if (imgSrc.startsWith('/')) {
                photo = `https://www.safe182.go.kr${imgSrc}`;
              }
              // 기타 경로
              else {
                photo = `https://www.safe182.go.kr/${imgSrc}`;
              }

              console.log('이미지 URL:', photo);
            } else {
              console.log('이미지 없음 또는 no_image 플레이스홀더');
            }
          } else {
            console.log('img 태그 없음');
          }

          // 현재나이 추출
          const currentAgeMatch = fullText.match(/현재나이\s*:?\s*(\d+)세/);
          const currentAge = currentAgeMatch ? parseInt(currentAgeMatch[1]) : age;

          // 실종일 추출 (여러 패턴 시도)
          let missingDate = new Date().toISOString();
          const datePatterns = [
            /실종일\s*:?\s*([0-9.\-/]+)/,
            /실종일시\s*:?\s*([0-9.\-/\s:]+)/,
            /발생일\s*:?\s*([0-9.\-/]+)/
          ];

          for (const pattern of datePatterns) {
            const match = fullText.match(pattern);
            if (match) {
              missingDate = match[1].trim();
              break;
            }
          }

          // 실종장소 추출 (여러 패턴 시도)
          let address = '주소 미상';
          const locationPatterns = [
            /실종장소\s*:?\s*([^\n가-힣]*[가-힣][^\n]+?)(?=\s*옷차림|$)/,
            /발생장소\s*:?\s*([^\n]+)/,
            /장소\s*:?\s*([^\n]+)/,
            /실종장소\s*:?\s*(.+?)(?=옷차림|특징|$)/
          ];

          for (const pattern of locationPatterns) {
            const match = fullText.match(pattern);
            if (match) {
              address = match[1].trim();
              // 불필요한 공백 제거
              address = address.replace(/\s+/g, ' ').trim();
              if (address && address.length > 2 && !address.includes('미상')) {
                break;
              }
            }
          }

          // 옷차림 추출
          const clothingMatch = fullText.match(/옷차림\s*:?\s*([^\n]+)/);
          const clothes = clothingMatch ? clothingMatch[1].trim() : null;

          console.log('실종장소:', address);
          console.log('실종일:', missingDate);

          // 위치 정보를 Promise로 저장 (나중에 geocoding)
          const itemData = {
            id,
            name,
            age: currentAge || age,
            gender,
            address,
            photo,
            description: clothes || '특이사항 없음',
            missingDate,
            type,
            status: 'active',
            clothes
          };

          items.push(itemData);

          console.log(`  ✓ 파싱 완료: ${name} (${gender}, ${currentAge || age}세)`);

        } catch (err) {
          console.error('  ✗ 항목 파싱 오류:', err.message);
        }
      });

      console.log(`\n총 ${items.length}개 항목 파싱 완료`);

      // 모든 항목에 대해 geocoding 수행
      const itemsWithLocation = await this.addGeocodingToItems(items);

      console.log(`✅ Geocoding 완료: ${itemsWithLocation.length}개 항목\n`);
      return itemsWithLocation;

    } catch (error) {
      console.error('❌ HTML 파싱 오류:', error.message);
      console.error(error.stack);
      return [];
    }
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
   * 모든 항목에 geocoding 추가
   */
  async addGeocodingToItems(items) {
    const results = [];

    for (const item of items) {
      try {
        // 한국 도시 좌표 매핑 사용 (빠르고 안정적)
        const location = await this.geocodeAddress(item.address);

        results.push({
          ...item,
          location
        });

      } catch (error) {
        console.error(`  ⚠️ ${item.name} geocoding 실패:`, error.message);
        // 실패해도 기본 위치로 추가
        results.push({
          ...item,
          location: { lat: 37.5665, lng: 126.9780, address: item.address }
        });
      }
    }

    return results;
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

  /**
   * API 응답에서 items 배열 추출 (다양한 응답 구조 지원)
   */
  extractItems(data) {
    if (Array.isArray(data)) return data;
    if (data.response?.body?.items?.item) return Array.isArray(data.response.body.items.item)
      ? data.response.body.items.item
      : [data.response.body.items.item];
    if (data.body?.items) return Array.isArray(data.body.items)
      ? data.body.items
      : [data.body.items];
    if (data.items) return Array.isArray(data.items)
      ? data.items
      : [data.items];
    return [];
  }

  /**
   * 안전드림 실종자 데이터 변환
   * API 응답 필드: nm(이름), age(나이), sexdstnDscd(성별), occrAdres(발생주소),
   * writngTrgetDscd(대상구분), etcSpfeatr(특징), occrde(발생일시), tknphotoFile(사진)
   */
  transformMissingPersonData(apiData) {
    return {
      id: apiData.num || apiData.esntlId || `missing_${Date.now()}_${Math.random()}`,
      name: apiData.nm || '미상',
      age: parseInt(apiData.age) || parseInt(apiData.ageNow) || 0,
      gender: this.parseGender(apiData.sexdstnDscd),
      location: {
        lat: parseFloat(apiData.lat) || 37.5665,
        lng: parseFloat(apiData.lng) || 126.9780,
        address: apiData.occrAdres || apiData.occrPlace || '주소 미상'
      },
      photo: apiData.tknphotoFile || apiData.photoFile || null,
      description: apiData.etcSpfeatr || apiData.drssChartr || '특이사항 없음',
      missingDate: apiData.occrde || apiData.regDt || new Date().toISOString(),
      type: this.getTypeFromTarget(apiData.writngTrgetDscd),
      status: 'active',
      height: apiData.height || null,
      weight: apiData.weight || null,
      clothes: apiData.drssChartr || null
    };
  }

  /**
   * 성별 코드 변환
   */
  parseGender(sexCode) {
    if (!sexCode) return 'U';
    const code = String(sexCode).toLowerCase();
    if (code.includes('남') || code === 'm' || code === '1') return 'M';
    if (code.includes('여') || code === 'f' || code === '2') return 'F';
    return 'U';
  }

  /**
   * 대상 구분을 타입으로 변환
   */
  getTypeFromTarget(target) {
    if (!target) return 'missing_child';

    const targetStr = String(target);
    if (targetStr.includes('치매') || targetStr.includes('노인')) return 'dementia';
    if (targetStr.includes('장애')) return 'disabled';
    return 'missing_child';
  }

  /**
   * 재난문자 데이터 변환
   */
  transformEmergencyMessageData(apiData) {
    return {
      id: apiData.msgId || apiData.id || `emergency_${Date.now()}`,
      region: apiData.regionName || apiData.locationName || '전국',
      regionCode: apiData.locationId || apiData.regionCode || '000',
      sendTime: apiData.sendDateTime || apiData.createDate || new Date().toISOString(),
      content: apiData.msgContents || apiData.msg || '긴급재난문자',
      disasterType: apiData.disasterType || apiData.dstSeNm || '기타'
    };
  }



  /**
   * 샘플 데이터 생성 (테스트용 - 안전드림 API 형식)
   */
  generateSampleMissingPersons() {
    const timestamp = Date.now();
    const samples = [
      {
        id: `sample_${timestamp}_1`,
        name: '홍길동',
        age: 8,
        gender: 'M',
        location: {
          lat: 37.5665,
          lng: 126.9780,
          address: '서울특별시 중구'
        },
        photo: null,
        description: '파란색 티셔츠, 검은색 반바지 착용',
        missingDate: new Date().toISOString(),
        type: 'missing_child',
        status: 'active',
        clothes: '파란색 티셔츠, 검은색 반바지'
      },
      {
        id: `sample_${timestamp}_2`,
        name: '김영희',
        age: 75,
        gender: 'F',
        location: {
          lat: 37.5172,
          lng: 127.0473,
          address: '서울특별시 강남구'
        },
        photo: null,
        description: '흰색 블라우스, 검은색 바지 착용',
        missingDate: new Date().toISOString(),
        type: 'dementia',
        status: 'active',
        clothes: '흰색 블라우스, 검은색 바지'
      }
    ];

    // 중복 필터링 없이 바로 전송 (테스트용)
    this.wsManager.broadcast('NEW_MISSING_PERSON', samples);

    console.log(`📝 샘플 데이터 ${samples.length}건 전송됨 (ID: sample_${timestamp}_*)`);
  }
}

module.exports = APIPoller;
