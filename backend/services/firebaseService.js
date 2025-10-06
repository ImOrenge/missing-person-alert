const { initializeApp } = require('firebase/app');
const { getDatabase, ref, update, get, query, orderByChild, limitToLast, remove } = require('firebase/database');
const { getAuth } = require('firebase/auth');
const { validateMissingPerson, normalizeMissingPerson, validateArchive } = require('../schemas/firebaseSchema');

class FirebaseService {
  constructor() {
    try {
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

      const app = initializeApp(firebaseConfig);
      this.db = getDatabase(app);
      this.auth = getAuth(app);
      console.log('✅ Firebase 초기화 완료');
    } catch (error) {
      console.error('❌ Firebase 초기화 실패:', error.message);
      this.db = null;
    }
  }

  /**
   * 실종자 데이터를 Firebase Realtime Database에 저장 (스키마 검증 및 중복 체크 포함)
   */
  async saveMissingPersons(persons) {
    if (!this.db) {
      console.log('⚠️  Firebase 비활성화 - 저장 생략');
      return { saved: 0, duplicates: 0, invalid: 0 };
    }

    try {
      // 1. Firebase에서 기존 데이터 조회
      const missingPersonsRef = ref(this.db, 'missingPersons');
      const snapshot = await get(missingPersonsRef);

      const existingData = snapshot.exists() ? snapshot.val() : {};
      const existingIds = new Set(Object.keys(existingData));
      const existingFingerprints = new Set(
        Object.values(existingData).map((p) => `${p.name}_${p.age}_${p.gender}`)
      );

      // 2. 스키마 검증, 정규화 및 중복 체크하여 신규 데이터만 필터링
      const updates = {};
      let duplicateCount = 0;
      let newCount = 0;
      let invalidCount = 0;

      persons.forEach(person => {
        // 2-1. 데이터 정규화 (기본값 설정 및 타입 변환)
        const normalized = normalizeMissingPerson(person);

        // 2-2. 스키마 검증
        const validation = validateMissingPerson(normalized);
        if (!validation.valid) {
          console.log(`  ❌ 스키마 검증 실패: ${person.name} (${person.id})`);
          validation.errors.forEach(error => console.log(`     - ${error}`));
          invalidCount++;
          return;
        }

        const fingerprint = `${normalized.name}_${normalized.age}_${normalized.gender}`;

        // 2-3. 중복 체크
        if (existingIds.has(normalized.id) || existingFingerprints.has(fingerprint)) {
          console.log(`  ⚠️ 중복 제외 (저장 생략): ${normalized.name} (${normalized.id})`);
          duplicateCount++;
        } else {
          // 신규 데이터만 저장
          updates[normalized.id] = normalized;
          newCount++;
        }
      });

      // 3. 신규 데이터만 Firebase에 저장
      if (Object.keys(updates).length > 0) {
        await update(missingPersonsRef, updates);
        console.log(`✅ Firebase에 ${newCount}건 저장 완료 (중복 ${duplicateCount}건 제외, 검증 실패 ${invalidCount}건)`);
      } else {
        console.log(`📭 저장할 신규 데이터 없음 (중복 ${duplicateCount}건, 검증 실패 ${invalidCount}건)`);
      }

      return { saved: newCount, duplicates: duplicateCount, invalid: invalidCount };
    } catch (error) {
      console.error('❌ Firebase 저장 실패:', error.message);
      return { saved: 0, duplicates: 0, invalid: 0 };
    }
  }

  /**
   * Firebase에서 실종자 데이터 조회
   */
  async getMissingPersons(limit = 100) {
    if (!this.db) {
      console.log('⚠️  Firebase 비활성화 - 조회 생략');
      return [];
    }

    try {
      const missingPersonsRef = ref(this.db, 'missingPersons');
      const missingPersonsQuery = query(
        missingPersonsRef,
        orderByChild('updatedAt'),
        limitToLast(limit)
      );

      const snapshot = await get(missingPersonsQuery);

      if (!snapshot.exists()) {
        return [];
      }

      const data = snapshot.val();
      const persons = Object.values(data);

      console.log(`✅ Firebase에서 ${persons.length}건 조회 완료`);
      return persons;
    } catch (error) {
      console.error('❌ Firebase 조회 실패:', error.message);
      return [];
    }
  }

  /**
   * 특정 실종자 데이터 조회
   */
  async getMissingPerson(id) {
    if (!this.db) {
      return null;
    }

    try {
      const personRef = ref(this.db, `missingPersons/${id}`);
      const snapshot = await get(personRef);

      if (!snapshot.exists()) {
        return null;
      }

      return snapshot.val();
    } catch (error) {
      console.error('❌ Firebase 조회 실패:', error.message);
      return null;
    }
  }

  /**
   * 특정 실종자 데이터 삭제
   */
  async deleteMissingPerson(id) {
    if (!this.db) {
      return false;
    }

    try {
      const personRef = ref(this.db, `missingPersons/${id}`);
      await remove(personRef);
      console.log(`✅ 실종자 삭제: ${id}`);
      return true;
    } catch (error) {
      console.error('❌ Firebase 삭제 실패:', error.message);
      return false;
    }
  }

