# Firebase 전화번호 SMS 인증 보안 구현

Firebase Authentication을 사용한 전화번호 SMS 인증 시스템이 구현되었습니다.

## 구현된 기능

### 1. Frontend 기능

#### Firebase 전화번호 인증 설정
- **파일**: `frontend/src/services/firebase.ts`
- reCAPTCHA 기반 전화번호 인증
- SMS 인증 코드 전송 및 검증
- 기존 계정에 전화번호 연결

주요 함수:
```typescript
- initRecaptcha(containerId: string): reCAPTCHA 초기화
- sendPhoneVerificationCode(phoneNumber: string): SMS 인증 코드 전송
- verifyPhoneCode(confirmationResult, code: string): 인증 코드 확인
- linkPhoneNumber(phoneNumber, verificationCode): 계정에 전화번호 연결
- clearRecaptcha(): reCAPTCHA 정리
```

#### 전화번호 인증 UI 컴포넌트
- **파일**: `frontend/src/components/PhoneAuthModal.tsx`
- 2단계 인증 UI (전화번호 입력 → 인증 코드 입력)
- 3분 카운트다운 타이머
- reCAPTCHA 자동 처리
- 보안 안내 메시지

#### SMS 인증 보안 로직
- **파일**: `frontend/src/utils/phoneAuthSecurity.ts`

보안 기능:
- ✅ **전화번호 형식 검증**: 한국 전화번호 형식 검증
- ✅ **Rate Limiting**: 전화번호당 최대 5회 시도
- ✅ **시간 제한**: 1시간당 최대 10회 시도
- ✅ **자동 차단**: 초과 시 1시간 차단
- ✅ **24시간 자동 리셋**: 기록 자동 삭제
- ✅ **보안 경고**: 남은 시도 횟수 경고

주요 함수:
```typescript
- validatePhoneNumber(phoneNumber): 전화번호 형식 검증
- normalizePhoneNumber(phoneNumber): 국제 형식 변환 (+82)
- canAttemptAuth(phoneNumber): 인증 시도 가능 여부 확인
- recordAuthAttempt(phoneNumber): 시도 기록
- clearAuthAttempts(phoneNumber): 인증 성공 시 기록 초기화
- getSecurityWarning(phoneNumber): 보안 경고 메시지
```

### 2. Backend 기능

#### 인증 미들웨어
- **파일**: `backend/middleware/authMiddleware.js`

구현된 미들웨어:
```javascript
- verifyFirebaseToken: Firebase ID 토큰 검증
- verifyPhoneAuthenticated: 전화번호 인증 확인
- verifyAdmin: 관리자 권한 확인
- rateLimit: API Rate Limiting (1분당 10회)
- optionalAuth: 선택적 인증 (토큰 있으면 검증)
```

#### API 라우트 보안 적용
- **파일**: `backend/routes/reports.js`

보안이 적용된 엔드포인트:
- `POST /api/reports`: 제보 등록 (전화번호 인증 필수)
- `GET /api/reports/my`: 내 제보 목록 (인증 필수)
- `GET /api/reports/all`: 모든 제보 조회 (관리자 전용)
- `DELETE /api/reports/:id`: 제보 삭제 (본인 확인)

## Firebase Console 설정

### 1. Phone Authentication 활성화

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. 프로젝트 선택: `missing-person-alram`
3. **Authentication** → **Sign-in method** 이동
4. **Phone** 활성화
   - 테스트 전화번호 추가 가능 (개발 중)

### 2. reCAPTCHA 설정

Firebase Phone Auth는 자동으로 reCAPTCHA를 사용합니다.

**도메인 승인 (프로덕션)**:
1. Firebase Console → **Authentication** → **Settings**
2. **Authorized domains**에 배포 도메인 추가
   - 예: `your-app.com`, `www.your-app.com`

### 3. App Check 설정 (권장)

봇 공격 방지를 위해 App Check 활성화:

1. Firebase Console → **App Check**
2. **Register** 버튼 클릭
3. reCAPTCHA Enterprise 또는 v3 선택
4. 웹 앱 등록

### 4. 사용량 제한 설정

Firebase Console → **Authentication** → **Settings** → **SMS quota**

- 일일 SMS 전송 제한 설정
- 국가별 제한 설정
- 의심스러운 활동 모니터링

## 사용 방법

### Frontend에서 사용

```tsx
import { PhoneAuthModal } from './components/PhoneAuthModal';

function App() {
  const [showPhoneAuth, setShowPhoneAuth] = useState(false);

  const handleAuthSuccess = () => {
    console.log('전화번호 인증 완료');
    // 인증 후 처리
  };

  return (
    <div>
      <button onClick={() => setShowPhoneAuth(true)}>
        전화번호 인증
      </button>

      <PhoneAuthModal
        isOpen={showPhoneAuth}
        onClose={() => setShowPhoneAuth(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
```

