# Stage 4 UI 가이드 – 관리자 신고 & 알림

## 1. 댓글 신고 탭 (Admin Dashboard)

### 배치
- 탭 버튼 아이콘: `AlertTriangle`, 색상 `#e74c3c`
- 레이아웃: Grid (5 컬럼) – 댓글 내용 / 신고 정보 / 상태 / 신고일 / 액션
- 기본 패딩: `16px`, 카드형 배경 `#ffffff`, 경계 `1px solid #ecf0f1`, radius `12px`

### 컬러 & 상태표시
- Pending: 배경 `#fff3cd`, 텍스트 `#a67c00`
- Resolved: 배경 `#d4efdf`, 텍스트 `#1e8449`
- Dismissed: 배경 `#d6eaf8`, 텍스트 `#21618c`
- 숨김 버튼: 주조색 `#c0392b`, 유지 버튼 보조색 `#27ae60`

### 상호작용
- 숨김/유지 클릭 시 토스트 메시지 노출 (`toast.success`)
- 숨김 상태 댓글: “공감 신고 N회” 표시 + 숨김 토글 아이콘 (Eye/EyeOff)
- 검색 입력: 댓글 ID / 신고자 / 댓글 본문 substring 매칭

## 2. 알림 벨 (헤더)

### 컴포넌트 구성
- 벨 버튼: 원형, 배경 `rgba(255,255,255,0.12)`, 활성화 시 `#c0392b`
- 뱃지: 상단 우측, 배경 `#e74c3c`, 글자색 white, 텍스트 `9+` 상한
- 패널: width 320px, maxHeight 360px, 그림자 `0 12px 40px rgba(0,0,0,0.15)`

### 알림 카드
- 읽지 않은 알림 배경: `rgba(231, 76, 60, 0.08)`
- 아이콘 매핑: `like`→Heart(#e74c3c), `reply`→MessageCircle(#3498db), `mention`→AtSign(#9b59b6)
- 폰트: 제목 `13px #2c3e50`, 시간 `12px #95a5a6`

### 동작 흐름
- 패널 열릴 때 `markAllNotificationsRead`
- 로그인 상태에만 노출, 미로그인 시 숨김

## 3. 반응형 고려사항
- InfoWindow 및 신고 목록: 640px 미만에서는 버튼 텍스트 크기 `12px`, 패딩 축소
- 알림 패널은 모바일에서도 우측 정렬, 높이 제한으로 스크롤 허용

## 4. 디자인 TODO
- (추후) Figma에 신고 탭/알림 패널 컴포넌트 추가
- 접근성 검사(키보드 포커스, ARIA) 보완 필요
