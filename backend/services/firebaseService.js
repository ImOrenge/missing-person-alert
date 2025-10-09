const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get, push, update, remove, query, orderByChild, equalTo } = require('firebase/database');
const { getAuth } = require('firebase/auth');

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
      console.log('✅ Firebase 초기화 완료 (제보 서비스)');
    } catch (error) {
      console.error('❌ Firebase 초기화 실패:', error.message);
      this.db = null;
    }
  }

  /**
   * 실종자 제보 저장
   */
  async saveReport(reportData) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      const reportsRef = ref(this.db, 'reports');
      const newReportRef = push(reportsRef);

      const report = {
        ...reportData,
        id: newReportRef.key,
        createdAt: Date.now(),
        status: 'pending'
      };

      await update(newReportRef, report);
      console.log(`✅ 제보 저장 완료: ${newReportRef.key}`);

      return {
        success: true,
        reportId: newReportRef.key,
        report
      };
    } catch (error) {
      console.error('❌ 제보 저장 실패:', error);
      throw error;
    }
  }

  /**
   * 사용자별 제보 목록 조회
   */
  async getUserReports(userId) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      const reportsRef = ref(this.db, 'reports');
      const userReportsQuery = query(
        reportsRef,
        orderByChild('userId'),
        equalTo(userId)
      );

      const snapshot = await get(userReportsQuery);

      if (!snapshot.exists()) {
        return [];
      }

      const reports = [];
      snapshot.forEach((child) => {
        reports.push({
          id: child.key,
          ...child.val()
        });
      });

      // 최신순 정렬
      reports.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      return reports;
    } catch (error) {
      console.error('❌ 제보 목록 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 제보 상세 조회
   */
  async getReport(reportId) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      const reportRef = ref(this.db, `reports/${reportId}`);
      const snapshot = await get(reportRef);

      if (!snapshot.exists()) {
        return null;
      }

      return {
        id: reportId,
        ...snapshot.val()
      };
    } catch (error) {
      console.error('❌ 제보 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 제보 삭제
   */
  async deleteReport(reportId, userId) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      // 제보 소유자 확인
      const report = await this.getReport(reportId);

      if (!report) {
        throw new Error('제보를 찾을 수 없습니다');
      }

      if (report.userId !== userId) {
        throw new Error('삭제 권한이 없습니다');
      }

      const reportRef = ref(this.db, `reports/${reportId}`);
      await remove(reportRef);

      console.log(`✅ 제보 삭제 완료: ${reportId}`);

      return { success: true };
    } catch (error) {
      console.error('❌ 제보 삭제 실패:', error);
      throw error;
    }
  }

  /**
   * 제보 업데이트
   */
  async updateReport(reportId, userId, updates) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      // 제보 소유자 확인
      const report = await this.getReport(reportId);

      if (!report) {
        throw new Error('제보를 찾을 수 없습니다');
      }

      if (report.userId !== userId) {
        throw new Error('수정 권한이 없습니다');
      }

      const reportRef = ref(this.db, `reports/${reportId}`);
      await update(reportRef, {
        ...updates,
        updatedAt: Date.now()
      });

      console.log(`✅ 제보 업데이트 완료: ${reportId}`);

      return { success: true };
    } catch (error) {
      console.error('❌ 제보 업데이트 실패:', error);
      throw error;
    }
  }

  /**
   * 실종자 정보 저장 (API 데이터 또는 사용자 제보)
   */
  async saveMissingPersons(persons) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      const missingPersonsRef = ref(this.db, 'missingPersons');
      let saved = 0;
      let duplicates = 0;

      for (const person of persons) {
        try {
          // ID 중복 확인
          const personRef = ref(this.db, `missingPersons/${person.id}`);
          const snapshot = await get(personRef);

          if (snapshot.exists()) {
            duplicates++;
            continue;
          }

          // updatedAt 추가
          const personData = {
            ...person,
            updatedAt: Date.now()
          };

          await update(personRef, personData);
          saved++;
        } catch (error) {
          console.error(`❌ 실종자 저장 실패 (${person.id}):`, error.message);
        }
      }

      return { saved, duplicates };
    } catch (error) {
      console.error('❌ 실종자 정보 저장 실패:', error);
      throw error;
    }
  }

  /**
   * 실종자 정보 조회 (최신순)
   */
  async getMissingPersons(limit = 100) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      const missingPersonsRef = ref(this.db, 'missingPersons');
      const snapshot = await get(missingPersonsRef);

      if (!snapshot.exists()) {
        return [];
      }

      const persons = [];
      snapshot.forEach((child) => {
        persons.push(child.val());
      });

      // updatedAt 기준 최신순 정렬
      persons.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      return persons.slice(0, limit);
    } catch (error) {
      console.error('❌ 실종자 정보 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 특정 실종자 정보 조회
   */
  async getMissingPerson(id) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      const personRef = ref(this.db, `missingPersons/${id}`);
      const snapshot = await get(personRef);

      if (!snapshot.exists()) {
        return null;
      }

      return snapshot.val();
    } catch (error) {
      console.error('❌ 실종자 정보 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 실종자 정보 삭제
   */
  async deleteMissingPerson(id) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      const personRef = ref(this.db, `missingPersons/${id}`);
      await remove(personRef);
      console.log(`✅ 실종자 정보 삭제: ${id}`);
      return { success: true };
    } catch (error) {
      console.error('❌ 실종자 정보 삭제 실패:', error);
      throw error;
    }
  }
}

module.exports = new FirebaseService();
