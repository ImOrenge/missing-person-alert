# 배포 가이드

## 개요

이 프로젝트는 **프론트엔드(React)** + **백엔드(Node.js/Express)** 구조로, 안전드림 API 호출은 백엔드를 통해 프록시됩니다.

```
사용자 브라우저
    ↓
프론트엔드 (React - Firebase Hosting/Vercel 등)
    ↓ REACT_APP_API_URL
백엔드 (Express - Heroku/Railway/Render 등)
    ↓ SAFE182_ESNTL_ID, SAFE182_AUTH_KEY
안전드림 API (www.safe182.go.kr)
```

## 1. 백엔드 배포

### 환경변수 설정 (필수)

배포 플랫폼에서 다음 환경변수를 설정:

```bash
# 안전드림 API 인증키
SAFE182_ESNTL_ID=10000847
SAFE182_AUTH_KEY=f16ae98f22b44441

# Firebase 설정
FIREBASE_PROJECT_ID=missing-person-alram
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json

# reCAPTCHA 설정
RECAPTCHA_SITE_KEY=6Lc5_-MrAAAAAPrws4mNW7MeSgMfPfDP8hxrPhpd
RECAPTCHA_MIN_SCORE=0.5

# CORS 설정 (⭐ 중요!)
# 배포된 프론트엔드 URL을 반드시 설정해야 함
ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://your-frontend.firebaseapp.com
# 또는
FRONTEND_URL=https://your-frontend.vercel.app

# 환경
NODE_ENV=production

# 서버 포트 (플랫폼에 따라 자동 설정됨)
PORT=3000
```

### Heroku 배포

```bash
# Heroku 앱 생성
heroku create your-app-name

# 환경변수 설정
heroku config:set SAFE182_ESNTL_ID=10000847
heroku config:set SAFE182_AUTH_KEY=f16ae98f22b44441
heroku config:set FIREBASE_PROJECT_ID=missing-person-alram
heroku config:set NODE_ENV=production
heroku config:set FRONTEND_URL=https://your-frontend.vercel.app

# Firebase 서비스 계정 키 업로드
# serviceAccountKey.json 파일을 Git에 포함시키거나
# Config Vars로 JSON 문자열 설정

# 배포
git push heroku main
```

### Render 배포

1. Render 대시보드에서 **New Web Service** 선택
2. GitHub 저장소 연결
3. 빌드 설정:
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
4. Environment Variables 추가 (위 환경변수 모두 설정)
5. **Create Web Service** 클릭

### Railway 배포

```bash
# Railway CLI 설치
npm install -g @railway/cli

# 프로젝트 생성 및 배포
railway login
railway init
railway up

# 환경변수 설정 (Railway 대시보드에서)
```

배포 후 **백엔드 URL**을 기록해두세요 (예: `https://your-app.herokuapp.com`)

---

## 2. 프론트엔드 배포

### 환경변수 설정 (필수)

배포 플랫폼에서 다음 환경변수를 설정:

```bash
# 백엔드 API URL (👈 가장 중요!)
REACT_APP_API_URL=https://your-backend-app.herokuapp.com

# Google Maps API
REACT_APP_GOOGLE_MAPS_API_KEY=AIzaSyDH8db3PpyrrArqVdfHPMxCkagLH4U9raI
REACT_APP_MAP_ID=b4a95831991f48f9423b0d8e

# Firebase 설정
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=missing-person-alram.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=missing-person-alram

# reCAPTCHA
REACT_APP_RECAPTCHA_SITE_KEY=6Lc5_-MrAAAAAPrws4mNW7MeSgMfPfDP8hxrPhpd

# WebSocket (선택사항)
REACT_APP_WS_URL=wss://your-backend-app.herokuapp.com
```

### Firebase Hosting 배포

```bash
# Firebase CLI 설치
npm install -g firebase-tools

# Firebase 로그인
firebase login

# 프로젝트 초기화 (이미 했다면 생략)
firebase init hosting

# 빌드
cd frontend
npm run build

# 배포
firebase deploy --only hosting
```

### Vercel 배포

```bash
# Vercel CLI 설치
npm install -g vercel

# 배포
cd frontend
vercel

# 환경변수 설정 (Vercel 대시보드)
# Settings → Environment Variables → 위 환경변수 추가
```

