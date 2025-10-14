# Stage 4 테스트 플랜

## 환경 준비
- Firebase Functions + Firestore Emulator 또는 스테이징 프로젝트
- 관리자 계정(Firebase Auth)과 일반 사용자 계정 준비
- Playwright 브라우저 설치: `npx playwright install`

## 1. 자동화 (Playwright)
1. **신고 → 관리자 처리 시나리오**
   - 사용자 A: 댓글 작성 후 신고 제출 (`/api/comments/:id/report`)
   - 관리자 B: 대시보드 접속 → 댓글 신고 탭
   - 처리 버튼(숨김/유지) 클릭 → 토스트 확인 → 댓글 가시성 확인
2. **알림 수신 시나리오**
   - 사용자 A: 댓글 작성 → 사용자 B가 공감/답글
   - 사용자 A 로그인 상태에서 알림 벨 뱃지 증가 확인
   - 패널 열고 읽음 처리 → 뱃지 0으로 감소 확인

*실행 명령*
```bash
npx playwright test --config=playwright.config.js --project=chromium
```

## 2. 수동 테스트 체크리스트
| 구분 | 항목 | 기대 결과 |
|------|------|------------|
| 신고 처리 | 신고된 댓글의 숨김 버튼 클릭 | 댓글 목록에서 해당 항목 숨김 표시, 상태 “처리 완료” |
| 신고 취소 | “유지” 버튼 선택 | 상태 “처리 완료”, 댓글은 유지 |
| 재검토 | 처리 완료된 신고에서 “다시 검토” 클릭 | 상태가 `dismissed` → `pending`으로 변경 |
| 알림 | 댓글 공감/답글 발생 | 알림 벨 뱃지 + 패널에 항목 생성 |
| 알림 읽음 | 벨 클릭 후 패널 확인 | 모든 항목 배경 하얗게 변경, 뱃지 사라짐 |

## 3. 제한 사항 & 후속 작업
- 샌드박스 환경에서는 Playwright 브라우저 설치가 차단되어 자동화 테스트 미실행 상태
- 실제 Firestore 데이터 필요 → 스테이징에서 수동 검증 후 결과 기록
- 알림 패널 접근성(포커스 이동, ESC 닫기) 추가 검토 예정

## 4. 로그/모니터링 항목
- Functions 로그: `/api/comment-reports`, `/api/comments/:id/moderation` 호출 성공/실패
- Firestore 문서 변경 감시: `missingPersonComments.isHidden`, `commentNotifications.isRead`
