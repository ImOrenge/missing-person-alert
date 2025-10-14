# Stage 4 API 계약서 – 댓글 신고/알림

## 공통 사항
- **Base URL:** `/api`
- **인증:** Firebase ID 토큰 (`Authorization: Bearer <token>`)
- **reCAPTCHA:** 신고/작성 시 `x-recaptcha-token`, `x-recaptcha-action` 헤더 사용
- **컨텐츠 타입:** `application/json`
- **오류 포맷:**
  ```jsonc
  {
    "success": false,
    "error": "에러 메시지",
    "code": "선택적 오류 코드"
  }
  ```

---

## 1. 댓글 신고 관리

### `GET /comment-reports`
- **설명:** 상태별 댓글 신고 목록 조회 (관리자 전용)
- **쿼리 파라미터**
  | 이름   | 타입 | 필수 | 설명                    |
  |--------|------|------|-------------------------|
  | status | enum | 아니요 (기본: `pending`) | `pending`, `resolved`, `dismissed` |
  | limit  | int  | 아니요 (기본: 100, 최대 200) | 반환 갯수 제한 |
- **성공 응답**
  ```json
  {
    "success": true,
    "count": 3,
    "reports": [
      {
        "reportId": "abc123",
        "commentId": "comment-01",
        "reportedBy": "uid_01",
        "reason": "spam",
        "description": "광고성 링크 포함",
        "status": "pending",
        "createdAt": { "seconds": 1700000000, "nanoseconds": 0 },
        "resolvedAt": null,
        "resolvedBy": null,
        "comment": {
          "content": "댓글 본문",
          "nickname": "익명123",
          "type": "support",
          "reportCount": 3,
          "isHidden": true
        }
      }
    ]
  }
  ```

### `POST /comment-reports/:reportId/resolve`
- **설명:** 신고 상태 변경 및 댓글 숨김 처리
- **Body**
  | 이름         | 타입    | 필수 | 설명                         |
  |--------------|---------|------|------------------------------|
  | status       | enum    | 예   | `resolved`(유지), `dismissed`(기각) |
  | hideComment  | boolean | 예   | 처리 결과에 따라 댓글 숨김 여부 |
- **성공 응답**
  ```json
  { "success": true }
  ```

### `POST /comments/:commentId/moderation`
- **설명:** 댓글 직접 숨김/노출 (관리자)
- **Body**
  | 이름      | 타입    | 필수 | 설명                    |
  |-----------|---------|------|-------------------------|
  | isHidden  | boolean | 예   | `true` 숨김, `false` 노출 |
- **성공 응답**
  ```json
  { "success": true }
  ```

---

## 2. 댓글 알림

### Firestore 구독 (`commentNotifications` 컬렉션)
- **필드**
  | 필드          | 타입       | 설명                               |
  |---------------|------------|------------------------------------|
  | notificationId| string     | 문서 ID                            |
  | userId        | string     | 대상 사용자 UID                    |
  | commentId     | string     | 관련 댓글 ID                       |
  | type          | enum       | `reply`, `like`, `mention`         |
  | isRead        | boolean    | 읽음 여부                          |
  | createdAt     | timestamp  | 생성 시각                          |
- **쿼리 예시**
  ```ts
  query(
    collection(firestore, 'commentNotifications'),
    where('userId', '==', currentUser.uid),
    orderBy('createdAt', 'desc')
  )
  ```

### `PATCH /comment-notifications/:notificationId`
- (선택 구현) 알림 단건 읽음 처리
- **Body:** `{ "isRead": true }`
- **성공 응답:** `{ "success": true }`
- 현재는 클라이언트에서 Firestore `updateDoc`/`writeBatch` 로 처리

---

## 3. 댓글 신고/공감 API 요약

| 메서드 | 경로                                   | 설명                     |
|--------|----------------------------------------|--------------------------|
| GET    | `/comments/:missingPersonId`           | 실종자 댓글 목록         |
| POST   | `/comments`                            | 댓글 생성 (reCAPTCHA 필요) |
| PATCH  | `/comments/:commentId`                 | 댓글 수정 (작성자/관리자) |
| DELETE | `/comments/:commentId`                 | 댓글 삭제 (소프트 삭제)   |
| POST   | `/comments/:commentId/like`            | 공감 토글                 |
| POST   | `/comments/:commentId/report`          | 신고 등록 (reCAPTCHA 필요) |

- 각 엔드포인트는 성공 시 `{ success: true, ... }` 포맷을 따릅니다.
- 인증 실패, 권한 부족, reCAPTCHA 실패 시 각각 `401`, `403`, `403` 코드를 사용합니다.
