# 🎉 실종자 알림 웹앱 - 최종 완성 가이드

## ✅ 완성된 기능

### 백엔드 (Node.js + Express + WebSocket)
- ✅ 경찰청 API 폴링 (10초마다)
- ✅ 긴급재난문자 API 폴링 (30초마다)
- ✅ WebSocket 서버 (실시간 푸시)
- ✅ 중복 데이터 필터링
- ✅ REST API 엔드포인트

### 프론트엔드 (React + TypeScript)
- ✅ Google Maps 통합 (@vis.gl/react-google-maps)
- ✅ 실시간 WebSocket 연결
- ✅ Zustand 상태 관리
- ✅ 지역/유형/기간별 필터링
- ✅ 실종자 제보 모달
- ✅ 토스트 + 브라우저 알림
- ✅ PWA 지원 (오프라인 모드)
- ✅ 반응형 디자인

---

## 🚀 실행 방법

### 1️⃣ 백엔드 실행

```powershell
cd "c:\missing person\backend"
npm install
npm run dev
```

**확인**:
- 콘솔에 "🚀 서버 시작 완료!" 표시
- http://localhost:3000/api/status 접속 가능

### 2️⃣ 프론트엔드 실행 (새 터미널)

```powershell
cd "c:\missing person\frontend"
```

**기존 Vite 파일 삭제** (Create React App으로 변경):
```powershell
del vite.config.ts
del index.html
del src\vite-env.d.ts
rm package-lock.json
rm -r -force node_modules
```

**재설치 및 실행**:
```powershell
npm install
npm start
```

**확인**:
- 브라우저 자동 오픈: http://localhost:3000
- 우상단 "실시간 연결 중" 초록색 표시

---

## 🔑 필수 API 키 설정

### 프론트엔드 `.env`

```powershell
notepad "c:\missing person\frontend\.env"
```

```
REACT_APP_GOOGLE_MAPS_API_KEY=발급받은_구글맵_API키
REACT_APP_MAP_ID=발급받은_맵ID
REACT_APP_WS_URL=ws://localhost:8080
```

### 백엔드 `.env`

```powershell
notepad "c:\missing person\backend\.env"
```

```
DATA_GO_KR_API_KEY=발급받은_경찰청_API키
SAFETY_DATA_API_KEY=발급받은_행안부_API키
PORT=3000
WS_PORT=8080
POLL_INTERVAL_EMERGENCY=10000
POLL_INTERVAL_GENERAL=30000
NODE_ENV=development
```

---

## 🧪 테스트 방법

### 1. 백엔드 상태 확인
```powershell
curl http://localhost:3000/api/status
```

### 2. 샘플 데이터 전송
```powershell
curl -X POST http://localhost:3000/api/test/send-sample
```

프론트엔드에 샘플 실종자가 나타나고 알림이 표시됩니다.

### 3. 기능 체크리스트

- [ ] 지도가 정상적으로 로드됨
- [ ] 우상단 "실시간 연결 중" 초록색 표시
- [ ] 샘플 데이터 전송 시 토스트 알림 표시
- [ ] 마커 클릭 시 상세 정보 표시
- [ ] 지역/유형/기간 필터 작동
- [ ] 우하단 "📝 실종자 제보" 버튼 클릭 가능
- [ ] 제보 모달에서 데이터 입력 및 제출
- [ ] 브라우저 알림 권한 요청 표시

---

## 📦 프로젝트 구조

```
c:\missing person\
├── backend/
│   ├── services/
│   │   ├── websocketManager.js    # WebSocket 서버
│   │   └── apiPoller.js            # API 폴링
│   ├── server.js                   # 메인 서버
│   ├── package.json
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── EmergencyMap.tsx    # Google Maps
│   │   │   ├── MarkerWithInfo.tsx  # 마커 + InfoWindow
│   │   │   ├── FilterPanel.tsx     # 필터 UI
│   │   │   ├── ConnectionStatus.tsx # 연결 상태
│   │   │   └── ReportModal.tsx     # 제보 모달
│   │   ├── hooks/
│   │   │   └── useEmergencyWebSocket.ts
│   │   ├── stores/
│   │   │   └── emergencyStore.ts   # Zustand
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── public/
│   │   ├── manifest.json           # PWA Manifest
│   │   └── service-worker.js       # Service Worker
│   ├── package.json
│   └── .env
└── README.md
```

---

## 🎯 주요 기능 사용법

### 1. 실종자 정보 보기
- 지도에 표시된 마커 클릭
- 빨강(아동), 주황(장애인), 보라(치매) 색상 구분
- 상세 정보 확인 후 "112 신고" 또는 "공유하기"

