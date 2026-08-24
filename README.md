# 실시간 실종자 재난 알림 웹앱

경찰청 SAFE182 데이터를 수집해 실종자 정보를 지도와 목록으로 제공하고, 사용자 제보·지역 통계·푸시 알림을 지원하는 웹 애플리케이션입니다.

## 아키텍처

```text
[SAFE182 API]
      │ 5분 주기 폴링
      ▼
[Express 백엔드] ── 저장/갱신 ──▶ [Cloud Firestore]
      │                               │ 실시간 구독
      │ FCM 알림                      ▼
      └──────────────────────────▶ [React 프런트엔드]
                                      │
                                      └─ Google Maps / PWA

[Firebase Functions] ── HTTP API·일일 지역 통계 집계 ──▶ [Cloud Firestore]
```

클라이언트 데이터 동기화의 기준은 WebSocket이 아니라 Firestore `onSnapshot` 실시간 구독입니다.

## 디렉터리

- `frontend/`: React 18, TypeScript, Zustand, Google Maps 기반 사용자 UI
- `backend/`: Express API, SAFE182 폴러, Firebase Admin, FCM 발송
- `functions/`: Firebase HTTP·스케줄 함수와 지역 통계 집계
- `tests/e2e/`: 운영 환경을 대상으로 하는 Playwright E2E 시나리오
- `agent/`: 기능별 계획과 검증 기록

## 로컬 실행

Node.js 22 사용을 권장합니다. 백엔드와 프런트엔드의 실제 키는 각 `.env.example`을 복사한 로컬 `.env`에만 입력하고 커밋하지 마세요.

### 백엔드

```powershell
Set-Location backend
npm ci
Copy-Item .env.example .env
npm run dev
```

기본 REST API 주소는 `http://localhost:3000`입니다.

### 프런트엔드

```powershell
Set-Location frontend
npm ci
Copy-Item .env.example .env
npm start
```

개발 프런트엔드의 `/api` 요청은 `frontend/package.json`의 프록시 설정을 통해 로컬 백엔드로 전달됩니다.

### Firebase Functions

```powershell
Set-Location functions
npm ci
npm run build
```

## 검증

```powershell
# 프런트엔드 프로덕션 빌드
npm run build --prefix frontend

# Firebase Functions 타입 검사·빌드
npm run build --prefix functions

# E2E 테스트 - 현재 설정은 운영 사이트를 대상으로 하므로 테스트 데이터 생성에 주의
npx playwright test
```

## 주요 기능

- Firestore 실시간 구독 기반 실종자 정보 갱신
- Google Maps 위치 시각화와 지역·유형·기간 필터
- 전화번호 인증 및 reCAPTCHA가 적용된 사용자 제보
- 관리자용 제보·사용자·댓글 신고·공지 관리
- 지역 통계와 미니맵 히트맵
- Firebase Cloud Messaging 푸시 알림
- PWA 설치, 오프라인 캐시, 공유 링크

## 배포

- 프런트엔드: Firebase Hosting
- 백엔드: Render 등 Node.js 호스팅
- API·스케줄 작업: Firebase Functions

GitHub Actions는 `frontend/`의 의존성을 설치하고 프로덕션 빌드를 만든 뒤 Firebase Hosting에 배포합니다. 빌드 시 필요한 `REACT_APP_GOOGLE_MAPS_API_KEY`, `REACT_APP_MAP_ID`, `REACT_APP_RECAPTCHA_SITE_KEY` 등은 GitHub 저장소 `Settings → Secrets and variables → Actions`에 같은 이름의 Repository secret으로 등록해야 합니다. SAFE182, NAVER API HUB, Firebase Admin 자격 증명은 저장소 파일이 아니라 배포 플랫폼의 비밀 환경변수로 설정해야 합니다.

```bash
firebase functions:secrets:set SAFE182_ESNTL_ID
firebase functions:secrets:set SAFE182_AUTH_KEY
firebase functions:secrets:set NAVER_API_HUB_CLIENT_ID
firebase functions:secrets:set NAVER_API_HUB_CLIENT_SECRET
```

NAVER 뉴스는 Functions v2 `syncNaverNewsJob`이 30분마다 `실종`을 날짜순으로 검색하며, Firestore `newsArticles`에 20일간 임시 보관합니다. `cleanupExpiredNaverNewsJob`은 만료 문서를 매일 삭제합니다. 검색 결과는 `/api/news`, 대시보드 최대 5건, `/news` 목록에서만 표시하며 AI 추출·자동 사건 매칭에 사용하지 않습니다.

실종자 카드의 `NAVER 뉴스 검색`은 `/api/missing-persons/:caseId/news-search`를 호출합니다. 서버가 공식 공개 데이터의 이름·광역/기초 지역·인상착의를 정규화한 뒤 `이름 + 실종`, `이름 + 지역 + 실종`, `이름 + 인상착의 + 실종` 질의를 만들고, 중복 제거한 원본 검색결과를 `/news?caseId=...`에서 표시합니다. 기사-사건 관계·점수·검증 결과는 저장하지 않습니다. 비공개·마스킹 이름은 검색하지 않으며 계획된 NAVER 요청 수를 반영한 전체/사건별 일일 호출 한도를 적용합니다.

자세한 설정은 `DEPLOYMENT_GUIDE.md`, `DEPLOYMENT_CHECKLIST.md`, `FIREBASE_ADMIN_SETUP.md`를 참고하세요.

## 라이선스

MIT License
