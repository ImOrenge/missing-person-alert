# 실종자 알림 백엔드 서버

Node.js 기반 WebSocket 서버 및 API 폴링 시스템

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

- `DATA_GO_KR_API_KEY`: [공공데이터포털](https://www.data.go.kr)에서 발급받은 API 키
- `SAFETY_DATA_API_KEY`: [재난안전데이터](https://www.safetydata.go.kr)에서 발급받은 API 키

### 3. 서버 실행

**개발 모드** (nodemon 사용):
```bash
npm run dev
```

**프로덕션 모드**:
```bash
npm start
```

## 📡 API 엔드포인트

### GET /health
서버 헬스 체크

**응답 예시**:
```json
{
  "status": "healthy",
  "uptime": 123.45,
  "connectedClients": 3,
  "timestamp": "2025-10-04T12:00:00.000Z"
}
```

### GET /api/status
서버 상태 정보

**응답 예시**:
```json
{
  "server": "running",
  "websocket": {
    "port": 8080,
    "connectedClients": 3
  },
  "polling": {
    "emergencyInterval": "10초",
    "generalInterval": "30초"
  },
  "environment": "development"
}
```

### POST /api/test/send-sample
샘플 데이터 전송 (테스트용)

**응답 예시**:
```json
{
  "success": true,
  "message": "샘플 데이터가 전송되었습니다",
  "clientCount": 3
}
```

## 🔌 WebSocket 통신

### 연결
```javascript
const ws = new WebSocket('ws://localhost:8080');
```

### 메시지 타입

#### 1. CONNECTED (서버 → 클라이언트)
연결 성공 시 전송됩니다.

```json
{
  "type": "CONNECTED",
  "message": "실시간 알림 서버에 연결되었습니다",
  "timestamp": "2025-10-04T12:00:00.000Z"
}
```

#### 2. NEW_MISSING_PERSON (서버 → 클라이언트)
새로운 실종자 정보가 감지되었을 때 전송됩니다.

```json
{
  "type": "NEW_MISSING_PERSON",
  "data": [
    {
      "id": "missing_12345",
      "name": "홍길동",
      "age": 8,
      "gender": "M",
      "location": {
        "lat": 37.5665,
        "lng": 126.9780,
        "address": "서울특별시 중구"
      },
      "photo": "https://example.com/photo.jpg",
      "description": "파란색 티셔츠 착용",
      "missingDate": "2025-10-04T10:00:00.000Z",
      "type": "missing_child",
      "status": "active"
    }
  ],
  "timestamp": "2025-10-04T12:00:00.000Z"
}
```

#### 3. NEW_EMERGENCY_MESSAGE (서버 → 클라이언트)
새로운 긴급재난문자가 감지되었을 때 전송됩니다.

```json
{
  "type": "NEW_EMERGENCY_MESSAGE",
  "data": [
    {
      "id": "emergency_12345",
      "region": "서울특별시",
      "regionCode": "11",
      "sendTime": "2025-10-04T12:00:00.000Z",
      "content": "긴급재난문자 내용",
      "disasterType": "실종자"
    }
  ],
  "timestamp": "2025-10-04T12:00:00.000Z"
}
```

#### 4. ping/pong (클라이언트 ↔ 서버)
하트비트 메시지입니다.

**클라이언트 → 서버**:
```json
{
  "type": "ping"
}
```

**서버 → 클라이언트**:
```json
{
  "type": "pong",
  "timestamp": "2025-10-04T12:00:00.000Z"
}
```

## 🔧 설정

### 환경 변수

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| PORT | 3000 | REST API 포트 |
| WS_PORT | 8080 | WebSocket 포트 |
| DATA_GO_KR_API_KEY | - | 경찰청 API 키 (필수) |
| SAFETY_DATA_API_KEY | - | 행안부 API 키 (선택) |
| POLL_INTERVAL_EMERGENCY | 10000 | 실종자 API 폴링 간격 (ms) |
| POLL_INTERVAL_GENERAL | 30000 | 재난문자 API 폴링 간격 (ms) |
| NODE_ENV | development | 환경 (development/production) |

## 📝 로그

서버 실행 시 다음과 같은 로그가 표시됩니다:

```
🔌 WebSocket 서버가 포트 8080에서 실행 중
⏰ 실종자 API 폴링 시작 (10초마다)
⏰ 재난문자 API 폴링 시작 (30초마다)

🚀 서버 시작 완료!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 REST API: http://localhost:3000
🔌 WebSocket: ws://localhost:8080
🌍 환경: development
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 🧪 테스트

샘플 데이터 전송:
```bash
curl -X POST http://localhost:3000/api/test/send-sample
```

서버 상태 확인:
```bash
curl http://localhost:3000/api/status
```