  /**
   * 중복 데이터 제거 (이름, 나이, 성별이 같은 데이터 중 오래된 것 삭제)
   */
  async removeDuplicates() {
    if (!this.db) {
      console.log('⚠️  Firebase 비활성화 - 중복 제거 생략');
      return 0;
    }

    try {
      const missingPersonsRef = ref(this.db, 'missingPersons');
      const snapshot = await get(missingPersonsRef);

      if (!snapshot.exists()) {
        console.log('🗑️  데이터 없음 - 중복 제거 불필요');
        return 0;
      }

      const allData = snapshot.val();
      const fingerprintMap = new Map(); // fingerprint -> 최신 데이터
      const toDelete = {};
      let duplicateCount = 0;

      // 1. 모든 데이터를 순회하며 fingerprint별 최신 데이터만 유지
      Object.entries(allData).forEach(([id, person]) => {
        const fingerprint = `${person.name}_${person.age}_${person.gender}`;

        if (fingerprintMap.has(fingerprint)) {
          const existing = fingerprintMap.get(fingerprint);

          // 더 최신 데이터와 비교
          const existingTime = existing.data.updatedAt || 0;
          const currentTime = person.updatedAt || 0;

          if (currentTime > existingTime) {
            // 현재 데이터가 더 최신이면, 기존 데이터 삭제 예약
            toDelete[existing.id] = null;
            fingerprintMap.set(fingerprint, { id, data: person });
            duplicateCount++;
            console.log(`  🔄 중복 교체: ${person.name} - 오래된 ID ${existing.id} 삭제, 새 ID ${id} 유지`);
          } else {
            // 기존 데이터가 더 최신이면, 현재 데이터 삭제 예약
            toDelete[id] = null;
            duplicateCount++;
            console.log(`  🗑️  중복 삭제: ${person.name} - ID ${id} 삭제 (기존 ID ${existing.id} 유지)`);
          }
        } else {
          // 첫 번째 발견된 fingerprint
          fingerprintMap.set(fingerprint, { id, data: person });
        }
      });

      // 2. 중복 데이터 일괄 삭제
      if (duplicateCount > 0) {
        await update(missingPersonsRef, toDelete);
        console.log(`✅ ${duplicateCount}건의 중복 데이터 삭제 완료`);
      } else {
        console.log('✨ 중복 데이터 없음');
      }

      return duplicateCount;
    } catch (error) {
      console.error('❌ 중복 제거 실패:', error.message);
      return 0;
    }
  }

  /**
   * 오래된 실종자 데이터 삭제 (7일 이상 된 데이터)
   */
  async cleanupOldData() {
    if (!this.db) {
      return 0;
    }

    try {
      const missingPersonsRef = ref(this.db, 'missingPersons');
      const snapshot = await get(missingPersonsRef);

      if (!snapshot.exists()) {
        console.log('🗑️  삭제할 오래된 데이터 없음');
        return 0;
      }

      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const updates = {};
      let deletedCount = 0;

      snapshot.forEach((child) => {
        const data = child.val();
        if (data.updatedAt && data.updatedAt < sevenDaysAgo) {
          updates[child.key] = null;
          deletedCount++;
        }
      });

      if (deletedCount > 0) {
        await update(missingPersonsRef, updates);
        console.log(`🗑️  ${deletedCount}건의 오래된 데이터 삭제 완료`);
      } else {
        console.log('🗑️  삭제할 오래된 데이터 없음');
      }

      return deletedCount;
    } catch (error) {
      console.error('❌ 데이터 정리 실패:', error.message);
      return 0;
    }
  }

  /**
   * 24시간 지난 데이터를 아카이브에 백업하고 현재 목록 초기화 (한국시간 0시 기준)
   */
  async archiveAndReset() {
    if (!this.db) {
      console.log('⚠️  Firebase 비활성화 - 아카이브 생략');
      return { archived: 0, reset: false };
    }

    try {
      console.log('📦 24시간 데이터 아카이브 및 초기화 시작...');

      // 1. 현재 실종자 데이터 조회
      const missingPersonsRef = ref(this.db, 'missingPersons');
      const snapshot = await get(missingPersonsRef);

      if (!snapshot.exists()) {
        console.log('📭 아카이브할 데이터 없음');
        return { archived: 0, reset: false };
      }

      const currentData = snapshot.val();
      const personCount = Object.keys(currentData).length;

      // 2. 아카이브에 백업 (날짜별로 저장)
      const now = new Date();
      const kstOffset = 9 * 60; // 한국 시간 오프셋 (UTC+9)
      const kstDate = new Date(now.getTime() + kstOffset * 60 * 1000);
      const dateKey = kstDate.toISOString().split('T')[0]; // YYYY-MM-DD

      // 아카이브 데이터 생성 및 검증
      const archiveData = {
        timestamp: Date.now(),
        data: currentData,
        count: personCount
      };

      const validation = validateArchive(archiveData);
      if (!validation.valid) {
        console.log('❌ 아카이브 스키마 검증 실패:');
        validation.errors.forEach(error => console.log(`   - ${error}`));
        return { archived: 0, reset: false, error: '스키마 검증 실패' };
      }

      const archiveRef = ref(this.db, `archives/${dateKey}`);
      await update(archiveRef, archiveData);

      console.log(`✅ ${personCount}건을 아카이브(${dateKey})에 백업 완료`);

      // 3. 현재 실종자 목록 초기화
      await remove(missingPersonsRef);
      console.log('🗑️  실종자 목록 초기화 완료');

      return { archived: personCount, reset: true, archiveDate: dateKey };
    } catch (error) {
      console.error('❌ 아카이브 및 초기화 실패:', error.message);
      return { archived: 0, reset: false, error: error.message };
    }
  }

  /**
   * 아카이브된 데이터 조회
   */
  async getArchive(dateKey) {
    if (!this.db) {
      return null;
    }

    try {
      const archiveRef = ref(this.db, `archives/${dateKey}`);
      const snapshot = await get(archiveRef);

      if (!snapshot.exists()) {
        return null;
      }

      return snapshot.val();
    } catch (error) {
      console.error('❌ 아카이브 조회 실패:', error.message);
      return null;
    }
  }
}

module.exports = new FirebaseService();