### Netlify 배포

1. Netlify 대시보드에서 **New site from Git** 선택
2. GitHub 저장소 연결
3. 빌드 설정:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/build`
4. Environment Variables 추가 (위 환경변수 모두 설정)
5. **Deploy site** 클릭

---

## 3. 배포 후 확인사항

### 백엔드 테스트

```bash
# 헬스체크
curl https://your-backend-app.herokuapp.com/health

# 안전드림 API 테스트
curl https://your-backend-app.herokuapp.com/api/safe182/missing-persons
```

예상 응답:
```json
{
  "result": "00",
  "msg": "정상",
  "totalCount": 150,
  "list": [...]
}
```

### 프론트엔드 테스트

1. 배포된 프론트엔드 사이트 접속
2. 브라우저 개발자 도구 → Console 확인
3. 다음 로그가 보여야 함:
   ```
   🌐 안전드림 API 호출 시작... https://your-backend-app.herokuapp.com/api/safe182/missing-persons
   📦 API에서 150건 수신
   ✅ 150건 변환 완료
   ```

### 오류 확인

콘솔에 다음과 같은 에러가 보이면:

**❌ `NetworkError` 또는 `CORS error`**
- 백엔드가 실행 중인지 확인
- `REACT_APP_API_URL`이 올바른지 확인
- 백엔드 CORS 설정 확인

**❌ `API 인증정보 설정 필요`**
- 백엔드 환경변수 `SAFE182_ESNTL_ID`, `SAFE182_AUTH_KEY` 확인

**❌ `timeout of 15000ms exceeded`**
- 백엔드 서버가 안전드림 API에 접근 가능한지 확인
- 방화벽/네트워크 정책 확인

---

## 4. 로컬 개발 vs 배포 환경

### 로컬 개발
```bash
# 프론트엔드 .env
REACT_APP_API_URL=          # 빈 문자열 (package.json proxy 사용)

# 백엔드 실행
cd backend && npm start     # http://localhost:3000

# 프론트엔드 실행
cd frontend && npm start    # http://localhost:3001
```

프론트엔드의 `/api` 요청은 `package.json`의 `"proxy": "http://localhost:3000"` 설정으로 자동으로 백엔드로 전달됩니다.

### 배포 환경
```bash
# 프론트엔드 환경변수
REACT_APP_API_URL=https://your-backend-app.herokuapp.com

# 백엔드 환경변수
SAFE182_ESNTL_ID=10000847
SAFE182_AUTH_KEY=f16ae98f22b44441
```

프론트엔드는 `REACT_APP_API_URL`에 설정된 전체 URL로 백엔드에 요청합니다.

---

## 5. 문제 해결

### 백엔드 로그 확인

**Heroku:**
```bash
heroku logs --tail --app your-app-name
```

**Render:**
대시보드 → Logs 탭

**Railway:**
대시보드 → Deployments → View Logs

### 일반적인 문제

1. **프론트엔드에서 백엔드를 찾지 못함**
   - `REACT_APP_API_URL` 환경변수 확인
   - 배포 후 재빌드 필요 (환경변수 변경 시)

2. **백엔드에서 안전드림 API 호출 실패**
   - `SAFE182_ESNTL_ID`, `SAFE182_AUTH_KEY` 환경변수 확인
   - 백엔드 로그에서 상세 에러 확인

3. **CORS 에러**
   - 백엔드 `server.js`의 CORS 설정 확인
   - 프론트엔드 도메인이 허용 목록에 있는지 확인

4. **Firebase 인증 오류**
   - Firebase 콘솔에서 승인된 도메인 추가
   - Authentication → Settings → Authorized domains

---

## 6. 보안 주의사항

- ❌ `.env` 파일을 Git에 커밋하지 마세요
- ✅ 환경변수는 배포 플랫폼의 대시보드에서 설정
- ✅ API 키는 주기적으로 갱신
- ✅ Firebase 서비스 계정 키는 안전하게 관리

---

## 도움이 필요하신가요?

문제가 지속되면 다음 정보와 함께 이슈를 등록해주세요:
1. 배포 플랫폼 (Heroku, Vercel, Firebase 등)
2. 브라우저 콘솔 에러 메시지
3. 백엔드 로그
4. 환경변수 설정 (키 값은 제외)
