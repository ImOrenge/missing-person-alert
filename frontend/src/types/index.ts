// 실종자 유형
export type MissingPersonType = 'missing_child' | 'runaway' | 'disabled' | 'dementia' | 'facility' | 'unknown';

// 실종자 상태
export type MissingPersonStatus = 'active' | 'found' | 'investigating';

// 시간 범위
export type TimeRange = '24h' | '7d' | '30d' | '90d' | '180d' | '1y' | '3y' | '5y' | 'all';

export interface MissingPersonSourceTrace {
  agency: string;
  sourceId: string;
  officialUrl?: string | null;
  sourcePublishedAt?: number;
  sourceUpdatedAt?: number;
  lastCheckedAt?: number;
}

export interface MissingPersonVisibility {
  public: boolean;
  searchable: boolean;
  shareable: boolean;
}

export interface MissingPersonSyncTrace {
  sourceHash?: string;
  lastRunId?: string;
  normalizerVersion?: number;
}

// 실종자 정보
export interface MissingPerson {
  id: string;
  name: string;
  age: number;
  gender: string;
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  photo?: string;
  photos?: string[];
  description: string;
  missingDate: string;
  type: MissingPersonType;
  status: MissingPersonStatus;
  // 발견 사유 (자동 처리 시 기록)
  foundReason?: string;
  // 안전드림 API 추가 필드
  height?: number;
  weight?: number;
  clothes?: string;
  bodyType?: string;
  faceShape?: string;
  hairShape?: string;
  hairColor?: string;
  // 제보자 정보 (사용자 제보인 경우)
  reportedBy?: {
    uid: string;
    name: string;
    phone: string;
    relation: string;
    reportedAt: string;
  };
  source?: 'user_report' | 'api';
  schemaVersion?: number;
  sourceTrace?: MissingPersonSourceTrace;
  visibility?: MissingPersonVisibility;
  sync?: MissingPersonSyncTrace;
  updatedAt?: number;
  // API에서 마지막으로 확인된 시간 (자동 발견 처리용)
  lastSeenInAPI?: number;
  // 댓글 수 (commentCount로 통일, commentsCount는 deprecated)
  commentCount?: number;
  commentStats?: {
    total?: number;
    [key: string]: number | undefined;
  };
  // 조회 수
  viewCount?: number;
  viewStats?: {
    total: number;
    lastViewed?: number;
    uniqueViewers?: number;
  };
}

// 긴급재난문자
export interface EmergencyMessage {
  id: string;
  region: string;
  regionCode: string;
  sendTime: string;
  content: string;
  disasterType: string;
}

// 필터 상태
export interface FilterState {
  regions: string[];
  types: MissingPersonType[];
  timeRange: TimeRange;
}

// WebSocket 메시지 타입
export type WebSocketMessageType =
  | 'CONNECTED'
  | 'NEW_MISSING_PERSON'
  | 'NEW_EMERGENCY_MESSAGE'
  | 'ping'
  | 'pong';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data?: any;
  message?: string;
  timestamp: string;
}

export type {
  MissingPersonComment,
  CommentReport,
  CommentNotification
} from './comment';
export type {
  CommentType,
  CommentReportReason,
  CommentReportStatus,
  CommentNotificationType
} from './comment';
