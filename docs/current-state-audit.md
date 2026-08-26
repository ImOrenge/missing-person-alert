# MissingAlert 현재 상태 조사

## 저장소 기본 정보

- 조사 일자: 2026-08-26 (Asia/Seoul)
- 브랜치/커밋: `main` / `f4623bb` (`origin/main`보다 2커밋 앞섬)
- 조사자: Codex
- 작업 트리: 기존 수정·미추적 파일이 있으므로 Phase 00 관련 파일만 가산적으로 변경하고, 커밋·푸시·배포는 별도 승인 전 수행하지 않는다.

## 프론트엔드

| 항목 | 현재 값 | 증거 파일 | 영향 |
|---|---|---|---|
| SPA 프레임워크 | React 18 + TypeScript | `frontend/package.json`, `frontend/src/App.tsx` | 유지 |
| 빌드 도구 | Create React App / `react-scripts` 5 | `frontend/package.json` | 기존 빌드 유지 |
| Router | 별도 라우터 패키지 없이 History API와 route contract 사용 | `frontend/src/app-routing/route-contract.ts`, `frontend/src/App.tsx` | 기존 `AppView`와 URL 계약을 확장해야 함 |
| 상태관리 | Zustand + React local state | `frontend/src/stores/emergencyStore.ts` | 유지 |
| 차트 라이브러리 | 별도 범용 차트 의존성 없음; 기존 통계 화면은 자체 컴포넌트 사용 | `frontend/package.json`, `frontend/src/components/StatisticsModal/` | Phase 02에서 새 의존성 도입 전 번들 검토 필요 |
| 지도 라이브러리 | `@vis.gl/react-google-maps`, Google Marker Clusterer | `frontend/package.json`, `frontend/src/components/EmergencyMap.tsx` | 지도 마커/InfoWindow 흐름 유지 |
| build output | `frontend/build` | `firebase.json` | 유지 |

## Firebase

| 항목 | 현재 값 | 증거 | 목표와 충돌 |
|---|---|---|---|
| Firebase SDK | Web SDK `^12.3.0` | `frontend/package.json`, `frontend/src/services/firebase.ts` | 없음 |
| Firestore region | 저장소에서 선언되지 않음 | `.firebaserc`, Firebase 설정 파일 | 콘솔 또는 배포 메타데이터에서 별도 확인 필요 |
| Functions gen/runtime/region | v2, Node.js 22, 주 리전 `asia-northeast3` | `functions/package.json`, `functions/src/index.ts` | 패키지 제안과 일치 |
| Hosting rewrites | Functions 기반 `/missing`, sitemap, RSS, guide, embed, `/api` 이후 SPA fallback | `firebase.json` | 추후 `/share/**` 추가 시 구체 rewrite를 SPA fallback 앞에 둬야 함 |
| Auth provider | Email/password, Google, 전화번호 연결, MFA 보조 흐름 | `frontend/src/services/firebase.ts` | 유지 |
| custom claims | `reportModerator`, `seniorModerator`, `agencyOperator`, `privacyOfficer`, `systemAdmin` | `frontend/src/utils/adminUtils.ts`, `firestore.rules` | 문서 예시의 admin/operator/analyst를 강제 교체하지 말고 기존 역할에 매핑해야 함 |
| Analytics | Firebase Analytics를 모듈 import 시 즉시 초기화 | `frontend/src/services/analyticsService.ts` | 지원 여부 비동기 확인과 명시적 분석 동의 게이트가 없음 |
| App Check | 프론트엔드 초기화 없음 | `frontend/src/services/`, `frontend/package.json` | 후속 보안 단계에서 점진 도입 필요 |
| BigQuery link | 저장소만으로 확인 불가 | 로컬 설정에 dataset ID 없음 | Phase 03 전에 Firebase/GCP 연결 상태를 운영 환경에서 확인해야 함 |

## 데이터 모델

### 사건 컬렉션

- 실제 경로: `missingPersons/{personId}`
- active 상태값: `active` (일부 서버 호환 경로는 `missing`, `미발견`도 active로 해석)
- resolved 상태값: 프론트엔드 타입은 `found`; 일부 레거시 관리자 통계는 `resolved`도 참조
- 공개 여부 필드: 기본 공개 read이며 SEO 공개는 `source=api`, `status=active`, `seoVisible=true` 계약을 별도 사용
- source 관련 기존 필드: `source`, `sourceLastSeenAt`, `lastSeenInAPI`, `seoVisible`, `foundReason`; 패키지의 `sourceTrace`/`visibility`/`sync` 구조는 아직 없음
- 지도 위치 정밀도: 클라이언트 `MissingPerson.location`에 위도·경도와 주소가 포함됨. Phase 01/보안 검토에서 공개 정밀도 정책을 명시해야 함