### 2. 필터링
- **지역**: 17개 시도 선택
- **유형**: 아동/장애인/치매 체크박스
- **기간**: 24시간/7일/30일/전체

### 3. 실종자 제보
- 우하단 "📝 실종자 제보" 버튼 클릭
- 필수 정보 입력 (이름, 나이, 실종 장소)
- "제보하기" 클릭
- 즉시 지도에 표시됨

### 4. 알림 받기
- 첫 방문 시 브라우저 알림 권한 허용
- 새 실종자 정보 수신 시:
  - 토스트 알림 (화면 우상단)
  - 브라우저 알림
  - 알림음 재생 (있는 경우)

---

## 🔧 문제 해결

### Q1: `react-scripts: command not found`

**해결**:
```powershell
cd "c:\missing person\frontend"
rm package-lock.json
rm -r -force node_modules
npm cache clean --force
npm install
```

### Q2: WebSocket 연결 실패

**확인 사항**:
1. 백엔드가 실행 중인가? (`npm run dev`)
2. 포트 8080이 사용 가능한가?
3. `.env` 파일의 `REACT_APP_WS_URL` 확인

### Q3: Google Maps가 로드되지 않음

**확인 사항**:
1. API 키가 올바른가?
2. Maps JavaScript API가 활성화되어 있는가?
3. Map ID가 올바른가?
4. 브라우저 콘솔(F12)에서 오류 확인

### Q4: 포트가 이미 사용 중

```powershell
# 3000번 포트 확인
netstat -ano | findstr :3000

# 8080번 포트 확인
netstat -ano | findstr :8080

# 프로세스 종료
taskkill /PID <PID번호> /F
```

---

## 🌐 API 키 발급 방법

### Google Maps API

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 새 프로젝트 생성
3. **API 및 서비스** → **라이브러리** → "Maps JavaScript API" 활성화
4. **사용자 인증 정보** → **API 키** 생성
5. **Map ID 생성**:
   - Maps → Map Management → CREATE MAP ID
   - Map Type: JavaScript 선택

### 경찰청 API

1. [공공데이터포털](https://www.data.go.kr) 회원가입
2. [실종경보정보 서비스](https://www.data.go.kr/data/3051810/openapi.do) 활용신청
3. **개발계정**: 자동 승인 (일일 1,000건)
4. **일반 인증키(Encoding)** 복사

---

## 📱 PWA 설치 (모바일)

### Android
1. Chrome에서 앱 접속
2. 우측 상단 ⋮ → "홈 화면에 추가"
3. 바탕화면 아이콘 생성

### iOS
1. Safari에서 앱 접속
2. 공유 버튼 → "홈 화면에 추가"
3. 바탕화면 아이콘 생성

---

## 🚀 프로덕션 배포

### 프론트엔드 빌드
```powershell
cd "c:\missing person\frontend"
npm run build
```

빌드 파일: `build/` 폴더

### 백엔드 프로덕션 실행
```powershell
cd "c:\missing person\backend"
set NODE_ENV=production
npm start
```

### 추천 배포 플랫폼
- **백엔드**: Heroku, AWS EC2, Digital Ocean, Railway
- **프론트엔드**: Vercel, Netlify, GitHub Pages
- **데이터베이스**: MongoDB Atlas, PostgreSQL (향후 확장)

---

## 📈 향후 개선 사항

1. **데이터베이스 연동** (MongoDB/PostgreSQL)
   - 실종자 데이터 영구 저장
   - 제보 이력 관리
   - 사용자 계정 시스템

2. **Geocoding API**
   - 주소 → 좌표 자동 변환
   - 정확한 위치 표시

3. **이미지 업로드**
   - AWS S3 또는 Cloudinary 연동
   - 사진 직접 업로드 기능

4. **알림 개선**
   - 푸시 알림 서버 (FCM)
   - 사용자별 알림 설정

5. **관리자 패널**
   - 제보 승인/거부
   - 통계 대시보드

---

## 📞 지원

문제가 발생하면 다음 정보를 포함하여 문의하세요:
- Node.js 버전: `node --version`
- npm 버전: `npm --version`
- 오류 메시지 전체
- 브라우저 콘솔 로그

---

## 🎉 완료!

모든 설정이 완료되었습니다!

**다음 단계**:
1. 백엔드 실행: `cd backend && npm run dev`
2. 프론트엔드 실행: `cd frontend && npm start`
3. http://localhost:3000 접속
4. API 키 입력 및 테스트

**즐거운 개발 되세요! 🚀**
