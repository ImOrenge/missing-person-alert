const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit: firestoreLimit, Timestamp } = require('firebase/firestore');
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
      this.db = getFirestore(app);
      this.auth = getAuth(app);
      console.log('✅ Firebase Firestore 초기화 완료');
    } catch (error) {
      console.error('❌ Firebase 초기화 실패:', error.message);
      this.db = null;
    }
  }

  /**
   * 유저 정보 저장/업데이트 (Firestore)
   */
  async saveUser(uid, userData) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      const userRef = doc(this.db, 'users', uid);
      const userDoc = await getDoc(userRef);

      const data = {
        uid,
        email: userData.email,
        displayName: userData.displayName || null,
        photoURL: userData.photoURL || null,
        phoneNumber: userData.phoneNumber || null,
        isPhoneVerified: userData.isPhoneVerified || false,
        isAdmin: userData.isAdmin || false,
        createdAt: userDoc.exists() ? userDoc.data().createdAt : Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(userRef, data, { merge: true });
      console.log(`✅ 유저 정보 저장: ${uid} (${userData.email})`);

      return { success: true, user: data };
    } catch (error) {
      console.error('❌ 유저 정보 저장 실패:', error);
      throw error;
    }
  }

  /**
   * 유저 정보 조회 (Firestore)
   */
  async getUser(uid) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      const userRef = doc(this.db, 'users', uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return null;
      }

      return { id: userDoc.id, ...userDoc.data() };
    } catch (error) {
      console.error('❌ 유저 정보 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 실종자 제보 저장 (Firestore)
   */
  async saveReport(reportData) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const reportRef = doc(this.db, 'reports', reportId);

      const report = {
        ...reportData,
        id: reportId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        status: 'pending'
      };

      await setDoc(reportRef, report);
      console.log(`✅ 제보 저장 완료: ${reportId}`);

      return {
        success: true,
        reportId: reportId,
        report
      };
    } catch (error) {
      console.error('❌ 제보 저장 실패:', error);
      throw error;
    }
  }

  /**
   * 사용자별 제보 목록 조회 (Firestore)
   */
  async getUserReports(userId) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      const reportsRef = collection(this.db, 'reports');
      const q = query(
        reportsRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return [];
      }

      const reports = [];
      snapshot.forEach((docSnap) => {
        reports.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });

      return reports;
    } catch (error) {
      console.error('❌ 제보 목록 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 제보 상세 조회 (Firestore)
   */
  async getReport(reportId) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      const reportRef = doc(this.db, 'reports', reportId);
      const reportDoc = await getDoc(reportRef);

      if (!reportDoc.exists()) {
        return null;
      }

      return {
        id: reportDoc.id,
        ...reportDoc.data()
      };
    } catch (error) {
      console.error('❌ 제보 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 제보 삭제 (Firestore)
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

      const reportRef = doc(this.db, 'reports', reportId);
      await deleteDoc(reportRef);

      console.log(`✅ 제보 삭제 완료: ${reportId}`);

      return { success: true };
    } catch (error) {
      console.error('❌ 제보 삭제 실패:', error);
      throw error;
    }
  }

  /**
   * 제보 업데이트 (Firestore)
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

      const reportRef = doc(this.db, 'reports', reportId);
      await updateDoc(reportRef, {
        ...updates,
        updatedAt: Timestamp.now()
      });

      console.log(`✅ 제보 업데이트 완료: ${reportId}`);

      return { success: true };
    } catch (error) {
      console.error('❌ 제보 업데이트 실패:', error);
      throw error;
    }
  }

  /**
   * 실종자 정보 저장 (API 데이터 또는 사용자 제보) - Firestore
   */
  async saveMissingPersons(persons) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      let saved = 0;
      let duplicates = 0;

      for (const person of persons) {
        try {
          // ID 중복 확인
          const personRef = doc(this.db, 'missingPersons', person.id);
          const personDoc = await getDoc(personRef);

          if (personDoc.exists()) {
            duplicates++;
            continue;
          }

          // updatedAt 추가
          const personData = {
            ...person,
            updatedAt: Timestamp.now()
          };

          await setDoc(personRef, personData);
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
   * 실종자 정보 조회 (최신순) - Firestore
   */
  async getMissingPersons(limitCount = 100) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      const missingPersonsRef = collection(this.db, 'missingPersons');
      const q = query(
        missingPersonsRef,
        orderBy('updatedAt', 'desc'),
        firestoreLimit(limitCount)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return [];
      }

      const persons = [];
      snapshot.forEach((docSnap) => {
        persons.push(docSnap.data());
      });

      return persons;
    } catch (error) {
      console.error('❌ 실종자 정보 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 특정 실종자 정보 조회 - Firestore
   */
  async getMissingPerson(id) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      const personRef = doc(this.db, 'missingPersons', id);
      const personDoc = await getDoc(personRef);

      if (!personDoc.exists()) {
        return null;
      }

      return personDoc.data();
    } catch (error) {
      console.error('❌ 실종자 정보 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 실종자 정보 삭제 - Firestore
   */
  async deleteMissingPerson(id) {
    if (!this.db) {
      throw new Error('Firebase가 초기화되지 않았습니다');
    }

    try {
      const personRef = doc(this.db, 'missingPersons', id);
      await deleteDoc(personRef);
      console.log(`✅ 실종자 정보 삭제: ${id}`);
      return { success: true };
    } catch (error) {
      console.error('❌ 실종자 정보 삭제 실패:', error);
      throw error;
    }
  }
}

module.exports = new FirebaseService();
