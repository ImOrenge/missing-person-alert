import { Timestamp } from 'firebase/firestore';

export type AnnouncementDisplayType = 'banner' | 'popup' | 'both';

export interface Announcement {
  id: string;
  text: string;
  type: 'info' | 'warning';
  displayType: AnnouncementDisplayType; // 표시 방식
  active: boolean;
  priority: number; // 낮을수록 먼저 표시 (1이 최우선)
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // 작성자 UID

  // 팝업 전용 필드
  popupTitle?: string; // 팝업 제목 (선택사항)
  popupButtonText?: string; // 버튼 텍스트 (기본: "확인")
}

export interface CreateAnnouncementInput {
  text: string;
  type: 'info' | 'warning';
  displayType?: AnnouncementDisplayType;
  active?: boolean;
  priority?: number;
  popupTitle?: string;
  popupButtonText?: string;
}

export interface UpdateAnnouncementInput {
  text?: string;
  type?: 'info' | 'warning';
  displayType?: AnnouncementDisplayType;
  active?: boolean;
  priority?: number;
  popupTitle?: string;
  popupButtonText?: string;
}
