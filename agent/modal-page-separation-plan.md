# 모달 화면의 개별 페이지 전환 계획

## 1. 목표

현재 `frontend/src/App.tsx`가 `showStatisticsModal`, `showMyReportsModal`, `showAdminDashboard`, `showReportModal`, `showUserProfile` 등 다수의 boolean 상태로 목적형 화면을 관리하고 있다. 이 계획은 해당 화면을 독립 URL과 브라우저 히스토리를 갖는 페이지로 전환해 다음을 달성하는 것을 목표로 한다.

- 새로고침·공유·뒤로가기에서 동일한 화면 상태 복원
- 모달 중첩과 App 셸의 상태 복잡도 축소
- 모바일/데스크톱에서 동일한 페이지 구조와 접근성 보장
- 인증·권한·딥링크를 라우트 단위로 일관되게 처리
- 기존 API, Firestore 컬렉션, Firebase Function export를 유지해 단계별 롤백 가능

## 2. 현재 구조와 기준

### 확인된 진입점

| 현재 화면 | 현재 구현 | 주요 진입점 |
|---|---|---|
| 지역 통계 | `StatisticsModal` | 대시보드 지역 통계, 지도 헤더 통계 버튼 |
| 내 제보 | `MyReportsModal` | 대시보드 메뉴, 지도 헤더 |
| 관리자 | `AdminDashboard` + 탭 | 관리자 아이콘/메뉴 |
| 실종자 제보 작성 | `ReportModal` + 위치 검색 하위 모달 | 대시보드 CTA, 지도 제보 버튼 |
| 내 정보 | `UserProfileModal` | 사용자 메뉴, 소통 피드 헤더 |
| 로그인/회원가입 | `LoginModal` | 비로그인 CTA |
| 전화번호 인증 | `PhoneAuthModal` | 로그인, 제보 전 인증, 프로필 |
| 인증 필요 안내 | `VerificationPromptModal` | 제보 시작 전 |
| 실종자 그리드 | `DesktopGridView` | 지도/대시보드의 목록 전환 |
| 공유 | `ShareModal` | 지도 마커 상세 |
| 공지 팝업/배너 | `AnnouncementPopup`, `AnnouncementBanner` | 앱 시작 및 지도 화면 |

기존 기준 문서인 `agent/modularization-plan.md`의 통계 모듈화·`App.tsx` 셸 분리 계획을 이 작업의 선행 조건으로 삼는다. 댓글·소통 데이터 계약은 `MISSING_PERSON_COMMENTS_FEATURE.md`와 현재 `CommunityFeed` 구현을 유지한다.

## 3. 권장 URL 구조

React Router 기반의 명시적 라우트로 전환한다. 현재 의존성에는 Router가 없으므로 `react-router-dom`을 추가하고 Firebase Hosting의 SPA fallback을 확인한다.

```text
/                                      대시보드
/map                                 전체 지도
/cases/grid                          실종자 그리드
/community                           전체 소통 피드
/community?personId=:id              실종자별 소통 피드
/statistics                          지역 통계
/reports/new?personId=:id            실종자 제보 작성
/reports                             내 제보 목록
/profile                             내 정보·알림 설정
/admin                               관리자 홈
/admin/reports                       사용자 제보 관리
/admin/users                         사용자 관리
/admin/statistics                    관리자 통계
/admin/announcements                 공지 관리
/admin/comment-reports               댓글 신고 관리
/auth/login?returnTo=:path           로그인/회원가입
/auth/phone?returnTo=:path            전화번호 인증
/auth/mfa?returnTo=:path              MFA 보완 인증
/legal/privacy                       개인정보 처리방침
```

### 화면 전환 원칙

- 화면 이동은 `navigate()`로 처리하고, 닫기 버튼은 `navigate(-1)`을 우선 사용한다.
- 직접 URL로 진입했을 때 이전 히스토리가 없으면 `/` 또는 안전한 부모 페이지로 이동한다.
- `returnTo`는 내부 경로만 허용하고 외부 URL은 제거해 오픈 리다이렉트를 막는다.
- `personId`, 통계 기간·패널 등 필터는 URL search parameter를 source of truth로 삼는다.
- 기존 `activeView`는 1차 전환 기간에 `/`, `/map`, `/community` 호환용으로만 유지한 뒤 제거한다.

### 사이드바 정보 구조

