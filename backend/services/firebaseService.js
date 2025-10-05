const { initializeApp } = require('firebase/app');
const { getDatabase, ref, update, get, query, orderByChild, limitToLast } = require('firebase/database');

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
      console.log('✅ Firebase 초기화 완료');
    } catch (error) {
      console.error('❌ Firebase 초기화 실패:', error.message);
      this.db = null;
    }
  }

  /**
   * 실종자 데이터를 Firebase Realtime Database에 저장
   */
  async saveMissingPersons(persons) {
    if (!this.db) {
      console.log('⚠️  Firebase 비활성화 - 저장 생략');
      return false;
    }

    try {
      const missingPersonsRef = ref(this.db, 'missingPersons');
      const updates = {};

      persons.forEach(person => {
        // ID를 키로 사용하여 중복 방지
        updates[person.id] = {
          ...person,
          updatedAt: Date.now()
        };
      });

      await update(missingPersonsRef, updates);
      console.log(`✅ Firebase에 ${persons.length}건 저장 완료`);
      return true;
    } catch (error) {
      console.error('❌ Firebase 저장 실패:', error.message);
      return false;
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
}

module.exports = new FirebaseService();
