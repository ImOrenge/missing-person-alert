# reCAPTCHA v3 자동입력 방지 시스템 구현

실종자 제보 시 자동입력 방지를 위한 Google reCAPTCHA v3 보안 시스템이 구현되었습니다.

## 구현된 기능

### 1. Frontend 기능

#### reCAPTCHA v3 유틸리티
- **파일**: `frontend/src/utils/recaptcha.ts`
- 자동 스크립트 로드 및 관리
- 토큰 생성 및 검증
- 배지 표시/숨김 기능

주요 함수:
```typescript
- loadRecaptchaScript(): reCAPTCHA 스크립트 로드
- executeRecaptcha(action): reCAPTCHA 토큰 생성
- hideRecaptchaBadge(): reCAPTCHA 배지 숨기기
- showRecaptchaBadge(): reCAPTCHA 배지 표시
```

#### 제보 모달에 reCAPTCHA 통합
- **파일**: `frontend/src/components/ReportModal.tsx`
- 제보 제출 시 자동으로 reCAPTCHA 토큰 생성
- 보안 검증 완료 후에만 제출 가능
- 로딩 상태 및 에러 처리

보안 기능:
- ✅ **중복 제출 방지**: 제출 중에는 버튼 비활성화
- ✅ **자동 봇 차단**: reCAPTCHA v3로 자동 점수 계산
- ✅ **무중단 UX**: 사용자 클릭 없이 자동으로 검증
- ✅ **실시간 상태 표시**: 로딩, 제보 중 상태 표시

### 2. Backend 기능

#### reCAPTCHA 검증 미들웨어
- **파일**: `backend/middleware/authMiddleware.js`

구현된 기능:
```javascript
- verifyRecaptcha: Google reCAPTCHA v3 토큰 검증
  - 토큰 존재 여부 확인
  - Google API를 통한 토큰 검증
  - 점수 기반 봇 차단 (0.0 ~ 1.0)
  - 액션 검증
```

보안 파라미터:
- **최소 점수**: 0.5 (환경변수로 조정 가능)
- **검증 실패 시**: 403 에러 반환
- **개발 환경**: 검증 실패 시 통과 (테스트 용이)
- **프로덕션**: 엄격한 검증 적용

#### API 라우트 보안 적용
- **파일**: `backend/routes/reports.js`

보안이 적용된 엔드포인트:
```javascript
POST /api/reports
  - verifyFirebaseToken: Firebase 인증
  - verifyPhoneAuthenticated: 전화번호 인증
  - verifyRecaptcha: reCAPTCHA 검증
  - rateLimit: API 속도 제한
```

## Google reCAPTCHA Console 설정

### 1. reCAPTCHA v3 사이트 등록

1. [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin) 접속
2. **새 사이트 만들기** 클릭
3. 설정 입력:
   - **라벨**: `missing-person-report` (프로젝트 이름)
   - **reCAPTCHA 유형**: **reCAPTCHA v3** 선택
   - **도메인**:
     - 개발: `localhost`
     - 프로덕션: `your-domain.com`
   - **소유자**: 본인 Gmail 계정
4. **reCAPTCHA 서비스 약관** 동의
5. **제출** 클릭

### 2. 키 정보 저장

등록 후 두 개의 키를 받게 됩니다:

- **사이트 키 (Site Key)**: Frontend에서 사용
- **비밀 키 (Secret Key)**: Backend에서 사용

### 3. 환경 변수 설정

#### Frontend 환경변수 (.env)
```bash
# Frontend: frontend/.env
REACT_APP_RECAPTCHA_SITE_KEY=your_site_key_here
```

#### Backend 환경변수 (.env)
```bash
# Backend: backend/.env
RECAPTCHA_SECRET_KEY=your_secret_key_here
RECAPTCHA_MIN_SCORE=0.5  # 최소 허용 점수 (0.0 ~ 1.0)
NODE_ENV=production      # 프로덕션 환경
```

### 4. 도메인 승인

**개발 환경**:
- `localhost` 자동 허용

**프로덕션 배포 시**:
1. Google reCAPTCHA Admin Console 접속
2. 등록한 사이트 선택
3. **Settings** → **Domains**
4. 배포 도메인 추가:
   - `your-app.com`
   - `www.your-app.com`
   - 서브도메인 필요 시 추가