통계·내정보·관리자는 독립 페이지이지만 대시보드와 동일한 `AppShell` 안에서 좌측 사이드바로 이동한다. 페이지 본문을 모달처럼 띄우지 않고, 현재 선택된 메뉴와 URL을 항상 일치시킨다.

```text
실종자 안전정보
├─ 현황 대시보드       /
├─ 실종자 지도         /map
├─ 소통 피드           /community
├─ 지역 통계           /statistics
├─ 내 정보             /profile
├─ 내 제보             /reports
└─ 관리자              /admin        (관리자에게만 표시)
   ├─ 제보 관리        /admin/reports
   ├─ 사용자 관리      /admin/users
   ├─ 관리자 통계      /admin/statistics
   ├─ 공지 관리        /admin/announcements
   └─ 댓글 신고        /admin/comment-reports
```

- 데스크톱: `w-64` 수준의 sticky/fixed 사이드바 + 오른쪽 페이지 콘텐츠
- 태블릿/모바일: 햄버거 버튼으로 여는 focus-trapped drawer, 메뉴 선택 시 자동 닫힘
- 현재 메뉴는 `NavLink`의 `aria-current="page"`와 활성 색상으로 표시
- 관리자 메뉴는 클라이언트 표시 여부와 별개로 `AdminRouteGuard`와 API 권한을 모두 통과해야 함
- `/statistics`, `/profile`, `/admin/*` 직접 진입·새로고침에서도 사이드바가 유지됨
- 제보 작성은 주요 CTA로 유지하고, 내 제보는 사이드바의 일반 사용자 메뉴로 포함

## 4. 대상별 전환 설계

### 4.1 통계 페이지 — 1차 대상

기존 `StatisticsModal`의 집계 로직과 `MinimapHeatmap`을 `StatisticsPage`로 옮긴다.

- 경로: `/statistics`
- 유지할 상태: `range=day|week|month|all`, `panel=map|charts`, `region`
- 분리할 파일:
  - `frontend/src/pages/StatisticsPage.tsx`
  - `frontend/src/components/statistics/RegionBarChart.tsx`
  - `frontend/src/components/statistics/SubRegionBarChart.tsx`
  - `frontend/src/components/statistics/TrendComparisonPanel.tsx`
  - 기존 `StatisticsModal/utils.ts`는 순수 유틸리티로 유지
- 로딩·빈 데이터·부분 실패·데이터 신선도·출처 링크를 페이지 상태로 명시
- 지도에서 지역을 선택하면 URL을 갱신하고 브라우저 뒤로가기로 이전 범위를 복원
- 사이드바의 `지역 통계`를 선택하면 `/statistics`로 이동하며 통계 화면 내부의 기간·패널 선택은 본문 컨트롤로 유지

### 4.2 내 정보 페이지

`UserProfileModal`을 계정 페이지로 전환하고 프로필, 전화번호 인증, 알림 설정, 탈퇴를 섹션 또는 하위 route로 분리한다.

- 경로: `/profile`
- 인증되지 않은 사용자는 `/auth/login?returnTo=/profile`로 이동
- 기본 섹션: 프로필·닉네임, 전화번호 인증 상태, 푸시 알림, 계정 삭제
- 인증 경로: `/auth/phone?returnTo=/profile`
- 탈퇴 확인은 전체 페이지를 다시 띄우지 않고 인라인 확인 영역 또는 별도 확인 다이얼로그로 제한
- `usePushNotifications`, `deleteCurrentAccount`, Firebase `updateProfile` 호출 계약은 유지
- 사이드바의 `내 정보`를 통해 진입하며, 비로그인 상태에서는 해당 메뉴를 로그인 CTA로 표시

### 4.3 내 제보 페이지

`MyReportsModal`을 독립 목록 페이지로 전환한다.

- 경로: `/reports`
- 로그인 가드 적용, 비로그인 사용자는 로그인 후 원래 경로로 복귀
- URL 필터 권장: `status`, `page`, `sort`
- 목록·로딩·빈 상태·오류 상태를 페이지 레이아웃으로 제공
- 기존 `/api/reports/my` 인증 헤더와 응답 계약 유지
- 항목 선택 시 `/map?personId=:id` 또는 해당 제보 상세 route로 이동

### 4.4 제보 작성 페이지

