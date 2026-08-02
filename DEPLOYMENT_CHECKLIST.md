# 배포 환경 안전드림 API 문제 해결 가이드

## 문제 원인

배포 환경에서 안전드림 API 호출이 실패하는 주요 원인:

1. **환경변수 미설정** - `.env` 파일이 배포 환경에 없거나 환경변수가 로드되지 않음
2. **인증키 문제** - 유효하지 않은 API 인증키 사용
3. **네트워크 제한** - 배포 서버에서 외부 API 접근 차단
4. **타임아웃** - API 응답 지연

## 해결 방법

### 1. 환경변수 설정 확인

배포 플랫폼(Vercel, Heroku, AWS 등)에서 다음 환경변수를 설정해야 합니다:

```bash
SAFE182_ESNTL_ID=<your-safe182-esntl-id>
SAFE182_AUTH_KEY=<your-safe182-auth-key>
NODE_ENV=production
```

#### Vercel 환경변수 설정
1. Vercel 대시보드 → 프로젝트 선택
2. Settings → Environment Variables
3. 위 환경변수 추가 후 재배포

#### Heroku 환경변수 설정
```bash
heroku config:set SAFE182_ESNTL_ID=<your-safe182-esntl-id>
heroku config:set SAFE182_AUTH_KEY=<your-safe182-auth-key>
```

#### Firebase Functions 비밀값
```bash
firebase functions:secrets:set SAFE182_ESNTL_ID
firebase functions:secrets:set SAFE182_AUTH_KEY
```

각 명령 실행 시 값을 대화형으로 입력한 뒤 Functions를 다시 배포합니다. 실제 값은 명령 인자나 문서에 기록하지 않습니다.

### 2. 로그 확인

수정된 코드는 다음과 같은 상세 로그를 출력합니다:

```
🔑 API 인증정보가 환경변수에서 로드됨
📡 안전드림 API 요청 시작...
✅ 안전드림 API 응답 수신: result=00, msg=정상
```

에러 발생 시:
```
❌ 안전드림 API 인증정보 누락: { esntlId: false, authKey: false }
❌ 안전드림 API 호출 오류: timeout of 15000ms exceeded
   요청 실패: 응답 없음 (네트워크/타임아웃)
```

### 3. API 테스트

배포 후 다음 엔드포인트로 테스트:

```bash
# 헬스체크
curl https://your-domain.com/health

# 안전드림 API 테스트
curl https://your-domain.com/api/safe182/missing-persons
```

예상 응답:
```json
{
  "result": "00",
  "msg": "정상",
  "list": [...]
}
```

에러 응답:
```json
{
  "error": "API 인증정보 설정 필요",
  "message": "SAFE182_ESNTL_ID 및 SAFE182_AUTH_KEY 환경변수를 설정해주세요",
  "list": []
}
```

### 4. 네트워크 문제 해결

만약 외부 API 접근이 차단된다면:

#### 방화벽 화이트리스트 추가
- 안전드림 도메인: `www.safe182.go.kr`
- 포트: 443 (HTTPS)

#### 프록시 서버 사용
서버가 프록시를 통해서만 외부 접근이 가능한 경우:

```javascript
// backend/routes/api.js에 추가
const HttpsProxyAgent = require('https-proxy-agent');

const response = await axios.post(
  'https://www.safe182.go.kr/api/lcm/findChildList.do',
  params.toString(),
  {
    headers: {...},
    timeout: 15000,
    httpsAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY)
  }
);
```

### 5. 타임아웃 증가

API 응답이 느린 경우:

```javascript
// backend/routes/api.js
timeout: 30000  // 15초 → 30초
```

### 6. API 인증키 검증

안전드림 API 인증키가 유효한지 확인:
- 경찰청 안전드림 홈페이지에서 API 키 발급 상태 확인
- SAFE182에서 발급한 현재 자격 증명을 배포 플랫폼의 비밀 환경변수로 설정

## 디버깅 체크리스트

- [ ] 환경변수가 배포 플랫폼에 설정되었는가?
- [ ] 서버 로그에서 인증정보가 정상 출력되는가?
- [ ] API 요청이 전송되는가? (로그 확인)
- [ ] API 응답이 수신되는가? (result 코드 확인)
- [ ] 네트워크/방화벽 제한이 없는가?
- [ ] 타임아웃 에러가 발생하는가?

## 변경사항

- ✅ 환경변수 검증 로직 추가 (기본값 제거)
- ✅ 상세 로그 추가 (인증정보, 요청/응답 상태)
- ✅ 에러 처리 강화 (네트워크, 타임아웃, 인증 실패)
- ✅ 빈 배열 반환으로 프론트엔드 오류 방지

## 문의

문제가 지속되면 다음 정보를 확인:
1. 배포 플랫폼 서버 로그
2. 네트워크 연결 상태
3. API 키 유효성
