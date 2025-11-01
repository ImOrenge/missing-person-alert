# PWA QA & Operations

이 문서는 실종자 알림 PWA 기능을 운영하고 검증하는 절차를 정리합니다. (Phase 5~7 대응)

## 1. 고급 기능 구성 (Phase 5)
- **푸시 알림 (FCM)**  
  - `REACT_APP_FIREBASE_VAPID_KEY` 환경 변수를 설정하고, `firebaseMessaging.ts`가 발급한 토큰을 Firestore `userTokens` 컬렉션에 저장합니다.  
  - 브라우저 권한 획득은 `usePushNotifications` 훅이 담당하며, 거부·해제 상태도 로컬에 기록됩니다.  
  - 서비스워커(`src/service-worker.ts`)는 FCM `onBackgroundMessage`와 일반 `push` 이벤트 둘 다 처리하여 백그라운드 알림을 안정적으로 표시합니다.
- **공유 타깃(Web Share Target)**  
  - `manifest.json`에 `share_target`을 정의했습니다. 외부 앱에서 텍스트/URL을 공유하면 `/?share-target=1`으로 진입하며, `App.tsx`가 토스트와 제보 모달을 열어 후속 작업을 안내합니다.
- **오프라인 캐시 범위**  
  - `offlineCache.ts`가 최근 실종자/공지 요약을 `localStorage`에 저장하여 오프라인 페이지(`public/offline.html`)와 앱 초기 로딩에 활용합니다.
- **백그라운드 싱크**  
  - 현재 사용자 제보는 즉시 전송 전략으로 충분하여 Background Sync는 보류했습니다. 필요 시 `queue` 전략을 도입할 수 있도록 서비스워커 구조를 분리해두었습니다.

### 필수 환경 변수 (.env)
- `REACT_APP_API_URL` – 백엔드 API 엔드포인트
- `REACT_APP_RECAPTCHA_SITE_KEY` – Enterprise reCAPTCHA 키
- `REACT_APP_FIREBASE_VAPID_KEY` – FCM WebPush VAPID 키
- `REACT_APP_GOOGLE_MAPS_API_KEY`, `REACT_APP_MAP_ID` – 지도/스타일 ID

## 2. QA & 테스트 체크리스트 (Phase 6)
1. **빌드 및 정적 검증**
   ```bash
   npm --prefix frontend install
   npm --prefix frontend run build
   ```
2. **Lighthouse PWA 진단**
   ```bash
   npx --yes http-server frontend/build -p 4173
   npx --yes lighthouse http://localhost:4173 --preset=pwa --output=html --output-path=./test-results/pwa-report.html
   ```
   - 결과 리포트에서 `installable`, `offline`, `best practices` 항목을 확인하고 액션 아이템을 `test-results/`에 기록합니다.
3. **오프라인 플로우**
   - Chrome DevTools → Network → Offline 상태 전환 → 지도/목록/공지 노출 확인.
   - 서비스워커 탭에서 `Update` → 앱 내 업데이트 토스트가 뜨는지 확인 후 "지금 업데이트" 버튼 테스트.
4. **설치 경험**
   - Chrome/Edge 데스크톱: `beforeinstallprompt` 토스트 → 설치 → 실행 모드(standalone) UI 검증.
   - Android Chrome: 홈 화면 추가 후 splash, 아이콘, launch handler 동작 확인.
   - iOS Safari: 공유 메뉴 → 홈 화면에 추가 안내, standalone 스타일 및 safe-area 검증.
5. **푸시 알림**
   - 권한 허용 → FCM 토큰 발급 → Firebase 콘솔 테스트 메시지 전송 → 포그라운드/백그라운드 알림 UI 확인.
   - 권한 차단/해제 케이스에서 `usePushNotifications` 상태 변화 확인.

## 3. 배포 & 운영 절차 (Phase 7)
1. **CI/CD 통합**
   - 프런트엔드 파이프라인에 `npm --prefix frontend run build` 추가.
   - 가능하다면 Lighthouse CI (`npx lhci autorun`)를 build 이후 단계에 연결해 회귀를 감시합니다.
2. **스테이징 검증**
   - 스테이징 URL에서 설치/오프라인/푸시 시나리오를 전체 수행하고 이해관계자 승인 기록을 남깁니다.
3. **런북**
   - 배포 후 캐시 불일치 발생 시:  
     1) Cloud CDN/Hosting 캐시 무효화  
     2) 서비스워커 강제 업데이트 (`clients.claim` + `skipWaiting` 메시지)  
     3) 사용자 공지(배너/푸시) 발송
   - 신규 아이콘·에셋 추가 시 `scripts/generate-pwa-icons.js` 활용 후 `manifest.json` 갱신.
4. **모니터링**
   - Firebase Console → Cloud Messaging 전송 로그
   - `chrome://serviceworker-internals`로 오류 여부 확인
   - Analytics 대시보드에서 설치/푸시 opt-in 전환율 추적
5. **정기 점검 항목**
   - 분기별로 Lighthouse 점수 기록 및 회귀 방지
   - 최근 실종자 데이터 캐시 만료 정책(7일) 검토
   - FCM VAPID 키 및 인증서 만료 일정 확인

위 절차를 통해 PWA 기능의 품질과 안정성을 지속적으로 유지할 수 있습니다.