### Backend API 호출

인증이 필요한 API 호출 시:

```typescript
import { auth } from './services/firebase';

// Firebase ID Token 가져오기
const user = auth.currentUser;
if (user) {
  const idToken = await user.getIdToken();

  // API 호출
  const response = await fetch('http://localhost:3000/api/reports', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      person: {
        name: '홍길동',
        age: 30,
        // ... 기타 정보
      }
    })
  });

  const data = await response.json();
}
```

## 보안 고려사항

### 1. Frontend 보안

✅ **구현된 보안**:
- reCAPTCHA를 통한 봇 방지
- Rate Limiting (로컬 스토리지 기반)
- 전화번호 형식 검증
- 시도 횟수 제한 및 차단

⚠️ **추가 권장사항**:
- App Check 추가 (봇 공격 방지)
- 의심스러운 패턴 모니터링

### 2. Backend 보안

✅ **구현된 보안**:
- Firebase ID Token 검증
- 전화번호 인증 확인
- API Rate Limiting (메모리 기반)
- 관리자 권한 체크

⚠️ **추가 권장사항**:
- Redis 기반 Rate Limiting (프로덕션)
- IP 기반 차단 리스트
- 로그 모니터링 및 알림

### 3. Firebase 보안 규칙

**Realtime Database 규칙** (`database.rules.json`):
```json
{
  "rules": {
    "reports": {
      ".read": "auth != null",
      ".write": "auth != null && auth.token.phone_number != null",
      "$reportId": {
        ".validate": "newData.hasChildren(['reportedBy', 'createdAt'])",
        "reportedBy": {
          "uid": {
            ".validate": "newData.val() === auth.uid"
          }
        }
      }
    }
  }
}
```

## 에러 처리

### 일반적인 에러

| 에러 코드 | 의미 | 해결 방법 |
|---------|------|----------|
| `auth/invalid-phone-number` | 잘못된 전화번호 | 국제 형식 확인 (+82) |
| `auth/too-many-requests` | 요청 과다 | 잠시 후 재시도 |
| `auth/invalid-verification-code` | 잘못된 인증 코드 | 코드 재확인 |
| `RATE_LIMIT_EXCEEDED` | Rate Limit 초과 | 1분 후 재시도 |
| `PHONE_VERIFICATION_REQUIRED` | 전화번호 인증 필요 | 전화번호 인증 진행 |

## 테스트

### 테스트 전화번호 설정 (개발용)

Firebase Console → **Authentication** → **Phone**:

```
전화번호: +82 10-1234-5678
인증 코드: 123456
```

⚠️ **주의**: 프로덕션 배포 전 테스트 번호 제거!

## 모니터링

### Firebase Console에서 확인

1. **Authentication** → **Users**: 인증된 사용자 목록
2. **Authentication** → **Usage**: SMS 사용량
3. **App Check** → **Metrics**: 봇 차단 통계

### 로그 확인

Frontend (브라우저 콘솔):
```
✅ reCAPTCHA 인증 완료
✅ SMS 인증 코드가 전송되었습니다
✅ 전화번호 인증이 완료되었습니다
```

Backend (서버 콘솔):
```
✅ Firebase Admin 초기화 완료
✅ 토큰 검증 성공: uid-xxx
✅ 제보 저장 완료: report_xxx
```

## 비용

Firebase Phone Authentication 가격:
- **무료**: 월 10,000 SMS (확인 필요)
- **유료**: 초과분은 SMS당 비용 발생
- 국가별 가격 상이

**비용 절약 팁**:
- 테스트는 테스트 전화번호 사용
- Rate Limiting으로 남용 방지
- App Check로 봇 차단

## 문제 해결

### reCAPTCHA가 표시되지 않음
- `recaptcha-container` div 확인
- 브라우저 콘솔에서 에러 확인
- Firebase 도메인 승인 확인

### SMS가 도착하지 않음
- 전화번호 형식 확인 (+82...)
- Firebase Console에서 SMS quota 확인
- 통신사 스팸 차단 확인

### 토큰 검증 실패
- Firebase Admin SDK 초기화 확인
- 토큰 만료 확인 (1시간)
- Authorization 헤더 형식 확인

## 다음 단계

1. ✅ App Check 추가 (봇 방지 강화)
2. ✅ Redis 기반 Rate Limiting (프로덕션)
3. ✅ 로그 모니터링 시스템 구축
4. ✅ SMS 사용량 알림 설정
5. ✅ 관리자 대시보드 구현

## 참고 자료

- [Firebase Phone Authentication 문서](https://firebase.google.com/docs/auth/web/phone-auth)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Firebase Security Rules](https://firebase.google.com/docs/rules)
- [reCAPTCHA v3](https://developers.google.com/recaptcha/docs/v3)
