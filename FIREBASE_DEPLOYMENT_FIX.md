# Firebase 배포 환경 API 오류 해결 가이드

## 🔴 현재 문제

Firebase Hosting(`https://missing-person-alram.web.app`)에서 API 호출이 실패하고 있습니다.

**오류**: `⚠️ API 응답 오류: undefined`

**원인**: 프론트엔드가 백엔드 API URL을 모르고 있어서 빈 URL로 요청을 보내고 있습니다.

---

## ✅ 해결 방법

### Step 1: 백엔드 배포 (필수)

먼저 백엔드를 배포하고 URL을 얻어야 합니다.

#### Option A: Heroku
```bash
cd backend

# Heroku 앱 생성
heroku create missing-person-backend

# 환경변수 설정
heroku config:set SAFE182_ESNTL_ID=10000847
heroku config:set SAFE182_AUTH_KEY=f16ae98f22b44441
heroku config:set FIREBASE_PROJECT_ID=missing-person-alram
heroku config:set NODE_ENV=production
heroku config:set FRONTEND_URL=https://missing-person-alram.web.app

# 배포
git push heroku main
```

백엔드 URL: `https://missing-person-backend.herokuapp.com`

#### Option B: Render
1. [Render 대시보드](https://render.com)에서 **New Web Service** 클릭
2. GitHub 저장소 연결
3. 설정:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Environment Variables 추가:
   ```
   SAFE182_ESNTL_ID=10000847
   SAFE182_AUTH_KEY=f16ae98f22b44441
   FIREBASE_PROJECT_ID=missing-person-alram
   NODE_ENV=production
   FRONTEND_URL=https://missing-person-alram.web.app
   ```
5. **Create Web Service** 클릭

백엔드 URL: `https://missing-person-backend.onrender.com`

---

### Step 2: 프론트엔드 환경변수 설정

#### 2-1. `.env.production` 파일 생성

```bash
cd frontend
```

`frontend/.env.production` 파일을 생성:

```bash
# 백엔드 API URL (Step 1에서 얻은 URL로 변경)
REACT_APP_API_URL=https://missing-person-backend.herokuapp.com

# Google Maps
REACT_APP_GOOGLE_MAPS_API_KEY=AIzaSyDH8db3PpyrrArqVdfHPMxCkagLH4U9raI
REACT_APP_MAP_ID=b4a95831991f48f9423b0d8e

# Firebase
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=missing-person-alram.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=missing-person-alram

# reCAPTCHA
REACT_APP_RECAPTCHA_SITE_KEY=6Lc5_-MrAAAAAPrws4mNW7MeSgMfPfDP8hxrPhpd
```

#### 2-2. 프론트엔드 재빌드 및 배포

```bash
cd frontend

# 빌드 (환경변수가 포함됨)
npm run build

# Firebase 배포
firebase deploy --only hosting
```

---

### Step 3: 확인

배포 후 브라우저에서 확인:

1. `https://missing-person-alram.web.app` 접속
2. F12 → Console 탭 열기
3. 다음 로그 확인:
   ```
   🌐 안전드림 API 호출 시작... https://missing-person-backend.herokuapp.com/api/safe182/missing-persons
   📦 API에서 150건 수신
   ✅ 150건 변환 완료
   ```

---

## 🔧 빠른 수정 (임시)

백엔드 배포 전에 테스트하려면:

### 로컬 백엔드 사용

1. 백엔드를 로컬에서 실행:
   ```bash
   cd backend
   npm start
   ```

2. ngrok으로 외부 접근 가능하게:
   ```bash
   ngrok http 3000
   ```

3. ngrok URL을 복사: `https://abc123.ngrok.io`

4. 프론트엔드 `.env.production` 수정:
   ```bash
   REACT_APP_API_URL=https://abc123.ngrok.io
   ```

5. 재빌드 및 배포:
   ```bash
   cd frontend
   npm run build
   firebase deploy --only hosting
   ```

⚠️ **주의**: ngrok URL은 재시작 시 변경되므로 임시 테스트용입니다.

---

## 📋 체크리스트

배포 전 확인사항:

- [ ] 백엔드가 배포되었는가?
- [ ] 백엔드 환경변수가 모두 설정되었는가?
  - [ ] `SAFE182_ESNTL_ID`
  - [ ] `SAFE182_AUTH_KEY`
  - [ ] `FIREBASE_PROJECT_ID`
  - [ ] `NODE_ENV=production`
  - [ ] `FRONTEND_URL=https://missing-person-alram.web.app`
- [ ] 백엔드 `/health` 엔드포인트가 정상인가?
  - `curl https://your-backend.com/health`
- [ ] 프론트엔드 `.env.production`에 백엔드 URL이 설정되었는가?
- [ ] 프론트엔드를 재빌드 후 배포했는가?

---

## 🐛 여전히 오류가 발생한다면

### 1. 백엔드 로그 확인

**Heroku:**
```bash
heroku logs --tail --app missing-person-backend
```

**Render:**
대시보드 → Logs 탭

### 2. CORS 에러 확인

브라우저 콘솔에 CORS 에러가 보이면:

백엔드 환경변수 확인:
```bash
# Heroku
heroku config --app missing-person-backend

# 다음이 있어야 함:
FRONTEND_URL=https://missing-person-alram.web.app
```

### 3. API 직접 테스트

```bash
curl https://your-backend.com/api/safe182/missing-persons
```

정상 응답:
```json
{
  "result": "00",
  "msg": "정상",
  "totalCount": 150,
  "list": [...]
}
```

---

## 📚 참고 문서

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - 전체 배포 가이드
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - 안전드림 API 설정