`ReportModal`을 `/reports/new`로 전환한다. 실종자 선택, 기본 정보 입력, 위치 검색, 첨부, 제출 결과를 한 페이지의 단계형 폼으로 구성한다.

- 경로: `/reports/new?personId=:id`
- `LocationSearchModal`은 페이지 내부 검색 drawer/combobox로 바꾸고, 브라우저 포커스·ESC·키보드 선택을 보장
- 폼 상태는 페이지 내부에 두되 새로고침 이탈 시 입력 손실 경고를 제공
- 로그인·전화번호 인증이 필요한 경우:
  - 로그인 전: `/auth/login?returnTo=/reports/new...`
  - 전화번호 미인증: `/auth/phone?returnTo=/reports/new...`
- 기존 reCAPTCHA, Google Maps Places, 제보 API, 전화번호 인증 계약은 변경하지 않음
- 제출 성공 후 `/reports` 또는 제보 대상 지도 위치로 명시적으로 이동

### 4.5 관리자 페이지

`AdminDashboard`의 탭을 모달 내부 상태가 아닌 nested route로 전환한다.

- 경로: `/admin/*`
- `AdminRouteGuard`에서 Firebase 로그인과 `hasAdminAccess`를 모두 확인
- 공통 레이아웃: 관리자 헤더, 탭 네비게이션, 권한 상태, 모바일 메뉴, breadcrumb
- `/admin` 진입 시 관리자 전용 사이드바를 열고, 데스크톱에서는 앱 사이드바와 병합하거나 2단 구조가 되지 않도록 관리자 메뉴를 동일한 좌측 레일 안에서 확장
- 하위 페이지:
  - `/admin/reports`: `AllReportsTab`
  - `/admin/users`: `UserManagementTab`
  - `/admin/statistics`: `StatisticsTab`
  - `/admin/announcements`: `AnnouncementsTab`
  - `/admin/comment-reports`: `CommentReportsTab`
- 각 탭의 API 어댑터·테이블·상태 표시를 분리하고, 관리자 조작에는 확인·성공·실패 피드백을 제공
- 권한 오류는 대시보드로 조용히 되돌리지 말고 403 페이지와 복귀 링크를 표시

### 4.6 로그인·인증 페이지

`LoginModal` 내부에 들어 있는 로그인, 회원가입, MFA, 개인정보 안내를 화면 단위로 분리한다.

- `/auth/login`: 로그인/회원가입 전환
- `/auth/mfa`: MFA challenge 처리
- `/auth/phone`: 전화번호 입력·코드 확인
- `/legal/privacy`: 개인정보 처리방침 정적 페이지
- `VerificationPromptModal`은 제보 진입 시 `/auth/phone?reason=report&returnTo=...`로 대체
- reCAPTCHA container ID 충돌을 막기 위해 페이지 mount/unmount 시 정리 로직을 명시
- 로그인 완료 후 원래 `returnTo`로 이동하되, 허용 목록 밖 경로는 `/`로 대체

### 4.7 실종자 그리드 페이지

`DesktopGridView`를 `/cases/grid`로 전환한다.

- 검색·상태 필터·기간 필터를 URL search parameter로 보존
- 카드 클릭 시 `/map?personId=:id` 또는 `/community?personId=:id`로 이동
- 데스크톱 전용이라는 이름을 제거하고 모바일 list/grid responsive layout으로 제공
- 기존 `useEmergencyStore` 필터와 정렬 기준을 페이지 view model로 감싼다.

### 4.8 공유·공지·확인성 오버레이의 범위

목적형 조회·입력 화면은 모두 페이지로 전환한다. 반면 사용자의 현재 작업을 잠깐 보조하는 다음 UI는 기본 계획에서 transient overlay로 유지한다.

- `ShareModal`: 공유 시트/네이티브 Web Share 호출. 공유 URL 자체는 `/community`·`/map`의 canonical URL을 사용
- `AnnouncementPopup`, `AnnouncementBanner`: 시스템 공지 레이어. 공지 전체 목록·상세가 필요해지면 `/announcements`로 확장
- 삭제 확인·이탈 경고: 작은 확인 다이얼로그

이 세 항목까지 URL 페이지로 완전히 바꾸기를 원한다면 Phase 4에서 `/share/:personId`, `/announcements/:id`를 추가한다.

## 5. 공통 라우팅·레이아웃 설계