## 사용 방법

### Frontend에서 reCAPTCHA 사용

```tsx
import { executeRecaptcha } from '../utils/recaptcha';

const handleSubmit = async () => {
  // reCAPTCHA 토큰 생성
  const recaptchaToken = await executeRecaptcha('report_submit');

  // API 호출 시 헤더에 포함
  const response = await fetch('/api/reports', {
    method: 'POST',
    headers: {
      'X-Recaptcha-Token': recaptchaToken
    },
    body: JSON.stringify(data)
  });
};
```

### Backend에서 검증

```javascript
const { verifyRecaptcha } = require('./middleware/authMiddleware');

// 라우트에 미들웨어 적용
router.post('/api/reports', verifyRecaptcha, async (req, res) => {
  // req.recaptcha.score로 점수 확인 가능
  console.log('reCAPTCHA 점수:', req.recaptcha.score);
});
```

## 보안 고려사항

### 1. reCAPTCHA v3 점수 시스템

- **점수 범위**: 0.0 (봇) ~ 1.0 (사람)
- **권장 최소 점수**: 0.5
- **점수별 의미**:
  - `0.9 ~ 1.0`: 확실한 사람
  - `0.7 ~ 0.9`: 사람일 가능성 높음
  - `0.5 ~ 0.7`: 의심스러움
  - `0.0 ~ 0.5`: 봇일 가능성 높음

### 2. 보안 레벨 조정

**엄격한 보안** (추천하지 않음):
```bash
RECAPTCHA_MIN_SCORE=0.7
```

**균형잡힌 보안** (권장):
```bash
RECAPTCHA_MIN_SCORE=0.5
```

**느슨한 보안** (비추천):
```bash
RECAPTCHA_MIN_SCORE=0.3
```

### 3. 다층 보안 구조

실종자 제보 시 적용되는 보안 계층:

1. ✅ **Firebase 인증**: 로그인 사용자만 제보 가능
2. ✅ **전화번호 인증**: SMS 인증 완료한 사용자만
3. ✅ **reCAPTCHA v3**: 자동 봇 차단
4. ✅ **Rate Limiting**: 1분당 10회 제한
5. ✅ **IP 기반 추적**: 의심스러운 활동 모니터링

### 4. Frontend 보안

✅ **구현된 보안**:
- reCAPTCHA v3 자동 검증
- 중복 제출 방지
- 토큰 자동 생성 및 헤더 전송
- 로딩 상태 관리

### 5. Backend 보안

✅ **구현된 보안**:
- Google API를 통한 토큰 검증
- 점수 기반 봇 차단
- 액션 검증 (report_submit)
- 개발/프로덕션 환경 분리

## 에러 처리

### 일반적인 에러

| 에러 코드 | 의미 | 해결 방법 |
|---------|------|----------|
| `RECAPTCHA_TOKEN_MISSING` | reCAPTCHA 토큰 없음 | Frontend 통합 확인 |
| `RECAPTCHA_VERIFICATION_FAILED` | 토큰 검증 실패 | 토큰 생성 확인 |
| `RECAPTCHA_SCORE_TOO_LOW` | 점수가 너무 낮음 | 사용자에게 재시도 요청 |

### reCAPTCHA 에러 코드

| 에러 코드 | 의미 |
|---------|------|
| `missing-input-secret` | Secret Key 누락 |
| `invalid-input-secret` | 잘못된 Secret Key |
| `missing-input-response` | 토큰 누락 |
| `invalid-input-response` | 잘못된 토큰 |
| `bad-request` | 잘못된 요청 |
| `timeout-or-duplicate` | 토큰 만료 또는 중복 사용 |

## 테스트

### 개발 환경 테스트

1. Frontend 환경변수 설정 확인
2. Backend 환경변수 설정 확인
3. 제보 모달 열기
4. 제보 정보 입력
5. 제보하기 버튼 클릭
6. 브라우저 콘솔에서 reCAPTCHA 로그 확인:
   ```
   ✅ reCAPTCHA 로드 완료
   ✅ reCAPTCHA 토큰 생성 완료 (action: report_submit)
   ```
7. 서버 콘솔에서 검증 로그 확인:
   ```
   ✅ reCAPTCHA 검증 성공 (점수: 0.9, 액션: report_submit)
   ```

