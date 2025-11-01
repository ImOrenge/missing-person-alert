# Guest ID 구현 가이드

## 개요

비로그인 사용자를 추적하고 세션을 구분하기 위한 Guest ID 시스템을 구현했습니다. 이 시스템은 다음과 같은 목적을 가지고 있습니다:

- 비로그인 사용자의 세션 식별
- 사용자 행동 분석 (Firebase Analytics)
- 백엔드 로그에서 사용자 구분
- 향후 기능 개선을 위한 데이터 수집

## 아키텍처

```
[Frontend]
  ├─ utils/guestId.ts          - Guest ID 생성 및 관리
  ├─ hooks/useGuestId.ts        - Guest ID React 훅
  ├─ services/analyticsService.ts - Firebase Analytics 통합
  └─ services/apiClient.ts      - Axios 인터셉터 (자동 헤더 추가)

[Backend]
  ├─ middleware/authMiddleware.js - Guest ID 로깅 미들웨어
  └─ server.js                   - CORS 헤더 설정 (x-guest-id)
```

## 구현 상세

### 1. Guest ID 형식

```
guest_[timestamp]_[random]

예시: guest_1704067200000_k3j9d8f2
```

- `timestamp`: Guest ID 생성 시각 (밀리초)
- `random`: 8자리 랜덤 문자열 (충돌 방지)

### 2. 저장 위치

- **localStorage**: `missing_person_guest_id`
- **생성 시각**: `missing_person_guest_id_created`

### 3. 생명주기

1. **생성**: 앱 첫 방문 시 자동 생성
2. **유지**: localStorage에 영구 저장 (브라우저 캐시 삭제 전까지)
3. **삭제**: 사용자 로그인 시 자동 삭제
4. **재생성**: 로그아웃 후 다시 비로그인 상태가 되면 새 ID 생성

## 프론트엔드 사용법

### Guest ID 가져오기

```typescript
import { useGuestId } from './hooks/useGuestId';

function MyComponent() {
  const { guestIdInfo, userId, userType, isGuest } = useGuestId(currentUser);

  console.log('User ID:', userId);           // 로그인: uid, 비로그인: guest_xxx
  console.log('User Type:', userType);       // 'authenticated' 또는 'guest'
  console.log('Is Guest:', isGuest);         // true/false
  console.log('Guest ID Info:', guestIdInfo); // { guestId, createdAt, isTemporary }
}
```

### Firebase Analytics 이벤트 로깅

```typescript
import { logCustomEvent } from './services/analyticsService';

// 커스텀 이벤트 로깅
logCustomEvent('button_clicked', {
  button_name: 'share',
  page: 'missing_person_detail'
});

// 실종자 조회 이벤트
import { logMissingPersonView } from './services/analyticsService';
logMissingPersonView('person_123', 'guest'); // 또는 'authenticated'
```

### API 요청 시 자동 헤더 추가

```typescript
import apiClient from './services/apiClient';

// apiClient를 사용하면 자동으로 Guest ID 또는 Firebase 토큰이 헤더에 추가됩니다
const response = await apiClient.get('/api/missing-persons');
// Headers: x-guest-id: guest_xxx (비로그인) 또는 Authorization: Bearer token (로그인)
```

## 백엔드 로깅

백엔드에서는 모든 요청에 대해 자동으로 Guest ID를 로깅합니다:

```javascript
// 인증된 사용자
👤 사용자 요청 [UID: abc123] GET /api/reports

// Guest 사용자
👻 Guest 요청 [Guest ID: guest_1704067200000_k3j9d8f2] GET /api/missing-persons

// ID 없음
❓ 익명 요청 GET /health
```

## 개발 환경에서 테스트

### 1. 개발자 패널 확인

개발 환경에서는 화면 왼쪽 하단에 Guest ID 정보가 표시됩니다:

```
🔍 개발자 정보
Guest ID: guest_1704067200000_k3j9d8f2
생성: 2024. 1. 1. 오전 12:00:00
타입: guest
```

### 2. localStorage 확인

브라우저 개발자 도구 > Application > Local Storage:

```
missing_person_guest_id: guest_1704067200000_k3j9d8f2
missing_person_guest_id_created: 2024-01-01T00:00:00.000Z
```

### 3. 네트워크 요청 확인

브라우저 개발자 도구 > Network > 요청 선택 > Headers:

```
Request Headers:
  x-guest-id: guest_1704067200000_k3j9d8f2
```

### 4. 백엔드 로그 확인

백엔드 콘솔에서:

```bash
cd backend
npm run dev

# 콘솔 출력:
👻 Guest 요청 [Guest ID: guest_1704067200000_k3j9d8f2] GET /api/status
```

## 테스트 시나리오

### 시나리오 1: 첫 방문 (Guest ID 생성)