### 관리자·운영 컬렉션

- 실제 주요 경로: `stats`, `syncMetadata`, `publicReports`, `sightingReports`, `runtimeConfig`, `siteBanners`, `seoMetrics`, 보고/알림/세션 관련 내부 컬렉션
- client direct write 존재 여부: 사건 원장과 신규 제보 원본은 서버 전용이지만, 레거시 `users`, 댓글, 공지 등 일부 컬렉션은 Rules 기반 클라이언트 write가 남아 있다. 패키지 신규 내부 컬렉션은 Functions Admin SDK 전용으로 추가해야 한다.

## 주요 Route

| Route | 컴포넌트 | 데이터 접근 | 변경 위험 |
|---|---|---|---|
| `/` | `DashboardHome` | Zustand에 적재된 공식 사건, 공개 제보/내 제보 API | 홈 카드와 미니맵 계측 중복 위험 |
| `/search` | `SearchPage` | 공개 검색 API | 검색 결과 DTO는 사건 category/sido를 직접 제공하지 않으므로 안전한 fallback 필요 |
| `/map` | `ExplorePage` 또는 레거시 `Sidebar` + `EmergencyMap` | Zustand 공식 사건, 공개 제보 API | 동일 사건이 목록·카드·마커에 동시에 나타날 수 있어 세션 dedup 필수 |
| 사건 상세 | 지도 `MarkerWithInfo` InfoWindow 및 `/missing/:id` 서버 렌더 경로 | 선택된 `MissingPerson`, 조회수 API | 현재 SPA에는 별도 `/case/:id` route가 없으므로 정상 active InfoWindow 렌더를 `case_view` 기준으로 사용 |
| `/admin` | `AdminDashboard`와 V2 운영 컴포넌트 | 관리자 API + 일부 레거시 SDK 경로 | 기존 custom claim 역할과 병합 필요 |

## 기존 Analytics 이벤트

| Event | 발생 위치 | 파라미터 | 중복/PII 위험 |
|---|---|---|---|
| `page_view` | `analyticsService` | `page_name` + 임의 추가값 | generic payload 제한 없음 |
| `missing_person_view` | 딥링크 선택 처리 | `missing_person_id`, `user_type` | 사건 ID 전송 및 실제 상세 렌더 전 기록 |
| `seo_app_landing` | UTM 랜딩 처리 | `missing_person_id`, campaign/content/path | 사건 ID 전송 |
| `login` / `logout` | 인증 흐름 | provider method | 로그인 listener 재호출 시 중복 가능 |
| `filter_used` | 공통 서비스 | filter type/value | 자유 값 전송 가능 |
| `report_submitted` | 공통 서비스 | report type | P0 `report_cta_click`과 의미가 다름 |
| affiliate 광고 이벤트 | `CoupangPartnerAd` | unit/placement/creative/product | 공익 Impact 집계에서 제외해야 함 |

Analytics 초기화 시 Firebase Auth UID를 `user_id`로 설정하고 guest ID를 user property로 설정한다. 이는 P0 이벤트 payload와 별개지만 개인정보·동의 정책에서 재검토할 기존 위험으로 기록한다.

## 통합 결정

- 유지할 모듈: `analyticsService`, `MissingPerson`/Zustand 모델, `DashboardHome`, `ExploreCaseList`, `Sidebar`, `MarkerWithInfo`, 기존 route contract
- 확장할 모듈: Analytics에 P0 전용 상수·allowlist serializer·개발 검증 sink를 추가하고, 재사용 가능한 impression hook으로 카드 표면을 계측한다.
- 폐기할 중복 모듈: `missing_person_view` 사건-ID payload는 `case_view`로 대체한다. 로컬 세션 dedup 키에는 사건 ID를 사용할 수 있지만 Analytics payload에는 포함하지 않는다.
- 필요한 migration: Phase 00에는 없음
- 필요한 feature flag: `REACT_APP_PUBLIC_IMPACT_ANALYTICS_ENABLED`; 미설정 시 production에서는 꺼지고 development/test에서는 검증 가능하도록 한다.
- Phase 00 시작 전 blocking issue: 로컬 구현·테스트에는 없음. production DebugView 검증과 동의 정책 확정은 배포 전 운영 확인이 필요하다.
