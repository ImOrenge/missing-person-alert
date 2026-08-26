# MissingAlert Public Data Phase 03-04

## 상태

- 구현 기준일: 2026-08-26
- 범위: Impact 집계·공개 승인, 공공데이터 운영 콘솔, 역할/Rules 경계
- 외부 변경: 없음. BigQuery 연결, Firebase 배포, Firestore 실데이터 쓰기, 통계 실제 Import를 실행하지 않았다.
- 기본값: `IMPACT_AGGREGATION_ENABLED=false`, `public_impact_enabled=false`, `public_data_admin_enabled=false`

## Phase 03 — Impact 집계와 공개 화면

### 데이터 흐름

1. Firebase Analytics가 개인정보 없는 allowlist 이벤트만 기록한다.
2. `aggregateImpactDaily`가 매일 서울 시간 08:30에 D-3~D-1을 다시 조회한다.
3. 일별 결과를 `impact_daily/{YYYY-MM-DD}`에 기록한다.
4. 월별 일계 합산을 BigQuery 월 원시 집계와 대조해 `impact_monthly_drafts/{YYYY-MM}`를 만든다.
5. 원시 집계 검증이 완료된 draft만 관리자가 사유와 함께 승인할 수 있다.
6. 승인 시 공개 필드만 `impact_monthly/{YYYY-MM}`로 복제한다.
7. `/api/public/impact/monthly`와 `/impact`는 승인·공개된 월만 보여 준다.

### 집계 계약

- 집계 이벤트: `case_impression`, `case_view`, `share_click`, `report_cta_click`, `map_view`, `official_source_click`, `statistics_view`, `impact_view`
- 보조 계측: `region_filter`, `search_result_view`
- 금지: 사건 ID, 이름, 전화번호, 사진 URL, 정확 주소/좌표, 검색어 원문, 제보 내용, 관리자 UID
- 일별 재집계: Analytics export 지연을 고려해 D-3~D-1을 매번 재작성
- 월별 이용자: 일별 이용자 합산이 아니라 월 범위 `COUNT(DISTINCT user_pseudo_id)`
- 분모가 0인 파생 비율은 `0`이 아니라 `null`
- `impact_daily` 합계와 BigQuery 월 원시 집계가 다르면 `rawMonthlyValidated=false`이며 공개 승인 불가
- 이벤트 급증 또는 일계/원시 불일치는 `data_quality_issues`에 기록
- 공개 화면은 이벤트 수를 사람 수로 표현하지 않으며, 승인 월이 없으면 숫자를 만들지 않는다.

### 필수 런타임 설정

집계를 활성화하기 전에 Firebase Analytics의 BigQuery export와 아래 파라미터를 운영 환경에서 확인해야 한다.

| 항목 | 기본값 | 운영 조건 |
|---|---:|---|
| `IMPACT_AGGREGATION_ENABLED` | `false` | BigQuery 검증 완료 후에만 `true` |
| `GA4_DATASET_ID` | 빈 값 | 실제 Analytics export dataset ID |
| `BIGQUERY_LOCATION` | `asia-northeast3` | dataset 위치와 일치 |
| `IMPACT_TIME_ZONE` | `Asia/Seoul` | 공개 방법론과 일치 |
| `public_impact_enabled` | `false` | 승인 데이터와 공개 API 확인 후 활성화 |
| `REACT_APP_PUBLIC_IMPACT_ANALYTICS_ENABLED` | 미설정 | production Analytics 속성과 내부 트래픽 필터 확인 후 `true` |

집계 플래그가 꺼져 있으면 예약 함수는 BigQuery/Firestore 작업 없이 종료한다.

## Phase 04 — 공공데이터 운영 콘솔

### 역할 매핑

기존 custom claims를 유지하고 공공데이터 역할로 투영한다.

| 기존 claim | 공공데이터 역할 | 범위 |
|---|---|---|
| `systemAdmin`, `seniorModerator` | admin | 조회, Import, 품질 처리, Impact 승인/반려 |
| `agencyOperator` | operator | 조회, Import, 품질 처리 |
| `reportModerator` | analyst | 조회 전용 |
| `privacyOfficer`만 보유 | 없음 | 공공데이터 운영 접근 불가 |

새 claim을 발급하거나 기존 관리자 권한 의미를 변경하지 않는다.

### 운영 UI와 서버 경계

- UI 경로: `/admin`, `/admin/sync`, `/admin/statistics/import`, `/admin/data-quality`, `/admin/impact`, `/admin/sources`, `/admin/audit`
- 익명 사용자는 `/admin`에서 로그인 요구 화면만 본다.
- 운영 UI는 Firestore에 직접 쓰지 않는다.
- 조회는 ID token을 검증하는 `/api/v2/admin/public-data/*`를 사용한다.
- 변경은 App Check가 강제된 callable만 사용한다.
- 통계 Import는 dry-run 미리보기 후 확인 체크, 3~500자 적용 사유가 있어야 실제 적용할 수 있다.
- Impact 공개는 월 원시 집계 검증이 완료되어야 하며 admin만 승인/반려할 수 있다.
- 데이터 품질 상태 변경은 operator 이상만 가능하며 사유, actor UID, actor role, before/after를 감사로그에 남긴다.
- 응답의 원본 hash는 12자 prefix만 표시하고 오류 메시지는 길이를 제한한다.

### Firestore/Storage 경계

- 익명 공개 읽기: `impact_monthly` 중 `published=true` 및 `review.state=approved` 문서만 허용
- 공공데이터 staff 읽기: 내부 source/history/statistics/impact draft/quality/audit 컬렉션
- 클라이언트 쓰기: 모두 거부. Admin SDK를 사용하는 검증된 서버 함수만 변경
- `sync_locks`: 클라이언트 읽기/쓰기 모두 거부
- raw source snapshot: Storage의 기존 기본 거부 규칙으로 비공개

## 검증 증거

- Functions TypeScript: `npm run build` 통과
- Functions 순수 계약: public projection, statistics normalize, public-data role mapping, impact model 통과
- Frontend: 16 suites, 50 tests 통과
- Frontend production build: 통과
- 브라우저 `/impact`: 승인 월이 없을 때 KPI를 만들지 않고 검증 대기 상태를 렌더링
- 브라우저 `/admin` 익명: 운영 데이터 대신 관리자 로그인 요구 화면 렌더링

위 결과는 로컬 코드·브라우저 증거다. BigQuery export 연결, 예약 함수 실행, 실제 custom claims, App Check provider, Firestore 인덱스, 운영 배포와 운영 데이터 일치 여부는 아직 검증하지 않았다.

## 활성화·롤백

활성화는 BigQuery 연결 → dry-run 성격의 수동 원시 쿼리 대조 → 예약 집계 → draft 검토 → 공개 승인 → 공개 UI 순서로 진행한다.

문제가 있으면 다음 순서로 복구한다.

1. `IMPACT_AGGREGATION_ENABLED=false`
2. `public_impact_enabled=false`, `public_data_admin_enabled=false`
3. 잘못 공개한 `impact_monthly/{month}`는 서버에서 `published=false`로 변경
4. 마지막 검증 완료 공개 월은 유지
5. raw export와 내부 draft는 삭제하지 않고 원인 조사에 사용