### 신규 구조

```text
frontend/src/
  app/
    router.tsx
    routeGuards.tsx
    routeTypes.ts
  layouts/
    AppShell.tsx
    AppSidebar.tsx
    PageLayout.tsx
    AdminLayout.tsx
    AuthLayout.tsx
  pages/
    DashboardPage.tsx
    MapPage.tsx
    CommunityPage.tsx
    StatisticsPage.tsx
    ReportsPage.tsx
    ReportCreatePage.tsx
    ProfilePage.tsx
    CasesGridPage.tsx
    admin/
    auth/
    legal/
  components/
    navigation/PageHeader.tsx
    navigation/Breadcrumbs.tsx
    feedback/ConfirmDialog.tsx
```

### App 셸 책임 축소

`App.tsx`에는 Firebase 초기화, 전역 인증 세션, 공지·PWA·푸시 수명주기와 Router mount만 남긴다.

- `showStatisticsModal`, `showMyReportsModal`, `showAdminDashboard`, `showReportModal`, `showUserProfile`, `showLoginModal`, `showPhoneAuth`, `showVerificationPrompt`, `showGridView` 제거
- 화면별 로딩과 에러 상태는 각 페이지에서 소유
- 전역 토스트·알림 bell·서비스 워커 이벤트는 `AppShell`에서 공통 제공
- 대시보드와 지도에서 사용하는 action은 `onOpenX` 콜백 대신 route 링크로 교체

## 6. 단계별 실행 순서

### Phase 0 — 라우팅 기반과 호환 계층

1. `react-router-dom` 추가 및 `router.tsx` 작성
2. `AppShell`, `AppSidebar`, `PageLayout`, `AdminLayout`, `AuthLayout` 구현
3. 데스크톱 고정 사이드바와 모바일 drawer의 focus trap·active route·메뉴 접기 동작 구현
4. Firebase Hosting의 `index.html` fallback, PWA service worker navigation fallback 확인
5. 기존 action callback을 새 URL로 보내는 임시 adapter 작성
6. `/`, `/map`, `/community` 기존 동작을 route로 먼저 고정

완료 조건: 기존 대시보드·지도·소통 피드의 build와 브라우저 동선이 그대로 통과한다.

### Phase 1 — 통계

1. `StatisticsModal`을 `StatisticsPage`로 이동
2. query parameter와 차트 컴포넌트 분리
3. 사이드바의 `지역 통계` 메뉴와 대시보드·지도 헤더 통계 버튼을 `<Link>`로 교체
4. 구 모달은 호환 기간 동안 route redirect만 수행

완료 조건: 통계 직접 URL, 새로고침, 뒤로가기, 모바일 swipe/차트, 빈 데이터 상태가 동일하게 작동한다.

### Phase 2 — 제보와 내 제보

1. `ReportCreatePage`와 위치 검색 drawer 구현
2. `/reports` 목록 페이지 구현
3. 인증·전화번호 미인증 redirect와 `returnTo` 처리
4. 대시보드·지도·프로필 메뉴 링크 교체

완료 조건: 제보 작성, 위치 선택, 제출, 내 제보 조회가 기존 API와 동일하게 작동하고 새로고침에도 경로가 유지된다.

### Phase 3 — 내 정보와 인증

1. `ProfilePage` 구현
2. `/auth/login`, `/auth/phone`, `/auth/mfa`, `/legal/privacy` 구현
3. 사이드바의 `내 정보` 메뉴를 로그인 상태에 따라 프로필 링크 또는 로그인 CTA로 표시
4. 로그인·프로필·제보 가드 통합
5. 기존 중첩 모달을 route navigation으로 대체

완료 조건: 로그인 전/후, 전화번호 인증 전/후, MFA 실패, 로그아웃, 탈퇴 흐름이 모두 안전한 fallback URL을 갖는다.

### Phase 4 — 관리자·그리드

1. `AdminLayout`과 nested route 구현
2. 기존 5개 관리자 탭을 페이지로 이동
3. 앱 사이드바의 `관리자` 메뉴를 관리자에게만 표시하고, 관리자 하위 메뉴를 같은 사이드바에서 확장
4. 권한 가드와 403 화면 구현
5. `CasesGridPage` 이동 및 지도/소통 딥링크 연결

