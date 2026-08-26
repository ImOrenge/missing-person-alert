# MissingAlert Public Impact Analytics 이벤트 계약

## 목적과 범위

Phase 00은 공개 실종정보의 노출, 정상 상세조회, 공유 UI 진입, 공식 제보 경로 이동을 서로 다른 이벤트로 측정한다. 사건 ID는 브라우저의 세션 중복 방지 키에만 사용하고 Firebase Analytics payload에는 보내지 않는다.

## P0 이벤트

| 이벤트 | 발생 조건 | 허용 파라미터 | 중복 방지 |
|---|---|---|---|
| `case_impression` | active 사건 카드가 viewport 50% 이상에서 visible tab 상태로 1초 유지 | `case_category`, `sido_code`, `surface`, `source_agency` | 동일 세션·동일 사건 1회 |
| `case_view` | active 사건의 지도 상세 InfoWindow 핵심 콘텐츠가 렌더된 뒤 | `case_category`, `sido_code`, `surface`, `route_group`, `source_agency` | 동일 상세 열림 전환 1회 |
| `share_click` | SNS 채널 선택 또는 Web Share UI 호출 | `case_category`, `sido_code`, `surface`, `share_channel`, `source_agency` | 클릭 단위 |
| `report_cta_click` | 112 공식 신고 경로 클릭 | `case_category`, `sido_code`, `surface`, `route_group`, `source_agency` | 클릭 단위 |

`case_category`는 `child`, `disabled`, `dementia`, `adult`, `unknown`만 허용한다. `sido_code`는 2자리 광역 행정 코드만 허용하며 상세 주소는 보내지 않는다. 공유 채널은 `native`, `kakao`, `link`, `other`로 축약한다.

## 금지 payload

- 사건 ID, 공식 사건번호, source record key
- 이름, 사진 URL, 생년월일, 전화번호
- 상세 주소, 좌표, 자유 검색어
- 제보 내용, 사용자 UID, 관리자 UID

공통 serializer는 이벤트별 allowlist 외의 키와 유효하지 않은 enum 값을 제거한다. `events.test.ts`의 inline snapshot이 이 계약을 고정한다.

## 적용 표면

- 홈: 긴급·최근 공식 사건 카드
- 지도: 통합 탐색 목록/카드, 레거시 사이드바, 데스크톱 격자
- 검색: 공식 사건 검색 결과
- 상세: 지도 InfoWindow의 정상 active 사건
- 공식 경로: 홈과 상세의 `tel:112`

## 개발 검증

development/test 빌드는 직렬화된 이벤트를 `[PublicImpact Analytics]` 개발 로그에 JSON으로 출력한다. 로컬에서는 Analytics SDK를 기본 초기화하지 않으며, 실제 P0 전송은 다음 환경 플래그가 `true`일 때만 활성화한다.

```text
REACT_APP_PUBLIC_IMPACT_ANALYTICS_ENABLED=true
```

기존 Analytics 이벤트까지 로컬 Firebase DebugView에서 확인해야 할 때는 `REACT_APP_ANALYTICS_DEBUG_ENABLED=true`를 별도로 사용한다. production 배포 전에는 분석 동의 정책을 확정하고, Firebase DebugView에서 실제 이벤트명과 allowlist payload를 저트래픽으로 확인한다.

## 롤백

`REACT_APP_PUBLIC_IMPACT_ANALYTICS_ENABLED`를 제거하거나 `false`로 빌드하면 P0 전송만 중지된다. 카드·지도·검색·공유·112 기능 자체는 유지된다.
