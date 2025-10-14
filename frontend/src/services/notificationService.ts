import { onSnapshot, query, where, orderBy, writeBatch, doc, updateDoc, collection } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { firestore, Timestamp } from './firebase';

export type CommentNotificationType = 'reply' | 'like' | 'mention';

export interface CommentNotification {
  notificationId: string;
  userId: string;
  commentId: string;
  type: CommentNotificationType;
  isRead: boolean;
  createdAt: Timestamp;
}

export type CommentNotificationModel = CommentNotification & { createdAtDate: Date };

const mapNotification = (data: CommentNotification): CommentNotificationModel => ({
  ...data,
  createdAtDate: data.createdAt?.toDate?.() ?? new Date()
});

export const subscribeCommentNotifications = (
  userId: string,
  callback: (notifications: CommentNotificationModel[]) => void
) => {
  const notificationsRef = collection(firestore, 'commentNotifications');
  const notificationsQuery = query(
    notificationsRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(notificationsQuery, snapshot => {
    const notifications = snapshot.docs.map(docSnap => mapNotification(docSnap.data() as CommentNotification));
    callback(notifications);
  });
};

export const markNotificationRead = async (notificationId: string) => {
  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error('로그인이 필요합니다');
  }
  const notificationRef = doc(firestore, 'commentNotifications', notificationId);
  await updateDoc(notificationRef, { isRead: true });
};

export const markAllNotificationsRead = async (notifications: CommentNotificationModel[]) => {
  const unread = notifications.filter(notification => !notification.isRead);
  if (unread.length === 0) return;

  const batch = writeBatch(firestore);
  unread.forEach(notification => {
    const ref = doc(firestore, 'commentNotifications', notification.notificationId);
    batch.update(ref, { isRead: true });
  });
  await batch.commit();
};
