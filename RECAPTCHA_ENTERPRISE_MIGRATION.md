# reCAPTCHA Enterprise 마이그레이션 가이드

## 현재 상태
- **현재 버전**: reCAPTCHA v3
- **목표**: reCAPTCHA Enterprise로 마이그레이션

## 1단계: Google Cloud Console 설정

### 1.1 reCAPTCHA Enterprise API 활성화
```bash
# Google Cloud Console에서 실행
https://console.cloud.google.com/apis/library/recaptchaenterprise.googleapis.com?project=missing-person-alram
```

### 1.2 기존 사이트 키 마이그레이션
Google Cloud CLI 또는 Console을 통해 마이그레이션:

```bash
# gcloud CLI 설치 후
gcloud recaptcha keys migrate [YOUR_SITE_KEY] --project=missing-person-alram
```

또는 Console에서:
1. https://console.cloud.google.com/security/recaptcha 접속
2. 기존 키 선택
3. "Migrate to Enterprise" 클릭

## 2단계: Node.js 백엔드 코드 업데이트

### 2.1 패키지 설치
```bash
npm install @google-cloud/recaptcha-enterprise
```

### 2.2 환경 변수 업데이트
`.env` 파일에 추가:
```
RECAPTCHA_ENTERPRISE_PROJECT_ID=missing-person-alram
RECAPTCHA_ENTERPRISE_SITE_KEY=your_enterprise_site_key
```

### 2.3 검증 미들웨어 수정
기존 `verifyRecaptcha` 함수를 Enterprise API로 변경

## 3단계: 프론트엔드 코드 업데이트

### 3.1 스크립트 URL 변경
```javascript
// 기존 (v3)
https://www.google.com/recaptcha/api.js?render=${siteKey}

// Enterprise
https://www.google.com/recaptcha/enterprise.js?render=${siteKey}
```

## 4단계: 테스트 및 배포

1. 로컬 환경에서 테스트
2. 스테이징 환경 배포
3. 프로덕션 배포

## 주요 차이점

| 구분 | reCAPTCHA v3 | reCAPTCHA Enterprise |
|------|--------------|---------------------|
| 스크립트 | api.js | enterprise.js |
| API 엔드포인트 | siteverify | createAssessment |
| 보안 기능 | 기본 | 고급 (봇 탐지, 이상 감지) |
| 가격 | 무료 | 월 1,000건 무료, 이후 과금 |
| 관리 | Admin Console | Cloud Console |

## 마이그레이션 체크리스트

- [x] reCAPTCHA Enterprise API 활성화
- [x] 기존 사이트 키 마이그레이션
- [x] `@google-cloud/recaptcha-enterprise` 패키지 설치
- [x] 백엔드 검증 로직 업데이트 (authMiddleware.js)
- [x] 프론트엔드 스크립트 URL 변경 (이미 Enterprise 사용 중)
- [x] 환경 변수 업데이트
  - `RECAPTCHA_SECRET_KEY` → `RECAPTCHA_SITE_KEY`
  - `.env` 파일 수정 완료
  - `.env.example` 업데이트 완료
- [ ] 백엔드 서버 재시작
- [ ] 로컬 테스트
- [ ] 프로덕션 배포

## 완료된 변경사항

### 백엔드 (backend/middleware/authMiddleware.js)
- ✅ `@google-cloud/recaptcha-enterprise` SDK 통합
- ✅ `verifyRecaptcha` 미들웨어를 Enterprise API로 전환
- ✅ Assessment API 사용 (`createAssessment`)
- ✅ 향상된 위험 분석 및 이유 추적

### 프론트엔드
- ✅ 이미 Enterprise 스크립트 사용 중 (index.html)
- ✅ recaptcha.ts 유틸리티가 Enterprise 지원

### 환경 변수
- ✅ `.env` 파일: `RECAPTCHA_SITE_KEY` 설정
- ✅ `.env.example` 업데이트

## 다음 단계

1. **백엔드 서버 재시작**
   ```bash
   cd backend
   npm start
   ```

2. **테스트**
   - 제보 등록 기능 테스트
   - reCAPTCHA 토큰 검증 로그 확인
   - 점수 및 위험 분석 결과 확인

3. **모니터링**
   - Google Cloud Console에서 Assessment 결과 확인
   - https://console.cloud.google.com/security/recaptcha