### 점수 테스트

**낮은 점수 시뮬레이션**:
1. Backend에서 `RECAPTCHA_MIN_SCORE=0.9`로 설정
2. 정상적으로 제보 시도
3. 점수가 0.9 미만이면 차단됨
4. 다시 `0.5`로 복원

## 모니터링

### Google reCAPTCHA Console

1. [reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin) 접속
2. 등록한 사이트 선택
3. **Analytics** 확인:
   - 요청 수
   - 점수 분포
   - 차단된 요청
   - 시간대별 트래픽

### 로그 확인

**Frontend (브라우저 콘솔)**:
```
✅ reCAPTCHA 로드 완료
✅ reCAPTCHA 토큰 생성 완료 (action: report_submit)
```

**Backend (서버 콘솔)**:
```
✅ reCAPTCHA 검증 성공 (점수: 0.9, 액션: report_submit)
⚠️ reCAPTCHA 점수가 낮습니다: 0.3 (최소: 0.5)
```

## 비용

Google reCAPTCHA v3는 **무료**입니다:

- **무료**: 월 1,000,000 요청까지
- **초과 시**: Google에 연락하여 협의

**비용 절약 팁**:
- 필요한 곳에만 적용
- 개발 환경에서는 점수 검증 완화
- Rate Limiting과 병행 사용

## 문제 해결

### reCAPTCHA 스크립트 로드 실패
- 네트워크 연결 확인
- 도메인 승인 확인
- 브라우저 콘솔 에러 확인

### 토큰 검증 실패
- Site Key와 Secret Key 확인
- 키가 올바른 환경에 설정되었는지 확인
- 도메인이 reCAPTCHA Console에 등록되었는지 확인

### 점수가 항상 낮게 나옴
- 테스트 환경에서는 점수가 낮을 수 있음
- 실제 사용자 행동 패턴 필요
- 점수 기준을 낮춰서 테스트

### 프로덕션에서 작동하지 않음
- 도메인이 reCAPTCHA Console에 등록되었는지 확인
- HTTPS 사용 확인 (프로덕션에서는 필수)
- 환경변수가 올바르게 설정되었는지 확인

## 다음 단계

1. ✅ 점수별 처리 로직 세분화
   - 0.7 이상: 즉시 통과
   - 0.5 ~ 0.7: 추가 검증
   - 0.5 미만: 차단

2. ✅ 모니터링 대시보드 구축
   - 시간대별 차단 통계
   - 점수 분포 그래프
   - 의심스러운 IP 추적

3. ✅ 사용자 피드백 개선
   - 차단 시 친절한 안내 메시지
   - 재시도 옵션 제공
   - 고객 지원 연락처

4. ✅ 점수 로깅 및 분석
   - 점수별 성공/실패 비율
   - 시간대별 평균 점수
   - 이상 패턴 탐지

## 보안 계층 요약

```
사용자 제보 요청
    ↓
[1. Firebase 인증] → 실패 시 401 에러
    ↓
[2. 전화번호 인증] → 실패 시 403 에러
    ↓
[3. reCAPTCHA v3 검증] → 점수 낮으면 403 에러
    ↓
[4. Rate Limiting] → 초과 시 429 에러
    ↓
[5. 데이터 검증] → 실패 시 400 에러
    ↓
✅ 제보 등록 성공
```

## 참고 자료

- [Google reCAPTCHA v3 문서](https://developers.google.com/recaptcha/docs/v3)
- [reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
- [Best Practices](https://developers.google.com/recaptcha/docs/faq)
- [점수 해석 가이드](https://developers.google.com/recaptcha/docs/v3#interpreting_the_score)

## 라이선스 및 약관

Google reCAPTCHA 사용 시 다음 사항을 준수해야 합니다:

1. ✅ reCAPTCHA 배지 표시 (또는 개인정보 정책에 명시)
2. ✅ [Google 개인정보 보호정책](https://policies.google.com/privacy) 링크
3. ✅ [Google 서비스 약관](https://policies.google.com/terms) 링크

**권장 표시 방법**:
```
이 사이트는 reCAPTCHA로 보호되며 Google 개인정보 보호정책 및 서비스 약관이 적용됩니다.
```
