import { Timestamp } from 'firebase/firestore';
import type { BannerAction, BannerKind, BannerSeverity } from './banner';

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

  // 배너 V2 필드. 기존 공지는 값이 없으면 일반 정보 공지로 처리한다.
  kind?: BannerKind;
  severity?: BannerSeverity;
  title?: string;
  sourceLabel?: string;
  targetRegionCodes?: string[];
  startsAt?: Timestamp;
  endsAt?: Timestamp;
  action?: BannerAction;
  dismissible?: boolean;
  revision?: number;
  approvedAt?: Timestamp;
}

export interface CreateAnnouncementInput {
  text: string;
  type: 'info' | 'warning';
  displayType?: AnnouncementDisplayType;
  active?: boolean;
  priority?: number;
  popupTitle?: string;
  popupButtonText?: string;
  kind?: BannerKind;
  severity?: BannerSeverity;
  title?: string;
  sourceLabel?: string;
  targetRegionCodes?: string[];
  startsAt?: Timestamp;
  endsAt?: Timestamp;
  action?: BannerAction;
  dismissible?: boolean;
  revision?: number;
}

export interface UpdateAnnouncementInput {
  text?: string;
  type?: 'info' | 'warning';
  displayType?: AnnouncementDisplayType;
  active?: boolean;
  priority?: number;
  popupTitle?: string;
  popupButtonText?: string;
  kind?: BannerKind;
  severity?: BannerSeverity;
  title?: string;
  sourceLabel?: string;
  targetRegionCodes?: string[];
  startsAt?: Timestamp;
  endsAt?: Timestamp;
  action?: BannerAction;
  dismissible?: boolean;
  revision?: number;
}
