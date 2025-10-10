import axios from 'axios';
import { MissingPerson } from '../types';

/**
 * 백엔드 프록시를 통해 안전드림 API에서 실종자 데이터를 가져옵니다
 * (CORS 문제 해결을 위해 백엔드를 경유)
 */
export async function fetchMissingPersons(): Promise<MissingPerson[]> {
  try {
    console.log('🌐 안전드림 API 호출 시작...');

    // 백엔드 프록시를 통해 API 호출
    const response = await axios.get('/api/safe182/missing-persons');

    // API 인증 실패 또는 오류 처리
    if (response.data.error || response.data.result !== '00') {
      console.warn('⚠️ API 응답 오류:', response.data.message || response.data.msg);
      return [];
    }

    if (!response.data || !response.data.list) {
      console.warn('⚠️ API 응답에 데이터가 없습니다');
      return [];
    }

    const apiData = response.data.list;
    console.log(`📦 API에서 ${apiData.length}건 수신`);

    // API 데이터를 MissingPerson 형식으로 변환
    const persons: MissingPerson[] = apiData.map((item: any) => {
      const age = parseInt(item.ageNow) || parseInt(item.age) || 0;

      // 대상 구분 코드로 타입 결정
      let type: MissingPerson['type'] = 'runaway';
      switch (item.writngTrgetDscd) {
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

      // 실종일시 파싱
      let missingDate = item.occrde || item.disappearanceDate || '';
      if (missingDate && missingDate.length === 8) {
        const year = missingDate.substring(0, 4);
        const month = missingDate.substring(4, 6);
        const day = missingDate.substring(6, 8);
        missingDate = `${year}-${month}-${day}`;
      }

      // 주소에서 좌표 추출 (간단한 지역별 좌표 매핑)
      const address = item.occrAdres || item.address || '대한민국';
      const location = getLocationFromAddress(address);

      // 이미지 URL 생성 (백엔드 프록시를 통해)
      const photoUrl = item.msspsnIdntfccd
        ? `/api/safe182/photo/${item.msspsnIdntfccd}`
        : undefined;

      return {
        id: item.rnum || `api-${Date.now()}-${Math.random()}`,
        name: item.nm || item.name || '이름 미상',
        age,
        gender: item.sex === '1' ? 'M' : item.sex === '2' ? 'F' : 'U',
        location: {
          lat: location.lat,
          lng: location.lng,
          address
        },
        photo: photoUrl,
        description: [
          item.etcSpfeatr,
          item.clothes,
          item.feature
        ].filter(Boolean).join(' / ') || '특징 없음',
        missingDate,
        type,
        status: 'active',
        height: parseInt(item.height) || undefined,
        weight: parseInt(item.weight) || undefined,
        clothes: item.clothes || undefined,
        updatedAt: Date.now(),
        source: 'api',
        bodyType: item.bdwgh,
        faceShape: item.faceshape,
        hairShape: item.hairstyle,
        hairColor: item.haircolor,
        apiTargetCode: item.writngTrgetDscd
      };
    });

    console.log(`✅ ${persons.length}건 변환 완료`);
    return persons;

  } catch (error) {
    console.error('❌ API 호출 실패:', error);
    return [];
  }
}

/**
 * 주소에서 대략적인 좌표를 반환 (간단한 매핑)
 */
function getLocationFromAddress(address: string): { lat: number; lng: number } {
  const regionMap: { [key: string]: { lat: number; lng: number } } = {
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
    '충북': { lat: 36.8, lng: 127.7 },
    '충남': { lat: 36.5184, lng: 126.8000 },
    '전북': { lat: 35.7175, lng: 127.1530 },
    '전남': { lat: 34.8679, lng: 126.9910 },
    '경북': { lat: 36.4919, lng: 128.8889 },
    '경남': { lat: 35.4606, lng: 128.2132 },
    '제주': { lat: 33.4890, lng: 126.4983 }
  };

  // 주소에서 지역명 찾기
  for (const [region, coords] of Object.entries(regionMap)) {
    if (address.includes(region)) {
      // 약간의 랜덤성 추가 (같은 지역 내에서 마커가 겹치지 않도록)
      return {
        lat: coords.lat + (Math.random() - 0.5) * 0.1,
        lng: coords.lng + (Math.random() - 0.5) * 0.1
      };
    }
  }

  // 기본값: 서울
  return {
    lat: 37.5665 + (Math.random() - 0.5) * 0.1,
    lng: 126.9780 + (Math.random() - 0.5) * 0.1
  };
}
