import {
  firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  auth
} from './firebase';
import type { Announcement, CreateAnnouncementInput, UpdateAnnouncementInput } from '../types/announcement';

const ANNOUNCEMENTS_COLLECTION = 'announcements';

/**
 * 모든 활성화된 공지사항 조회 (priority 순서)
 */
export const getActiveAnnouncements = async (): Promise<Announcement[]> => {
  try {
    const announcementsRef = collection(firestore, ANNOUNCEMENTS_COLLECTION);
    const q = query(
      announcementsRef,
      where('active', '==', true),
      orderBy('priority', 'asc'),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    const announcements: Announcement[] = [];

    snapshot.forEach((doc) => {
      announcements.push({
        id: doc.id,
        ...doc.data()
      } as Announcement);
    });

    return announcements;
  } catch (error) {
    console.error('공지사항 조회 실패:', error);
    return [];
  }
};

/**
 * 모든 공지사항 조회 (관리자용)
 */
export const getAllAnnouncements = async (): Promise<Announcement[]> => {
  try {
    const announcementsRef = collection(firestore, ANNOUNCEMENTS_COLLECTION);
    const q = query(
      announcementsRef,
      orderBy('priority', 'asc'),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    const announcements: Announcement[] = [];

    snapshot.forEach((doc) => {
      announcements.push({
        id: doc.id,
        ...doc.data()
      } as Announcement);
    });

    return announcements;
  } catch (error) {
    console.error('공지사항 전체 조회 실패:', error);
    return [];
  }
};

/**
 * 특정 공지사항 조회
 */
export const getAnnouncementById = async (id: string): Promise<Announcement | null> => {
  try {
    const docRef = doc(firestore, ANNOUNCEMENTS_COLLECTION, id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      } as Announcement;
    }

    return null;
  } catch (error) {
    console.error('공지사항 조회 실패:', error);
    return null;
  }
};

/**
 * 공지사항 생성
 */
export const createAnnouncement = async (input: CreateAnnouncementInput): Promise<{ success: boolean; id?: string; error?: string }> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: '로그인이 필요합니다' };
    }

    // 새 문서 참조 생성
    const announcementsRef = collection(firestore, ANNOUNCEMENTS_COLLECTION);
    const newDocRef = doc(announcementsRef);

    const announcement: Omit<Announcement, 'id'> = {
      text: input.text,
      type: input.type,
      displayType: input.displayType ?? 'banner',
      active: input.active ?? true,
      priority: input.priority ?? 999,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: currentUser.uid,
      popupTitle: input.popupTitle,
      popupButtonText: input.popupButtonText
    };

    await setDoc(newDocRef, announcement);

    return { success: true, id: newDocRef.id };
  } catch (error: any) {
    console.error('공지사항 생성 실패:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 공지사항 수정
 */
export const updateAnnouncement = async (id: string, input: UpdateAnnouncementInput): Promise<{ success: boolean; error?: string }> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: '로그인이 필요합니다' };
    }

    const docRef = doc(firestore, ANNOUNCEMENTS_COLLECTION, id);

    const updateData: any = {
      ...input,
      updatedAt: Timestamp.now()
    };

    await updateDoc(docRef, updateData);

    return { success: true };
  } catch (error: any) {
    console.error('공지사항 수정 실패:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 공지사항 삭제
 */
export const deleteAnnouncement = async (id: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: '로그인이 필요합니다' };
    }

    const docRef = doc(firestore, ANNOUNCEMENTS_COLLECTION, id);
    await deleteDoc(docRef);

    return { success: true };
  } catch (error: any) {
    console.error('공지사항 삭제 실패:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 공지사항 활성화/비활성화
 */
export const toggleAnnouncementActive = async (id: string, active: boolean): Promise<{ success: boolean; error?: string }> => {
  return updateAnnouncement(id, { active });
};

/**
 * 배너에 표시할 공지사항 조회
 */
export const getBannerAnnouncements = async (): Promise<Announcement[]> => {
  const all = await getActiveAnnouncements();
  return all.filter(a => a.displayType === 'banner' || a.displayType === 'both');
};

/**
 * 팝업으로 표시할 공지사항 조회
 */
export const getPopupAnnouncements = async (): Promise<Announcement[]> => {
  const all = await getActiveAnnouncements();
  return all.filter(a => a.displayType === 'popup' || a.displayType === 'both');
};
