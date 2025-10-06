const { initializeApp } = require('firebase/app');
const { getDatabase, ref, update, get } = require('firebase/database');

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyCt5K-CIK7AUc6N1bbP4sK5NmJ29g8TG9M",
  authDomain: "missing-person-alram.firebaseapp.com",
  projectId: "missing-person-alram",
  storageBucket: "missing-person-alram.firebasestorage.app",
  messagingSenderId: "558387804013",
  appId: "1:558387804013:web:1d85bc6e03e17e80a5cc64",
  measurementId: "G-DNE8F851CX",
  databaseURL: "https://missing-person-alram-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/**
 * 한국 주요 도시 좌표 반환
 */
function getKoreanCityCoordinates(address) {
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
 * Firebase의 모든 실종자 데이터의 좌표를 재계산
 */
async function fixAllLocations() {
  try {
    console.log('🔧 Firebase 실종자 데이터 좌표 수정 시작...\n');

    // 모든 실종자 데이터 가져오기
    const missingPersonsRef = ref(db, 'missingPersons');
    const snapshot = await get(missingPersonsRef);

    if (!snapshot.exists()) {
      console.log('📭 데이터 없음');
      process.exit(0);
    }

    const allData = snapshot.val();
    const updates = {};
    let fixedCount = 0;
    let unchangedCount = 0;

    console.log(`📊 총 ${Object.keys(allData).length}건 검사 중...\n`);

    // 각 실종자 데이터의 좌표 재계산
    for (const [id, person] of Object.entries(allData)) {
      const address = person.location?.address || '주소 미상';
      const oldLocation = person.location;

      // 새 좌표 계산
      const newLocation = getKoreanCityCoordinates(address);

      // 좌표가 변경되었는지 확인 (소수점 4자리까지 비교)
      const latChanged = Math.abs(oldLocation.lat - newLocation.lat) > 0.0001;
      const lngChanged = Math.abs(oldLocation.lng - newLocation.lng) > 0.0001;

      if (latChanged || lngChanged) {
        updates[`${id}/location`] = newLocation;
        fixedCount++;
        console.log(`✅ ${person.name} (${address})`);
        console.log(`   변경: (${oldLocation.lat}, ${oldLocation.lng}) → (${newLocation.lat}, ${newLocation.lng})`);
      } else {
        unchangedCount++;
      }
    }

    // Firebase 업데이트
    if (Object.keys(updates).length > 0) {
      console.log(`\n💾 Firebase에 ${fixedCount}건 업데이트 중...`);
      await update(missingPersonsRef, updates);
      console.log(`✅ ${fixedCount}건 수정 완료, ${unchangedCount}건 변경 없음`);
    } else {
      console.log('\n📭 수정할 데이터 없음');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ 오류:', error.message);
    process.exit(1);
  }
}

// 스크립트 실행
fixAllLocations();
