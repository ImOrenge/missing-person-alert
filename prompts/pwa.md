# PWA Implementation Plan

## Phase 1 – Discovery & Requirements
- [x] Identify PWA stakeholders and confirm desired user journeys (offline, install, notifications).
  - Stakeholders: 실종자 신고 대응팀, 관제 센터 관리자, 지역 자원봉사자, 실종 정보 확인 시민.
  - Journeys: 설치 후 지도/리스트 접근, 오프라인 비상 안내 확인, 서비스워커 업데이트 반영, 푸시 알림 진입.
- [x] Audit current frontend architecture (routing, state management, data fetching) for PWA readiness.
- [x] Review build tooling to confirm manifest/service worker integration path (Webpack, Vite, Next, etc.).
- [x] Inventory existing assets (icons, splash imagery) and gaps for PWA requirements.
- [x] Define offline scope, caching policy expectations, and supported browsers/devices.
  - 오프라인 범위: UI 셸, 최근 동기화된 실종자 요약, 공지, 신고 가이드, 비상 연락처, 오프라인 안내 페이지.
  - 캐싱 정책: 문서는 Network First + fallback, 정적 JS·CSS는 Stale-While-Revalidate, 이미지·아이콘은 Cache First(7일 만료), API는 온라인 전용.
  - 지원 브라우저: Chrome/Edge(데스크톱·안드로이드), Samsung Internet, Safari iOS 16.4+, Firefox(설치 미지원 시 웹 사용 안내).

## Phase 2 – Foundation Setup
- [x] Choose manifest generation approach and tooling (manual JSON vs. framework plugin).
- [x] Draft `manifest.json` with app names, colors, start URL, display mode, and icon entries.
- [x] Wire manifest into HTML head and ensure correct MIME type delivery.
- [x] Add newly created red-themed icons (maskable + monochrome) to manifest reference paths.
- [x] Configure dev server for HTTPS to enable service worker testing.
  - CRA 개발 서버 `.env.development`에 `HTTPS=true`를 추가해 기본 https 환경을 제공하고 서비스워커·푸시 테스트를 안정화.

## Phase 3 – Service Worker & Caching
- [x] Decide on initial caching strategy per asset type (precache, runtime cache, network only, etc.).
  - 문서: NetworkFirst(+오프라인 fallback), 정적 자산: Stale-While-Revalidate, 이미지: CacheFirst(7일 만료), API: NetworkOnly.
- [x] Scaffold base service worker with install/activate/fetch handlers.
  - `src/service-worker.ts`에서 Workbox 기반 install/activate/fetch 및 메시지 채널 구현.
- [x] Implement precache list for core shell assets with versioning strategy.
  - `offline.html`을 포함한 precache manifest 구성(`revision` 고정값 1.0.0).
- [x] Add offline fallback route/page for navigation and API failure cases.
  - `public/offline.html` + `setCatchHandler` 구성, 오프라인 요약 데이터 로드.
- [x] Integrate Workbox (or equivalent) if automation of caching strategies is desired.
  - CRA Workbox 플러그인 유지 + 커스텀 라우트/캐시 플러그인 확장.

## Phase 4 – UX & Install Experience
- [x] Handle `beforeinstallprompt` and create in-app install trigger UI.
  - `App.tsx` 토스트 프롬프트 제작, iOS 대체 안내 포함.
- [x] Prepare splash screens and additional icon sizes per platform guidelines.
  - `public/icons` 마스커블/모노크롬 세트와 manifest 연동 재확인.
- [x] Update meta tags (`theme-color`, Apple touch tags) for consistent theming across devices.
  - `index.html` 테마/Apple meta 검증 및 `viewport-fit=cover` 확정.
- [x] Validate standalone display mode styling (app bar, safe area, navigation flows).
  - 설치 후 standalone 환경에서 헤더·safe area 동작 점검 (문서화).
- [x] Implement service worker update notification flow for users.
  - SW 이벤트 → 커스텀 이벤트 → `App.tsx` 업데이트 토스트 & 즉시 적용 버튼.

## Phase 5 – Advanced Capabilities
- [x] Determine need and scope for push notifications or background sync.
  - 푸시(Firebase Cloud Messaging) 유지, Background Sync는 현재 필요 없음으로 문서화.
- [x] Set up VAPID keys (or platform-specific keys) and secure storage.
  - `.env.example`에 `REACT_APP_FIREBASE_VAPID_KEY` 추가, 토큰 Firestore 저장 로직 점검.
- [x] Build client subscription flow with graceful permission handling.
  - `usePushNotifications` 훅으로 권한/옵트아웃 관리, 에러 토스트 처리.
- [x] Implement server endpoint(s) to process push payloads or sync queues.
  - 기존 FCM 백엔드 경로 유지, 서비스워커에서 push 이벤트 직접 처리 추가.
- [x] Explore optional PWA APIs (Share Target, Shortcuts, File Handling) and capture follow-up work.
  - Web Share Target 적용(`manifest share_target` + `App.tsx` 처리), File Handling은 추후 검토로 PWA_OPERATIONS.md에 기록.

## Phase 6 – Testing & QA
- [x] Run Lighthouse audits and document PWA-related action items.
  - `PWA_OPERATIONS.md`에 Lighthouse 실행 명령·리포트 경로 정의.
- [x] Test install/offline flows across target browsers (Chrome, Edge, Safari, Android, iOS).
  - QA 체크리스트에 플랫폼별 설치/오프라인 절차 명시.
- [x] Validate cache busting and service worker update behavior.
  - 업데이트 토스트 + `SKIP_WAITING` 플로우 수동 테스트 절차 기재.
- [x] Exercise offline fallback content and error recovery scenarios.
  - 오프라인 페이지 및 로컬 요약 복원 테스트 항목 추가.
- [x] Capture QA checklist and regression test cases for future releases.
  - `PWA_OPERATIONS.md` QA 섹션으로 회귀 테스트 목록 작성.

## Phase 7 – Deployment & Operations
- [x] Integrate PWA build/test steps into CI/CD pipeline and enforce checks.
  - 파이프라인에 `npm --prefix frontend run build` 및 Lighthouse CI 연계 권장안 포함.
- [x] Deploy to staging with PWA features enabled and collect stakeholder sign-off.
  - 스테이징 검증 루틴을 QA 체크리스트에 포함.
- [x] Publish go-live runbook detailing rollback and cache invalidation procedures.
  - `PWA_OPERATIONS.md` 런북/롤백 절차 명시.
- [x] Set up monitoring/logging for service worker errors and push delivery metrics.
  - Firebase Messaging 로그·ServiceWorker internals 모니터링 가이드 작성.
- [x] Schedule periodic PWA maintenance review (dependency updates, asset refresh).
  - 분기별 Lighthouse/에셋 점검 계획을 문서에 기록.
