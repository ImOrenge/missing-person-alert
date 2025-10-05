# 실종자 알림 프론트엔드

React + TypeScript 기반 실시간 실종자 정보 지도 웹앱

## 🚀 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어서 다음 값을 설정하세요:

- `REACT_APP_GOOGLE_MAPS_API_KEY`: Google Maps API 키
- `REACT_APP_MAP_ID`: Google Map ID (Advanced Markers 사용)
- `REACT_APP_WS_URL`: WebSocket 서버 URL (기본값: ws://localhost:8080)

### 3. 개발 서버 실행

```bash
npm start
```

브라우저에서 [http://localhost:3000](http://localhost:3000)이 자동으로 열립니다.

### 4. 프로덕션 빌드

```bash
npm run build
```

## 📦 주요 컴포넌트

### EmergencyMap
- Google Maps 렌더링
- 실종자 마커 표시
- InfoWindow를 통한 상세 정보 표시

### FilterPanel
- 지역별 필터링
- 유형별 필터링 (아동/장애인/치매)
- 기간별 필터링
- 실시간 통계 표시

### MarkerWithInfo
- Advanced Marker 사용
- 유형별 색상 구분
- 클릭 시 상세 정보 표시
- 112 신고 및 공유 기능

### ConnectionStatus
- WebSocket 연결 상태 실시간 표시
- 연결/연결 끊김 애니메이션

## 🔧 기술 스택

- **React 18**: UI 프레임워크
- **TypeScript**: 타입 안전성
- **@vis.gl/react-google-maps**: Google Maps 통합
- **Zustand**: 상태 관리
- **react-use-websocket**: WebSocket 연결
- **react-toastify**: 알림 UI

## 📱 기능

- ✅ 실시간 WebSocket 연결
- ✅ Google Maps 기반 위치 시각화
- ✅ 유형별 마커 색상 구분 (빨강/주황/보라)
- ✅ 지역/유형/기간별 필터링
- ✅ 토스트 알림 + 브라우저 알림
- ✅ 112 신고 버튼
- ✅ 공유하기 기능
- ✅ 반응형 디자인

## 🎨 마커 색상 가이드

- 🔴 **빨강**: 실종 아동
- 🟠 **주황**: 지적장애인
- 🟣 **보라**: 치매환자

## 🔔 알림 권한

앱 실행 시 브라우저 알림 권한을 요청합니다. 허용하시면 백그라운드에서도 실종자 알림을 받을 수 있습니다.

## 📄 라이센스

MIT License
