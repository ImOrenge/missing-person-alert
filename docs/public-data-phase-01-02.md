# MissingAlert Public Data Phase 01/02 실행 기록

## 범위와 권한 경계

- 로컬 코드, 규칙, dry-run 도구, 검증 가능한 공식 통계 seed를 additive 방식으로 구현했다.
- production Firestore/Storage 백필, 통계 import, runtime feature flag 변경, Functions/Rules/Hosting 배포는 실행하지 않았다.
- 현재 작업 트리의 기존 변경과 미추적 파일은 보존했다.

## Phase 01 — 출처 추적성

### 구현

- 신규 Safe182 수집 문서에 `schemaVersion: 2`, `sourceTrace`, `visibility`, `sync`를 기록한다.
- source record key는 SHA-256으로 비가역 변환하고 공개 API에는 포함하지 않는다.
- 변경된 원본 snapshot만 `raw/safe182/cases/{yyyy}/{mm}/...json`에 저장하도록 수집 파이프라인을 확장했다.
- `sync_runs`에 수집 결과를 기록하고, 공식 source에서 사라진 사건은 `history` 하위 문서와 함께 `found`로 전환한다.
- 공개 사건 API는 공식·active·공개 사건만 투영하고 `reportedBy`, `contentFingerprint`, `sourceRecordKey`, 내부 `sync` 값을 제거한다.
- 지도 상세 출처 카드는 feature flag로 제어하고, 레거시 문서에는 “출처 확인 중”을 표시한다.
- 기본 dry-run 백필 도구: `npm run sources:backfill:dry-run` (읽기 전용). 실제 적용은 project 확인 인자가 필요한 별도 작업이다.

### 롤백

- runtime `case_source_trace_enabled` 또는 build-time `REACT_APP_CASE_SOURCE_TRACE_ENABLED`를 끈다.
- 추가 필드는 그대로 두며 destructive migration을 하지 않는다.

## Phase 02 — 경찰청 연도별 통계 허브

### 구현

- UTF-8/CP949 CSV decode, 필수 헤더, 중복 연도, 비음수 정수, 연도 범위, 윤년, 원자료 미해제 열 합산을 검증한다.
- SHA-256 동일 파일은 Storage/통계 write를 생략한다.
- Callable `importPoliceStatistics`는 기존 custom claim(`systemAdmin`, `agencyOperator`, `seniorModerator`)과 App Check를 요구하며 기본값은 dry-run이다.
- 실제 import는 raw CSV, `statistics_yearly`, `data_sources`, `public_sources`, `sync_runs`를 한 pipeline에서 갱신한다.
- `/api/public/statistics/yearly`는 published 문서만 반환하고 내부 Storage 경로를 제거한다. 아직 게시본이 없거나 조회가 실패하면 패키지의 검증된 2021~2025 snapshot을 반환한다.
- `/statistics?year=YYYY&metric=received|unresolved`는 공식 통계 KPI, 접근 가능한 두 추이 차트, 동일 데이터 표, 해석 주의, 출처/hash prefix/방법론, 현재 사건 CTA를 제공한다.

### 기준값

- 2025 총 접수: 125,383
- 2025 취약계층 접수: 54,569
- 2025 원자료 미해제 열 합계: 878
- 2024 일평균: 366일 기준

### 롤백

- runtime `public_statistics_enabled` 또는 build-time `REACT_APP_PUBLIC_STATISTICS_ENABLED`를 끄면 기존 지역 통계 화면으로 돌아간다.
- Firestore 게시본을 비공개로 돌릴 때는 `published: false`로 변경하고 raw snapshot과 sync run은 보존한다.

## 검증 명령

```text
cd functions && npm run build
cd functions && node lib/publicMissingPersons.test.js
cd functions && node lib/statistics/normalize.test.js
cd functions && node --check scripts/backfill-source-trace.js
cd frontend && npm test -- --watchAll=false
cd frontend && npm run build
```

로컬 브라우저에서는 `/statistics`의 2025 기준값, 2024 윤년 표시, year/metric URL 보존, 출처 링크, 표, 레거시 사건의 출처 fallback을 확인했다. production provider 상태와 실제 import 결과는 배포·운영 권한을 받은 뒤 별도로 검증한다.
