# 대형 단일 파일 모듈화 계획

## 목표

- UI, 데이터 변환, 인프라 엔드포인트의 변경 경계를 분리한다.
- 각 단계는 기존 공개 API와 화면 동작을 유지하며 독립적으로 빌드·롤백할 수 있어야 한다.
- 사용자 제보, 관리자 권한, 통계 집계처럼 위험도가 높은 흐름은 분리 전후에 동일한 검증 계약을 적용한다.

## 현재 우선 대상

| 우선순위 | 파일 | 주된 책임 | 첫 분리 경계 |
|---|---|---|---|
| 1 | `frontend/src/components/StatisticsModal/index.tsx` | 통계 모달 상태, 집계, 차트, 마크업 | 순수 집계·날짜 유틸리티와 접근성 Hook |
| 2 | `functions/src/index.ts` | Express API, 댓글, 제보, 조회수, 통계, 스케줄 작업 | 도메인별 라우터와 스케줄 핸들러 |
| 3 | `frontend/src/App.tsx` | 앱 셸, 인증, 공지, PWA, 푸시, 모달 | 인증 세션·PWA 수명주기 Hook |
| 4 | `frontend/src/components/AdminDashboard/StatisticsTab.tsx` | 관리자 통계 조회와 표현 | 데이터 어댑터와 프레젠테이션 컴포넌트 |

## 단계별 실행

### 1단계: 통계 모달

- 완료: 날짜 포맷, 범위 집계, 데이터 신선도, 모달 스크롤, reduced-motion 처리를 `StatisticsModal/utils.ts`로 이동.
- 다음: `RegionBarChart`, `SubRegionBarChart`, `TrendComparisonPanel`을 `charts/`로 이동.
- 계약: 범위별 합계와 정렬 결과, 선택된 지역, 키보드 탐색, reduced-motion 동작이 동일해야 한다.
- 검증: `npm run build --prefix frontend`와 `tests/manual/minimap-heatmap-validation.md`.

### 2단계: Firebase Functions

- `api/`, `comments/`, `reports/`, `views/`, `statistics/`, `scheduled/` 모듈로 분리한다.
- `index.ts`에는 Firebase 초기화, Express 조립, export만 남긴다.
- 인증·관리자 middleware와 Firestore 컬렉션 이름은 공용 모듈에서 단일 관리한다.
- 한 도메인씩 이동하고 각 이동 후 `npm run build --prefix functions`를 실행한다.
- 롤백 단위는 도메인별 커밋이며 함수 export 이름은 변경하지 않는다.

### 3단계: 앱 셸

- 인증 세션, 푸시 알림, 설치 프롬프트, 서비스 워커 업데이트를 각각 Hook으로 분리한다.
- 모달 open/close 상태는 화면 조립 계층에 남긴다.
- 딥링크, 로그아웃 시 FCM 토큰 분리, PWA 업데이트 새로고침을 회귀 검증한다.

### 4단계: 관리자 통계

- API 응답 정규화와 차트용 view model 생성을 UI에서 분리한다.
- 빈 데이터, 권한 오류, 로딩, 부분 실패 상태를 컴포넌트 계약으로 명시한다.

## 공통 완료 조건

- 프런트엔드와 Functions 빌드가 경고 없이 통과한다.
- 백엔드 JavaScript가 `node --check`를 통과한다.
- 공개 URL, Firebase function export 이름, Firestore 컬렉션과 필드 계약을 유지한다.
- 운영 사이트를 대상으로 하는 Playwright 테스트는 테스트 계정과 데이터 정리 정책을 확인한 뒤 실행한다.
