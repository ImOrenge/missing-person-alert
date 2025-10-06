// 실종자 유형
export type MissingPersonType = 'missing_child' | 'runaway' | 'disabled' | 'dementia' | 'facility' | 'unknown';

// 실종자 상태
export type MissingPersonStatus = 'active' | 'found' | 'investigating';

// 시간 범위
export type TimeRange = '24h' | '7d' | '30d' | '60d' | '90d' | '1y' | 'all';

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
  description: string;
  missingDate: string;
  type: MissingPersonType;
  status: MissingPersonStatus;
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
