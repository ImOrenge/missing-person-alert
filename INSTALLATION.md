# 🚀 설치 및 실행 가이드

## 1️⃣ 사전 준비

### Node.js 설치 확인
```powershell
node --version
npm --version
```

- Node.js가 설치되어 있지 않다면 [nodejs.org](https://nodejs.org)에서 LTS 버전을 다운로드하세요.

## 2️⃣ 프론트엔드 설치 및 실행

### 1단계: 프론트엔드 디렉토리로 이동
```powershell
cd "c:\missing person\frontend"
```

### 2단계: 의존성 설치
```powershell
npm install
```

설치되는 패키지:
- ✅ vite - 빠른 개발 서버
- ✅ react + react-dom - UI 프레임워크
- ✅ @vis.gl/react-google-maps - Google Maps
- ✅ zustand - 상태 관리
- ✅ react-use-websocket - WebSocket
- ✅ react-toastify - 알림 UI
- ✅ typescript - 타입 체크

### 3단계: 환경 변수 설정

`.env` 파일이 이미 생성되어 있습니다. 메모장으로 열어서 API 키를 입력하세요:

```powershell
notepad .env
```

입력할 내용:
```
VITE_GOOGLE_MAPS_API_KEY=여기에_발급받은_구글맵_API키_입력
VITE_MAP_ID=여기에_발급받은_맵ID_입력
VITE_WS_URL=ws://localhost:8080
```

### 4단계: 개발 서버 실행
```powershell
npm run dev
```

✅ 성공하면 브라우저가 자동으로 열립니다: `http://localhost:3000`

---

## 3️⃣ 백엔드 설치 및 실행

### 1단계: 새 PowerShell 창 열기

**중요**: 프론트엔드는 계속 실행한 상태로 **새로운 PowerShell 창**을 여세요.

### 2단계: 백엔드 디렉토리로 이동
```powershell
cd "c:\missing person\backend"
```

### 3단계: 의존성 설치
```powershell
npm install
```

설치되는 패키지:
- ✅ express - 웹 서버
- ✅ ws - WebSocket 서버
- ✅ axios - HTTP 클라이언트
- ✅ node-cron - 스케줄러
- ✅ dotenv - 환경 변수
- ✅ cors - CORS 처리

### 4단계: 환경 변수 설정

```powershell
copy .env.example .env
notepad .env
```

입력할 내용:
```
DATA_GO_KR_API_KEY=여기에_경찰청_API키_입력
SAFETY_DATA_API_KEY=여기에_행안부_API키_입력
PORT=3000
WS_PORT=8080
POLL_INTERVAL_EMERGENCY=10000
POLL_INTERVAL_GENERAL=30000
NODE_ENV=development
```

### 5단계: 서버 실행
```powershell
npm run dev
```

✅ 성공하면 다음과 같은 메시지가 표시됩니다:
```
🚀 서버 시작 완료!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 REST API: http://localhost:3000
🔌 WebSocket: ws://localhost:8080
🌍 환경: development
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 4️⃣ API 키 발급 방법

### Google Maps API 키 발급

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 새 프로젝트 생성
3. **API 및 서비스** → **라이브러리**
4. "Maps JavaScript API" 검색 후 **사용 설정**
5. **사용자 인증 정보** → **사용자 인증 정보 만들기** → **API 키**
6. API 키 복사
7. **Map ID 생성**:
   - Google Cloud Console → **Maps** → **Map Management**
   - **CREATE MAP ID** 클릭
   - Map Type: JavaScript 선택
   - Map ID 복사

### 경찰청 API 키 발급

1. [공공데이터포털](https://www.data.go.kr) 회원가입
2. [실종경보정보 서비스](https://www.data.go.kr/data/3051810/openapi.do) 페이지 접속
3. **활용신청** 클릭
4. 신청서 작성
5. **개발계정**: 자동 승인 (즉시 사용 가능)
6. 승인 후 **일반 인증키(Encoding)** 복사

---

## 5️⃣ 테스트

### 백엔드 상태 확인
브라우저에서 열기:
```
http://localhost:3000/api/status
```

### 샘플 데이터 전송 (테스트용)
```powershell
curl -X POST http://localhost:3000/api/test/send-sample
```

### 프론트엔드 확인
브라우저에서 열기:
```
http://localhost:3000
```

- ✅ 우상단에 "실시간 연결 중" 초록색 표시
- ✅ 지도가 정상적으로 로드됨
- ✅ 샘플 데이터 전송 시 알림 표시

---

## 6️⃣ 문제 해결

### 문제 1: `npm install` 실패

**해결 방법**:
```powershell
npm cache clean --force
npm install
```

### 문제 2: 포트가 이미 사용 중

**해결 방법**:
```powershell
# 3000번 포트 사용 중인 프로세스 찾기
netstat -ano | findstr :3000

# 8080번 포트 사용 중인 프로세스 찾기
netstat -ano | findstr :8080

# 프로세스 종료 (PID는 위에서 확인한 번호)
taskkill /PID <PID> /F
```

### 문제 3: WebSocket 연결 실패

1. 백엔드가 실행 중인지 확인
2. `.env` 파일의 `VITE_WS_URL` 확인
3. 방화벽 설정 확인

### 문제 4: Google Maps가 로드되지 않음

1. API 키가 올바른지 확인
2. Maps JavaScript API가 활성화되어 있는지 확인
3. 브라우저 콘솔(F12)에서 오류 메시지 확인

---

## 7️⃣ 프로덕션 빌드

### 프론트엔드 빌드
```powershell
cd "c:\missing person\frontend"
npm run build
```

빌드된 파일은 `build` 폴더에 생성됩니다.

### 백엔드 프로덕션 실행
```powershell
cd "c:\missing person\backend"
set NODE_ENV=production
npm start
```

---

## 📞 지원

문제가 계속되면 다음 정보를 포함하여 문의하세요:
- Node.js 버전 (`node --version`)
- npm 버전 (`npm --version`)
- 오류 메시지 전체 내용
- 운영체제 버전
