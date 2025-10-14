export type CommentType = 'sighting' | 'question' | 'support';

export interface MissingPersonComment {
  commentId: string;
  missingPersonId: string;
  userId: string;
  nickname: string;
  isAnonymous: boolean;
  content: string;
  type: CommentType;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  likes: number;
  likedBy: string[];
  isEdited: boolean;
  isDeleted: boolean;
  reported: boolean;
  reportCount: number;
  reportedBy: string[];
  isHidden: boolean;
}

export type CommentReportReason = 'spam' | 'inappropriate' | 'false' | 'other';
export type CommentReportStatus = 'pending' | 'resolved' | 'dismissed';

export interface CommentReport {
  reportId: string;
  commentId: string;
  reportedBy: string;
  reason: CommentReportReason;
  description?: string;
  createdAt: FirebaseFirestore.Timestamp;
  status: CommentReportStatus;
}

export type CommentNotificationType = 'reply' | 'like' | 'mention';

export interface CommentNotification {
  notificationId: string;
  userId: string;
  commentId: string;
  type: CommentNotificationType;
  isRead: boolean;
  createdAt: FirebaseFirestore.Timestamp;
}
