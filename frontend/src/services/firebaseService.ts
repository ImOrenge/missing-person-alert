import { database, ref, update, get, query, orderByChild, limitToLast } from './firebase';
import { MissingPerson } from '../types';

class FirebaseService {
  /**
   * 실종자 데이터를 Firebase Realtime Database에 저장
   */
  async saveMissingPersons(persons: MissingPerson[]) {
    try {
      const missingPersonsRef = ref(database, 'missingPersons');
      const updates: Record<string, any> = {};

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
      console.error('❌ Firebase 저장 실패:', error);
      return false;
    }
  }

  /**
   * Firebase에서 실종자 데이터 조회
   */
  async getMissingPersons(limit = 100): Promise<MissingPerson[]> {
    try {
      const missingPersonsRef = ref(database, 'missingPersons');
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
      const persons: MissingPerson[] = Object.values(data);

      console.log(`✅ Firebase에서 ${persons.length}건 조회 완료`);
      return persons;
    } catch (error) {
      console.error('❌ Firebase 조회 실패:', error);
      return [];
    }
  }

  /**
   * 특정 실종자 데이터 조회
   */
  async getMissingPerson(id: string): Promise<MissingPerson | null> {
    try {
      const personRef = ref(database, `missingPersons/${id}`);
      const snapshot = await get(personRef);

      if (!snapshot.exists()) {
        return null;
      }

      return snapshot.val();
    } catch (error) {
      console.error('❌ Firebase 조회 실패:', error);
      return null;
    }
  }
}

export default new FirebaseService();
