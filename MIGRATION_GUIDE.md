# reCAPTCHA 통합 마이그레이션 가이드

이 문서는 기존 프로젝트에 Google reCAPTCHA v3 자동입력 방지 시스템을 통합하는 단계별 가이드입니다.

## 📋 목차

1. [사전 준비](#사전-준비)
2. [Google reCAPTCHA 설정](#google-recaptcha-설정)
3. [환경변수 설정](#환경변수-설정)
4. [의존성 확인](#의존성-확인)
5. [코드 변경사항](#코드-변경사항)
6. [테스트 및 검증](#테스트-및-검증)
7. [프로덕션 배포](#프로덕션-배포)
8. [문제 해결](#문제-해결)

---

## 사전 준비

### 필요한 계정 및 권한

- ✅ Google 계정 (reCAPTCHA 등록용)
- ✅ Firebase 프로젝트 (이미 설정됨)
- ✅ 프로젝트 저장소 접근 권한

### 예상 소요 시간

- **개발 환경 설정**: 15분
- **코드 통합**: 이미 완료됨
- **테스트**: 10분
- **프로덕션 배포**: 5분

---

## Google reCAPTCHA 설정

### 1. reCAPTCHA 사이트 등록

1. **Google reCAPTCHA Admin Console 접속**
   - URL: https://www.google.com/recaptcha/admin
   - Google 계정으로 로그인

2. **새 사이트 만들기**
   - 우측 상단 **+ 버튼** 클릭

3. **사이트 정보 입력**
   ```
   라벨: missing-person-alert
   reCAPTCHA 유형: reCAPTCHA v3
   도메인:
     - localhost (개발용)
     - your-production-domain.com (프로덕션용)
   ```

4. **약관 동의 및 제출**
   - reCAPTCHA 서비스 약관 동의
   - **제출** 클릭

### 2. 키 정보 저장

등록이 완료되면 두 개의 키를 받게 됩니다:

```
사이트 키 (Site Key): 6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
비밀 키 (Secret Key): 6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

⚠️ **중요**: 이 키들을 안전하게 보관하세요. 특히 비밀 키는 절대 공개하지 마세요!

---

## 환경변수 설정

### Frontend 환경변수

1. **파일 확인**: `frontend/.env`
2. **환경변수 추가**:

```bash
# frontend/.env

# 기존 환경변수들...
REACT_APP_GOOGLE_MAPS_API_KEY=your_existing_key
REACT_APP_MAP_ID=your_existing_map_id
REACT_APP_WS_URL=ws://localhost:8080
REACT_APP_API_URL=http://localhost:3000

# Firebase 설정 (기존)
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id

# ⭐ 새로 추가: reCAPTCHA Site Key
REACT_APP_RECAPTCHA_SITE_KEY=6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Backend 환경변수

1. **파일 확인**: `backend/.env` (또는 `backend/.Env`)
2. **환경변수 추가**:

```bash
# backend/.env

# 기존 환경변수들...
DATA_GO_KR_API_KEY=your_data_go_kr_service_key
SAFETY_DATA_API_KEY=your_safetydata_go_kr_service_key
SAFE_182_API_KEY=your_safe_182_api_key
PORT=3000
WS_PORT=8080

# Firebase 설정 (기존)
FIREBASE_PROJECT_ID=your_firebase_project_id

# ⭐ 새로 추가: reCAPTCHA 설정
RECAPTCHA_SECRET_KEY=6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
RECAPTCHA_MIN_SCORE=0.5

# 환경 설정
NODE_ENV=development
```

### 환경변수 검증

설정 후 다음 명령으로 확인:

```bash
# Frontend
cd frontend
npm start
# 콘솔에서 "⚠️ reCAPTCHA 사이트 키가 설정되지 않았습니다" 에러가 없어야 함

# Backend
cd backend
npm start
# 서버 시작 확인
```

---

## 의존성 확인

### Frontend 의존성

**필요한 패키지들** (이미 설치됨):
```json
{
  "firebase": "^12.3.0",
  "react-toastify": "^10.0.4",
  "typescript": "^4.9.5"
}
```

✅ **추가 설치 불필요** - reCAPTCHA는 CDN으로 자동 로드됩니다.

### Backend 의존성

**필요한 패키지들** (이미 설치됨):
```json
{
  "axios": "^1.6.7",
  "firebase-admin": "^13.5.0",
  "express": "^4.18.2"
}
```

✅ **추가 설치 불필요** - 모든 의존성이 이미 설치되어 있습니다.

---

## 코드 변경사항

### ✅ 이미 구현된 파일들

다음 파일들이 이미 생성/수정되었습니다:

#### Frontend

1. **`frontend/src/utils/recaptcha.ts`** (신규)
   - reCAPTCHA 스크립트 로드
   - 토큰 생성 함수
   - 배지 관리

2. **`frontend/src/components/ReportModal.tsx`** (수정)
   - reCAPTCHA 통합
   - 보안 안내 UI 추가
   - 제출 시 토큰 검증

3. **`frontend/src/App.tsx`** (수정)
   - reCAPTCHA 전역 초기화

#### Backend

4. **`backend/middleware/authMiddleware.js`** (수정)
   - `verifyRecaptcha` 미들웨어 추가
   - Google API 검증 로직

5. **`backend/routes/reports.js`** (수정)
   - POST /api/reports에 reCAPTCHA 미들웨어 적용

### 변경사항 요약

| 파일 | 변경 타입 | 설명 |
|------|----------|------|
| `frontend/src/utils/recaptcha.ts` | 신규 | reCAPTCHA 유틸리티 함수 |
| `frontend/src/components/ReportModal.tsx` | 수정 | 제보 폼에 reCAPTCHA 통합 |
| `frontend/src/App.tsx` | 수정 | 전역 초기화 추가 |
| `backend/middleware/authMiddleware.js` | 수정 | 검증 미들웨어 추가 |
| `backend/routes/reports.js` | 수정 | API 라우트에 미들웨어 적용 |

---

## 테스트 및 검증

### 1. 개발 서버 실행

```bash
# Terminal 1: Backend 서버
cd backend
npm start

# Terminal 2: Frontend 서버
cd frontend
npm start
```

### 2. 브라우저 테스트

1. **브라우저 열기**: http://localhost:3000
2. **콘솔 확인** (F12):
   ```
   ✅ reCAPTCHA 전역 초기화 완료
   ```

### 3. 제보 기능 테스트

#### Step 1: 로그인
- 로그인 버튼 클릭
- Firebase 인증 완료

#### Step 2: 전화번호 인증
- 전화번호 SMS 인증 완료 (이미 구현됨)

#### Step 3: 제보 작성
1. **"실종자 제보" 버튼** 클릭
2. **제보 정보 입력**:
   ```
   이름: 테스트
   나이: 30
   성별: 남성
   지역: 서울특별시
   주소: 강남구 테헤란로 123
   ```

3. **보안 안내 확인**:
   - 🔒 보안 안내 박스가 표시되는지 확인
   - Google 정책 링크가 있는지 확인

4. **제보 제출**:
   - "제보하기" 버튼 클릭
   - 버튼 텍스트가 "제보 중..."으로 변경되는지 확인

#### Step 4: 콘솔 로그 확인

**Frontend 콘솔**:
```
✅ reCAPTCHA 로드 완료
✅ reCAPTCHA 토큰 생성 완료 (action: report_submit)
```

**Backend 콘솔**:
```
✅ reCAPTCHA 검증 성공 (점수: 0.9, 액션: report_submit)
✅ 사용자 제보 저장: 테스트 (제보자 UID: xxx, reCAPTCHA 점수: 0.9)
```

### 4. 에러 시나리오 테스트

#### 테스트 1: reCAPTCHA 키 없이 실행
```bash
# Frontend .env에서 REACT_APP_RECAPTCHA_SITE_KEY 주석 처리
# REACT_APP_RECAPTCHA_SITE_KEY=

npm start
```

**예상 결과**:
- 제보 제출 시 "reCAPTCHA가 설정되지 않았습니다" 에러

#### 테스트 2: 낮은 점수 시뮬레이션
```bash
# Backend .env에서 최소 점수를 높게 설정
RECAPTCHA_MIN_SCORE=0.9
```

**예상 결과**:
- 정상 사용자도 점수가 0.9 미만이면 차단될 수 있음

---

## 프로덕션 배포

### 1. 프로덕션 도메인 등록

1. **reCAPTCHA Console 접속**
2. 등록한 사이트 선택
3. **Settings** → **Domains**
4. 프로덕션 도메인 추가:
   ```
   your-production-domain.com
   www.your-production-domain.com
   ```

### 2. 환경변수 설정

#### Frontend (.env.production)
```bash
REACT_APP_API_URL=https://api.your-domain.com
REACT_APP_WS_URL=wss://ws.your-domain.com
REACT_APP_RECAPTCHA_SITE_KEY=your_production_site_key
NODE_ENV=production
```

#### Backend (.env.production)
```bash
RECAPTCHA_SECRET_KEY=your_production_secret_key
RECAPTCHA_MIN_SCORE=0.5
NODE_ENV=production
PORT=3000
```

### 3. 빌드 및 배포

```bash
# Frontend 빌드
cd frontend
npm run build

# Backend 배포
cd backend
# 프로덕션 서버에 코드 배포
# .env.production 파일 업로드
```

### 4. HTTPS 필수

⚠️ **프로덕션에서는 HTTPS가 필수입니다**:
- reCAPTCHA는 HTTPS에서만 정상 작동
- HTTP에서는 검증 실패 가능

---

## 문제 해결

### Q1: "reCAPTCHA 사이트 키가 설정되지 않았습니다"

**원인**: 환경변수 설정 누락

**해결방법**:
1. `frontend/.env` 파일 확인
2. `REACT_APP_RECAPTCHA_SITE_KEY` 추가
3. 개발 서버 재시작

```bash
cd frontend
npm start
```

### Q2: "reCAPTCHA 검증에 실패했습니다"

**원인**: Backend Secret Key 누락 또는 잘못된 키

**해결방법**:
1. `backend/.env` 파일 확인
2. `RECAPTCHA_SECRET_KEY` 올바른지 확인
3. reCAPTCHA Console에서 키 재확인

### Q3: "보안 검증에 실패했습니다. 다시 시도해주세요"

**원인**: reCAPTCHA 점수가 너무 낮음

**해결방법**:
1. 개발 환경에서 점수 기준 낮추기:
   ```bash
   # backend/.env
   RECAPTCHA_MIN_SCORE=0.3
   ```
2. 실제 사용자 행동 패턴 필요 (프로덕션에서는 정상 작동)

### Q4: reCAPTCHA 스크립트 로드 실패

**원인**: 네트워크 문제 또는 도메인 미등록

**해결방법**:
1. 네트워크 연결 확인
2. reCAPTCHA Console에서 도메인 등록 확인
3. 브라우저 콘솔에서 에러 확인

### Q5: "RECAPTCHA_TOKEN_MISSING" 에러

**원인**: Frontend에서 토큰 헤더 전송 누락

**해결방법**:
1. `ReportModal.tsx` 코드 확인:
   ```typescript
   headers: {
     'X-Recaptcha-Token': recaptchaToken
   }
   ```

### Q6: 프로덕션에서 작동하지 않음

**원인**: HTTPS 미사용 또는 도메인 미등록

**해결방법**:
1. HTTPS 설정 확인
2. reCAPTCHA Console에서 프로덕션 도메인 추가
3. 환경변수가 올바르게 설정되었는지 확인

---

## 체크리스트

마이그레이션이 완료되었는지 확인하세요:

### 설정
- [ ] Google reCAPTCHA 사이트 등록 완료
- [ ] Frontend `.env`에 `REACT_APP_RECAPTCHA_SITE_KEY` 추가
- [ ] Backend `.env`에 `RECAPTCHA_SECRET_KEY` 추가
- [ ] Backend `.env`에 `RECAPTCHA_MIN_SCORE` 설정

### 코드
- [ ] `frontend/src/utils/recaptcha.ts` 파일 존재
- [ ] `frontend/src/components/ReportModal.tsx` reCAPTCHA 통합
- [ ] `frontend/src/App.tsx` 전역 초기화 추가
- [ ] `backend/middleware/authMiddleware.js` 검증 미들웨어 추가
- [ ] `backend/routes/reports.js` 미들웨어 적용

### 테스트
- [ ] 개발 서버 정상 실행
- [ ] 브라우저 콘솔에서 reCAPTCHA 초기화 확인
- [ ] 제보 제출 성공
- [ ] Backend 로그에서 reCAPTCHA 점수 확인
- [ ] 보안 안내 UI 정상 표시

### 프로덕션 (해당 시)
- [ ] 프로덕션 도메인 reCAPTCHA Console에 등록
- [ ] HTTPS 설정 완료
- [ ] 프로덕션 환경변수 설정
- [ ] 프로덕션 빌드 및 배포 성공

---

## 추가 리소스

### 문서
- [CAPTCHA_SETUP.md](./CAPTCHA_SETUP.md) - reCAPTCHA 상세 설정 가이드
- [PHONE_AUTH_SETUP.md](./PHONE_AUTH_SETUP.md) - 전화번호 인증 가이드

### 외부 링크
- [Google reCAPTCHA v3 문서](https://developers.google.com/recaptcha/docs/v3)
- [reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
- [점수 해석 가이드](https://developers.google.com/recaptcha/docs/v3#interpreting_the_score)

### 지원
- 이슈 발생 시: [GitHub Issues](https://github.com/your-repo/issues)
- 질문: [GitHub Discussions](https://github.com/your-repo/discussions)

---

## 마이그레이션 완료!

축하합니다! 🎉

reCAPTCHA v3 자동입력 방지 시스템이 성공적으로 통합되었습니다.

이제 실종자 제보 시 다음 보안 계층이 적용됩니다:
1. ✅ Firebase 인증
2. ✅ 전화번호 SMS 인증
3. ✅ **reCAPTCHA v3 봇 차단** (NEW!)
4. ✅ Rate Limiting
5. ✅ 데이터 검증

---

**마지막 업데이트**: 2025-01-09
