# Missing Person Comments Agent Plan

## 1. 목표 및 범위
- 실종자별 댓글 시스템 구축으로 목격 정보·문의·응원 메시지 공유 채널 제공
- Firestore 기반 실시간 데이터 처리, 공감/신고 흐름, 알림 시스템 구현
- `MISSING_PERSON_COMMENTS_FEATURE.md`에 정의된 데이터 구조, UX, 보안 요구사항을 우선 적용

## 2. 단계별 구현 계획

### 단계 1. 데이터 설계 및 인프라 준비
- Firestore 컬렉션 생성: `missingPersonComments`, `commentReports`, `commentNotifications`
- 문서 스키마를 TypeScript 인터페이스로 정의하고 서버/클라이언트 공용 타입으로 관리
- 필수 색인 생성
  - `missingPersonComments`: `missingPersonId+createdAt`, `missingPersonId+type+createdAt`,
    `userId+createdAt`, `isHidden+createdAt`
  - `commentReports`: `commentId+status`
  - `commentNotifications`: `userId+isRead+createdAt`
- 보안 규칙 초안 수립: 인증 사용자만 작성 가능, 신고 누적 시 자동 숨김 조건 반영

### 단계 2. 백엔드 / 클라우드 함수
- REST/Cloud Function 엔드포인트 정의
  - 댓글 CRUD, 공감/공감 취소, 신고 접수, 신고 처리
  - 알림 발송 트리거 (댓글 작성·답글·공감)
- Rate limiting & reCAPTCHA 통합 (봇 방지)
- 관리자용 승인/숨김 처리 로직 및 Cloud Scheduler로 신고 누적 점검

### 단계 3. 프론트엔드 UI/UX
- InfoWindow 내 댓글 탭 구현 (목록, 필터, 정렬 UI)
- 댓글 작성 컴포저: 타입 선택, 익명 옵션, 글자 수 검증(10~500자)
- 댓글 카드 UI: 타입 표시, 공감 수, 답글(스레드) 노출, 신고 버튼
- 가상 스크롤 도입(댓글 다수 대비), 실시간 업데이트 구독
- 공감 애니메이션, 신고 모달, 익명 닉네임 생성 규칙 반영

### 단계 4. 알림 & 커뮤니티 관리
- `commentNotifications` 기반 UI (알림 센터, 읽음 처리)
- 사용자 차단, 신고 누적 숨김, 관리자 검토 워크플로 구축
- 악성 사용자 대응: 신고 3회 이상 자동 비공개, 반복 신고자 추적
- 공감 랭킹/정렬(최신·공감순) 구현 및 관리 페이지에 통계 집계

## 3. 보안 및 품질
- Firestore Rules: 본인 댓글만 수정/삭제, 신고는 1회/사용자 제한
- 입력 검증 & 욕설 필터링(서드파티 API or 커스텀 리스트)
- 감사 로그: 관리자 조치, 신고 처리 이력 저장
- 성능: 요청/알림 큐를 Cloud Tasks와 연동 검토, 캐싱 전략 수립

## 4. 의존 관계 및 준비 작업
- Firebase 프로젝트 역할 및 서비스 계정 권한 확인
- 프론트엔드 상태 관리(Zustand)와 새 댓글 데이터 동기화 방법 결정
- Notification UI 재사용 여부 (`AnnouncementBanner`와의 통합 검토)
- QA 계획 수립: 단위 테스트, 통합 테스트, E2E(Playwright) 시나리오 선정

## 5. 다음 단계 체크리스트
1. 스키마 및 색인 정의 확정 후 Firestore Rules 초안 작성
2. 백엔드 API 계약서(요청/응답 포맷, 에러 코드) 작성
3. 피그마/디자인 가이드 업데이트 및 컴포넌트 재사용 검토
4. 실서비스 이전에 신고/알림 트리거 모의 테스트 진행
