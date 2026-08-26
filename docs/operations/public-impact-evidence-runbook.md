# Public Impact 월별 증거팩 운영 절차

## 선행 조건

- 해당 월 `impact_monthly_drafts/{month}`의 `rawMonthlyValidated=true`
- 데이터 품질 이상치 검토 완료
- admin이 사유를 기록해 공개 승인
- `impact_monthly/{month}`가 `published=true`, `review.state=approved`

## 생성 순서

1. 공개 snapshot을 `impact-summary.json`으로 내보낸다.
2. 같은 월 BigQuery 집계 쿼리를 다시 실행해 이벤트별 count만 `bigquery-raw-counts.json`에 내보낸다. 사용자 식별자는 내보내지 않는다.
3. snapshot의 `aggregation.queryVersion`을 `bigquery-query-version.txt`에 기록한다.
4. 해당 월 source 상태와 sync run 요약을 내부 식별자·민감값 없이 내보낸다.
5. `/statistics`, `/impact`의 공개 화면을 같은 승인 월 기준으로 캡처한다.
6. 열린/해결/무시 이슈와 정정 내역을 `data-quality-summary.md`에 요약한다.
7. 공개 승인 상태·시각·감사로그 연결키를 `approval-record.json`에 기록한다. actor UID는 Git 증거팩에 넣지 않는다.
8. `node scripts/validate-impact-evidence.mjs <folder>`를 통과시킨다.
9. 공개 보고서 수치와 JSON 원장을 항목별로 전수 대조한다.

## 제출 가능 판정

- 3개 연속 월 모두 검증 통과
- 이벤트·방법론 버전의 변화가 있으면 기간 비교에서 명시
- 노출 횟수와 추정 사용자를 실제 시민 수로 표현하지 않음
- CTA 클릭과 실제 제보를 구분
- 발견 기여는 제3자 확인 증거가 없으면 주장하지 않음
- 종결·정정 사례의 비공개/수정 이력이 연결됨

현재 저장소에는 실제 승인 월 증거가 없으므로 Phase 06은 `준비 완료`, `제출 준비 완료`는 아니다.
