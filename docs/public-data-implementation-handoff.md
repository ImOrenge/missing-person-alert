# MissingAlert Public Data implementation handoff

## 결과

첨부 문서의 Phase 00~05 구현과 Phase 06 제출 준비 도구를 기존 Firebase/CRA 구조에 통합했다. 문서 안의 “배포”, “실데이터 Import”, “BigQuery 연결”, “SNS crawler 테스트”, “3개월 성과 제출”은 사용자의 직접적인 외부 변경 지시로 해석하지 않았으므로 실행하지 않았다.

모든 신규 공개 기능과 집계 작업은 기본 비활성이다. 기존 공개 서비스와 Firestore 실데이터를 변경하지 않는다.

## 구현 지도

| 범위 | 주요 결과 | 운영 기본값 |
|---|---|---|
| Phase 00 | P0/P1 Analytics allowlist, 노출 50%·1초·세션 중복 방지 | Analytics 전송 off |
| Phase 01 | 사건별 출처 trace/history/raw metadata, 공개 DTO, dry-run backfill | UI flag off |
| Phase 02 | 경찰청 2021~2025 연도별 통계 parser/import/API/UI | UI flag off, 검증 seed fallback |
| Phase 03 | GA4 BigQuery D-3~D-1 재집계, daily/raw 월 대조, 승인 Impact API/UI | scheduler off, UI flag off |
| Phase 04 | 기존 claim 기반 Data Health/Sync/Import/Issue/Impact/Audit 운영 UI | admin UI flag off |
| Phase 05 | `/share/**` OG Function, `/about/data`, route metadata/sitemap, App Check SDK 준비 | rewrite는 코드만 존재, 미배포 |
| Phase 06 | 월별 evidence 구조, raw 원장 대조 validator, 사례서·실증 템플릿 | 실제 수치 없음 |

상세 계약은 다음 문서에 있다.

- `docs/analytics-event-contract.md`
- `docs/public-data-phase-01-02.md`
- `docs/public-data-phase-03-04.md`
- `docs/public-data-phase-05-06.md`
- `docs/operations/public-impact-evidence-runbook.md`

## 운영 활성화 전 필수 결정

1. 실종정보 재게시·사진·성명·검색 노출 범위와 종결 비공개 시점 검토
2. Analytics 동의/개인정보처리방침과 내부·봇 트래픽 제외 기준 확정
3. Firebase Analytics BigQuery export dataset ID와 location 확인
4. Firebase App Check reCAPTCHA Enterprise provider 등록
5. custom claims 실제 계정 매핑 검토
6. Functions 서비스 계정의 Firestore/BigQuery/Storage 최소 IAM 검토
7. staging 또는 제한된 production rollout 승인

## 파라미터와 feature flags

### Functions

```text
IMPACT_AGGREGATION_ENABLED=false
GA4_DATASET_ID=
BIGQUERY_LOCATION=asia-northeast3
IMPACT_TIME_ZONE=Asia/Seoul
```

### Frontend build

```text
REACT_APP_FIREBASE_APP_CHECK_ENABLED=false
REACT_APP_FIREBASE_APP_CHECK_SITE_KEY=
REACT_APP_FIREBASE_APP_CHECK_DEBUG=false
REACT_APP_PUBLIC_IMPACT_ANALYTICS_ENABLED=false
```

### `runtimeConfig/reporting` flags

```text
case_source_trace_enabled=false
public_statistics_enabled=false
public_impact_enabled=false
public_data_admin_enabled=false
```

## 권장 활성화 순서

1. staging에서 App Check provider를 등록하고 enforcement 없이 debug/정상 token을 확인한다.
2. Rules와 Functions를 배포하되 Impact scheduler와 모든 신규 UI flag는 끈다.
3. `sources:backfill:dry-run`으로 사건별 예상 source trace 변경을 검토한다.
4. 관리자 통계 CSV dry-run으로 year/hash/warning/변경 건수를 검토한다.
5. `case_source_trace_enabled`, `public_statistics_enabled`를 순차 활성화한다.
6. Analytics production 속성·동의·내부 트래픽 필터를 확인한 뒤 `REACT_APP_PUBLIC_IMPACT_ANALYTICS_ENABLED=true` build를 배포한다.
7. 최소 D-3 export가 생긴 뒤 월 원시 쿼리와 daily 합계를 대조한다.
8. `IMPACT_AGGREGATION_ENABLED=true`로 예약 집계를 시작한다.
9. open data-quality issue가 없고 `rawMonthlyValidated=true`인 draft만 관리자 승인한다.
10. 공개 API를 확인한 뒤 `public_impact_enabled=true`로 전환한다.
11. `/share/{activeId}`와 종결/미존재 ID를 실제 Hosting에서 확인한 뒤 공유 버튼 rollout을 유지한다.
12. App Check metrics가 안정된 후 Functions enforcement 범위를 확정한다. 공개 share Function은 crawler 때문에 enforcement 대상에서 제외한다.

관리자 Import/Impact callable은 이미 `enforceAppCheck=true`다. App Check client 설정 없이 해당 Functions만 배포하지 않는다.

## 검증 명령

```powershell
npm --prefix functions run build
npm --prefix functions run test:public-projection
npm --prefix functions run test:statistics
npm --prefix functions run test:public-data-roles
npm --prefix functions run test:impact-model
npm --prefix functions run test:share-page

$env:CI='true'
npm --prefix frontend test -- --runInBand
npm --prefix frontend run build

npm run seo:check
npm run seo:kpi:test
npm run reporting:check
npm run rules:check
npm run impact:evidence:test
```

현재 로컬 결과:

- Frontend 18 suites / 54 tests 통과
- Functions TypeScript와 5개 순수 계약 통과
- Firestore/Storage Emulator 12 tests 통과
- SEO, SEO KPI, reporting, evidence 계약 통과
- Frontend production build 통과
- `git diff --check` 통과

## production에서 별도로 확인할 항목

- BigQuery export table과 `GA4_DATASET_ID`/location
- D-3~D-1 scheduler 실행·비용·late export 보정
- 실제 custom claims와 ID token refresh
- App Check valid/invalid/unknown metrics
- Firestore API의 승인 월만 공개되는지
- 카카오톡·Facebook·X OG preview와 stale cache
- 종결 사건 `/share/{id}`가 즉시 generic/no-store/noindex인지
- `/statistics`, `/impact`, `/about/data` canonical과 sitemap HTTP 200
- 운영 `sync_runs`, data-quality issue, audit 연결
- 실제 3개 연속 승인 월과 evidence validator 결과

로컬 green build는 위 production 증거를 대신하지 않는다.

## 롤백

1. 신규 UI flags를 모두 false로 전환
2. `IMPACT_AGGREGATION_ENABLED=false`
3. Analytics build flag를 false로 재배포
4. 공유 장애 시 `/share/**` rewrite 제거 후 기존 `/missing/{id}` 공유로 복귀
5. App Check 정상 사용자 차단 시 enforcement 해제
6. 잘못 승인한 Impact 월은 `published=false`; 마지막 정상 공개 월은 유지
7. 원본 snapshot, draft, sync run, audit log는 원인 분석을 위해 삭제하지 않음

## Phase 06 판정

코드와 템플릿은 준비됐지만 활용사례 “제출 준비 완료”는 아니다. 최소 3개 연속 공개 승인 월, 원장 전수 대조, 실제 정정·종결 이력, 과대 표현 검수가 쌓인 뒤에만 제출 가능으로 바꾼다.
