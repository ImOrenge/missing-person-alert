# MissingAlert 월간 Public Impact Report — DRAFT

- 기간: YYYY-MM
- 집계 시간대: Asia/Seoul
- 방법론 버전:
- BigQuery query version:
- 공개 snapshot ID:
- 감사로그 ID:
- 검토자: 보호 저장소 참조
- 공개일:

## 핵심 지표

| 지표 | 값 | 전월 대비 | 원장 필드 | 정의 |
|---|---:|---:|---|---|
| 실종정보 노출 |  |  | `events.caseImpressions` | 50% 이상·1초·세션 중복 제거 |
| 상세조회 |  |  | `events.caseViews` | 공개 active 상세 정상 렌더 |
| 지도 탐색 |  |  | `events.mapViews` | 지도 화면 정상 표시 |
| 정보 공유 클릭 |  |  | `events.shareClicks` | 공유 채널 선택/호출 |
| 공식정보 이동 |  |  | `events.officialSourceClicks` | 공식 원문 CTA |
| 제보 경로 이동 |  |  | `events.reportCtaClicks` | 공식 제보 CTA, 실제 제보 아님 |
| 추정 사용자 |  |  | `estimatedUsers` | 월 distinct `user_pseudo_id` 기반 추정 |
| 집계 시점 공개 사건 |  |  | `service.activeCasesPublishedEndOfMonth` | 월말 역사값이 아닌 draft 재집계 시점 snapshot |

## 검토

- [ ] BigQuery raw와 daily 대조
- [ ] daily와 monthly draft 대조
- [ ] 내부·테스트·비정상 트래픽 검토
- [ ] source freshness 검토
- [ ] 열린 데이터 품질 이슈 검토
- [ ] CTA 클릭과 실제 제보를 구분
- [ ] 발견 기여 표현 없음 또는 제3자 확인 증거 첨부

## 한계

- 노출 횟수는 고유 시민 수가 아니다.
- 공유 클릭은 외부 앱의 전송 완료를 보장하지 않는다.
- 제보 경로 이동은 실제 제보 제출이나 발견 기여를 의미하지 않는다.
