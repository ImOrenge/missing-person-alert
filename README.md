# 실시간 실종자 재난 알림 웹앱

경찰청 공공데이터 API를 활용한 실시간 실종자 정보 알림 시스템

## 🏗️ 아키텍처

```
[경찰청 API] ←─ 폴링(10-60초) ─← [Node.js 백엔드] ─ WebSocket ─→ [React 프론트엔드]
    (REST)                           (Express + WS)              (@vis.gl/react-google-maps)
```

## 🚀 시작하기

### 1. API 키 발급

#### 경찰청 API
1. [공공데이터포털](https://www.data.go.kr) 회원가입
2. [실종경보정보 서비스](https://www.data.go.kr/data/3051810/openapi.do) 활용신청
3. 승인 후 서비스 키 발급

#### Google Maps API
1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. Maps JavaScript API 활성화
3. API 키 생성
4. Map ID 생성 (Advanced Markers 사용)

### 2. 백엔드 설정

```bash
cd backend
npm install
cp .env.example .env
# .env 파일에 API 키 입력
npm run dev
```

### 3. 프론트엔드 설정

```bash
cd frontend
npm install
cp .env.example .env
# .env 파일에 API 키 입력
npm start
```

## 📦 주요 기능

- ✅ 실시간 실종자 정보 푸시 알림
- ✅ Google Maps 기반 위치 시각화
- ✅ 지역/유형/기간별 필터링
- ✅ 마커 클러스터링 (대량 데이터 최적화)
- ✅ 브라우저 알림 + 알림음
- ✅ 실종자 제보 기능
- ✅ PWA 지원 (오프라인, 홈 화면 추가)
- ✅ 반응형 디자인 (모바일 최적화)

## 🛠️ 기술 스택

### 백엔드
- Node.js + Express
- WebSocket (ws)
- axios (HTTP 클라이언트)
- node-cron (스케줄러)

### 프론트엔드
- React + TypeScript
- @vis.gl/react-google-maps
- Zustand (상태 관리)
- react-use-websocket
- react-toastify

## 📄 라이센스

MIT License