완료 조건: 관리자 권한 없는 계정이 모든 `/admin/*` URL에서 차단되고, 관리자 탭 간 뒤로가기·새로고침이 유지된다.

### Phase 5 — 구 모달 제거와 정리

1. 사용하지 않는 `show*` 상태·props·import 제거
2. `*Modal` 파일을 페이지·공용 drawer·확인 dialog로 분류
3. dead code, 중복 API 호출, body scroll lock, z-index를 정리
4. 라우트/컴포넌트 문서와 README 갱신

## 7. 테스트·검증 계획

### 자동 검증

- `npm run build --prefix frontend`
- `npm run build --prefix functions`
- `git diff --check`
- 라우트 smoke: `/`, `/map`, `/community`, `/statistics`, `/reports`, `/profile`, `/admin`, `/auth/login`, `/cases/grid`

### 브라우저 시나리오

1. 대시보드 → 통계 → 기간 변경 → 새로고침 → 뒤로가기
2. 지도 → 제보 작성 → 로그인 redirect → 전화번호 인증 → `returnTo` 복귀
3. 로그인 → 내 정보 → 닉네임/푸시 설정 → 로그아웃
4. 내 제보 직접 URL 진입, 빈 목록, API 오류, 권한 없는 진입
5. 관리자 각 하위 route 직접 진입, 탭 전환, 403, 새로고침
6. 그리드 → 지도 핀 → 소통 피드 필터 이동
7. 모바일 viewport에서 헤더·breadcrumb·뒤로가기·키보드 포커스 확인
8. 데스크톱 사이드바에서 통계·내정보·관리자 메뉴의 active state와 nested route 유지 확인
9. 모바일 drawer에서 메뉴 선택 후 자동 닫힘, ESC, 바깥 영역 클릭, 포커스 복귀 확인

### 접근성·보안 체크

- 페이지마다 고유한 `h1`, document title, landmark와 skip link 제공
- route 전환 시 포커스를 페이지 제목으로 이동
- ESC로 닫는 overlay와 브라우저 뒤로가기 동작을 구분
- `returnTo` 내부 경로 검증, 관리자 route server/API 권한 재검증
- 인증 페이지에서 reCAPTCHA·Phone Auth 인스턴스 정리
- Firebase Hosting rewrite와 service worker가 새 URL 직접 진입을 가로막지 않는지 확인

## 8. 롤백 전략

- 한 Phase씩 별도 커밋하고, 기존 모달 컴포넌트는 다음 Phase 완료까지 삭제하지 않는다.
- 기존 `onOpenX` 콜백은 임시로 새 route로 보내는 adapter로 유지해 링크 진입점을 한 번에 바꿀 수 있게 한다.
- 문제가 발생하면 해당 route만 기존 모달을 렌더링하는 fallback을 유지하고, API·Firestore 스키마는 되돌리지 않는다.
- 공개 URL과 Firebase Function export, Firestore 컬렉션명은 변경하지 않는다.

## 9. 최종 완료 기준

- 목적형 모달이 모두 독립 URL 페이지로 이동한다.
- `App.tsx`의 화면 boolean 상태가 제거되고 Router가 화면 상태의 단일 기준이 된다.
- 통계·내정보·관리자는 공통 사이드바에서 진입하며, 관리자 하위 메뉴는 같은 사이드바에서 확장된다.
- 통계·내정보·관리자·제보내역·제보작성·인증 페이지가 새로고침/공유/뒤로가기에서 복원된다.
- 로그인·전화번호 인증·관리자 권한이 route guard와 API 양쪽에서 검증된다.
- 기존 지도·소통 피드·제보 API와 사용자 데이터가 손실 없이 유지된다.
- 프론트엔드/Functions 빌드와 주요 브라우저 시나리오가 통과한다.

## 10. 결정이 필요한 항목

기본 권장안은 **목적형 화면은 페이지로, 공유·공지·삭제 확인처럼 짧은 보조 상호작용은 overlay로 유지**하는 것이다. 아래까지 모두 URL 페이지로 바꿀지 구현 시작 전에 확정한다.

1. `ShareModal`을 `/share/:personId` 페이지로 만들 것인지
2. 공지 팝업을 `/announcements/:id` 상세 페이지로 확장할 것인지
3. 제보 작성에서 위치 검색을 inline drawer로 둘지 `/reports/new/location` 하위 route로 둘지