1. 브라우저의 모든 캐시/쿠키 삭제
2. 앱 접속
3. localStorage 확인 → Guest ID 생성됨
4. 개발자 패널에 Guest ID 표시됨
5. 백엔드 로그에 Guest 요청 기록됨

### 시나리오 2: 재방문 (Guest ID 유지)

1. 브라우저 닫기
2. 브라우저 재시작 후 앱 접속
3. localStorage 확인 → 동일한 Guest ID 유지됨
4. 백엔드 로그에 동일한 Guest ID로 요청 기록됨

### 시나리오 3: 로그인 (Guest ID 삭제)

1. Guest 상태에서 로그인
2. localStorage 확인 → Guest ID 삭제됨
3. 백엔드 로그에 UID로 요청 기록됨 (Guest ID 없음)
4. Firebase Analytics에 `user_type: authenticated` 설정됨

### 시나리오 4: 로그아웃 (새 Guest ID 생성)

1. 로그인 상태에서 로그아웃
2. localStorage 확인 → 새로운 Guest ID 생성됨
3. 백엔드 로그에 새 Guest ID로 요청 기록됨
4. Firebase Analytics에 `user_type: guest` 설정됨

## Firebase Analytics 데이터 확인

Firebase Console > Analytics > Events:

1. **User Properties**:
   - `user_type`: 'guest' 또는 'authenticated'
   - `guest_id`: guest_xxx (비로그인 사용자만)

2. **Custom Events**:
   - `missing_person_view`: 실종자 조회
   - `filter_used`: 필터 사용
   - `report_submitted`: 제보 제출
   - `login`: 로그인
   - `logout`: 로그아웃

## 주의사항

### localStorage 접근 불가 시

일부 브라우저나 프라이빗 모드에서는 localStorage 접근이 차단될 수 있습니다. 이 경우:

- 임시 Guest ID 생성: `guest_temp_[timestamp]`
- 개발자 패널에 경고 표시: "⚠️ 임시 ID (localStorage 접근 불가)"
- 페이지 새로고침 시 새로운 임시 ID 생성

### CORS 설정

백엔드에서 `x-guest-id` 헤더를 허용해야 합니다:

```javascript
allowedHeaders: ['Content-Type', 'Authorization', 'x-recaptcha-token', 'x-guest-id']
```

### 프라이버시

- Guest ID는 개인 식별 정보(PII)를 포함하지 않습니다
- 사용자가 원하면 브라우저 캐시 삭제로 Guest ID를 제거할 수 있습니다
- 로그인 시 Guest ID가 자동 삭제되어 익명성이 보장됩니다

## 향후 개선 사항

1. **Guest ID 기반 통계**:
   - 일별/주별 고유 방문자 수 (Guest ID 기반)
   - 사용자 체류 시간 분석
   - 페이지 전환 흐름 분석

2. **세션 추적**:
   - 세션 시작/종료 시각 기록
   - 세션당 조회한 실종자 수
   - 필터 사용 패턴 분석

3. **Conversion 추적**:
   - Guest → 로그인 전환율
   - Guest → 제보 제출 전환율
   - 체류 시간과 전환율의 상관관계

4. **A/B 테스트**:
   - Guest ID를 기반으로 사용자를 그룹으로 분류
   - 그룹별로 다른 UI/UX 제공
   - 성과 비교 분석

## 문제 해결

### Guest ID가 생성되지 않음

1. localStorage 접근 가능 여부 확인
2. 브라우저 콘솔에서 `localStorage.getItem('missing_person_guest_id')` 실행
3. 에러 메시지 확인

### 백엔드에 Guest ID가 전달되지 않음

1. 네트워크 탭에서 요청 헤더 확인
2. CORS 설정에 `x-guest-id` 포함 여부 확인
3. apiClient 사용 여부 확인 (axios.get 대신 apiClient.get 사용)

### Firebase Analytics에 데이터가 표시되지 않음

1. Firebase 프로젝트 설정 확인
2. Analytics 초기화 성공 여부 확인 (콘솔 로그)
3. 24시간 후 데이터 확인 (Analytics는 지연이 있음)
4. DebugView 활성화하여 실시간 이벤트 확인

## 관련 파일

### 프론트엔드
- `frontend/src/utils/guestId.ts` - Guest ID 유틸리티
- `frontend/src/hooks/useGuestId.ts` - Guest ID 훅
- `frontend/src/services/analyticsService.ts` - Analytics 서비스
- `frontend/src/services/apiClient.ts` - API 클라이언트
- `frontend/src/App.tsx` - Guest ID 초기화 및 표시

### 백엔드
- `backend/middleware/authMiddleware.js` - Guest ID 로깅
- `backend/server.js` - CORS 설정

## 문의

Guest ID 시스템에 대한 문의사항이나 개선 제안이 있으면 이슈를 등록해주세요.
