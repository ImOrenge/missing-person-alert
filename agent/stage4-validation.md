# Stage 4 QA Report

## 실행한 검증
- `npm run build` (frontend)
  - 결과: 빌드 성공 (샌드박스 메모리 경고는 있지만 산출물 생성 완료)
  - 확인 포인트: 관리자 대시보드 댓글 신고 탭 렌더링, 알림 벨 컴포넌트 번들 포함

## 미실행/대기 중인 검증
- 댓글 신고 → 관리자 처리 → 댓글 숨김/노출 시나리오에 대한 E2E 테스트 (`Playwright`)
  - 제약: 샌드박스 환경에서 Playwright 브라우저 설치 불가
  - 조치 필요: 로컬 또는 CI 환경에서 `npx playwright install` 후 E2E 실행
- 댓글 알림 실데이터 연동 테스트
  - 요구: `commentNotifications` 문서를 생성한 상태에서 실 브라우저 UI 확인

## 권장 후속 조치
1. Playwright 환경 구축 후 `npx playwright test --config=playwright.config.js` 재실행
2. 관리자 계정으로 신고 처리, 일반 사용자로 알림 수신을 실제 Firestore/Functions 환경에서 검증
