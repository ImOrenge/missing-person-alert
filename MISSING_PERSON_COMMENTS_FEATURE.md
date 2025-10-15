# 실종 근황 정보 기능 구상안

## 📋 목차
1. [기능 개요](#기능-개요)
2. [데이터 구조](#데이터-구조)
3. [UI/UX 설계](#uiux-설계)
4. [주요 기능](#주요-기능)
5. [보안 및 제한사항](#보안-및-제한사항)
6. [기술 스택](#기술-스택)
7. [알림 기능](#알림-기능)
8. [단계별 구현 계획](#단계별-구현-계획)
9. [예상 사용 시나리오](#예상-사용-시나리오)
10. [차별화 포인트](#차별화-포인트)

---

## 기능 개요

실종자별로 독립적인 댓글 시스템을 구축하여, 사용자들이 **목격 정보**, **근황**, **응원 메시지**를 실시간으로 공유할 수 있는 소통 공간을 제공합니다.

### 핵심 목표
- 실종자 수색에 도움이 되는 **실시간 목격 정보 공유**
- 커뮤니티 참여를 통한 **수색 활동 활성화**
- 가족과 시민들 간의 **소통 채널 제공**
- **신뢰도 높은 정보 필터링** (공감 시스템)

---

## 데이터 구조

### Firestore 컬렉션 설계

#### Collection: `missingPersonComments`

```typescript
interface MissingPersonComment {
  // 기본 정보
  commentId: string;          // 댓글 고유 ID (자동 생성)
  missingPersonId: string;    // 실종자 ID (인덱스 필수)

  // 작성자 정보
  userId: string;             // 작성자 UID
  nickname: string;           // 작성자 닉네임 또는 "익명{랜덤숫자}"
  isAnonymous: boolean;       // 익명 작성 여부

  // 댓글 내용
  content: string;            // 댓글 내용 (최소 10자, 최대 500자)
  type: 'sighting' | 'question' | 'support'; // 댓글 타입

  // 타임스탬프
  createdAt: Timestamp;       // 작성 시간
  updatedAt: Timestamp;       // 수정 시간

  // 상호작용
  likes: number;              // 공감 수
  likedBy: string[];          // 공감한 사용자 UID 배열

  // 상태
  isEdited: boolean;          // 수정 여부
  isDeleted: boolean;         // 삭제 여부 (soft delete)

  // 신고 관련
  reported: boolean;          // 신고 여부
  reportCount: number;        // 신고 횟수
  reportedBy: string[];       // 신고한 사용자 UID 배열
  isHidden: boolean;          // 자동 숨김 처리 여부 (신고 3회 이상)
}
```

#### Collection: `commentReports` (신고 상세)

```typescript
interface CommentReport {
  reportId: string;           // 신고 ID
  commentId: string;          // 신고된 댓글 ID
  reportedBy: string;         // 신고자 UID
  reason: 'spam' | 'inappropriate' | 'false' | 'other'; // 신고 사유
  description: string;        // 상세 설명 (선택)
  createdAt: Timestamp;       // 신고 시간
  status: 'pending' | 'resolved' | 'dismissed'; // 처리 상태
}
```

#### Collection: `commentNotifications` (알림)

```typescript
interface CommentNotification {
  notificationId: string;     // 알림 ID
  userId: string;             // 알림 받을 사용자 UID
  commentId: string;          // 관련 댓글 ID
  type: 'reply' | 'like' | 'mention'; // 알림 타입
  isRead: boolean;            // 읽음 여부
  createdAt: Timestamp;       // 알림 생성 시간
}
```

### Firestore 인덱스 (필수)

```
Collection: missingPersonComments
- missingPersonId (Ascending) + createdAt (Descending)
- missingPersonId (Ascending) + type (Ascending) + createdAt (Descending)
- userId (Ascending) + createdAt (Descending)
- isHidden (Ascending) + createdAt (Descending)
```

---

## UI/UX 설계

### InfoWindow 레이아웃 구조

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  [실종자 기본 정보]                              │
│  ├─ 사진 (좌측)                                 │
│  └─ 이름, 나이, 성별 (우측)                     │
│     실종 일시: 2025-01-15                       │
│     실종 장소: 서울시 강남구                     │
│                                                 │
├─────────────────────────────────────────────────┤
│  [탭 네비게이션]                                │
│  ┌─────┬─────────┬─────────┐                  │
│  │ 📋  │  💬 (12) │  📞     │                  │
│  │상세 │  근황정보 │ 신고    │                  │
│  └─────┴─────────┴─────────┘                  │
├─────────────────────────────────────────────────┤
│                                                 │
│  [근황정보 탭 - 댓글 작성 영역]                  │
│  ┌─────────────────────────────────────────┐   │
│  │ 💬 근황 정보를 공유해주세요              │   │
│  │                                         │   │
│  │ [타입 선택]                              │   │
│  │  ⚪ 🔴 목격   ⚪ ❓ 문의   ⚪ 💙 응원   │   │
│  │                                         │   │
│  │ ┌─────────────────────────────────┐     │   │
│  │ │ 목격 정보나 응원 메시지를...    │     │   │
│  │ │                                 │     │   │
│  │ │                                 │     │   │
│  │ └─────────────────────────────────┘     │   │
│  │                                         │   │
│  │  ☑️ 익명으로 작성    [취소] [작성]      │   │
│  │                     (0/500자)           │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  [댓글 필터 및 정렬]                             │
│  ├─ 전체(12) | 목격(3) | 문의(5) | 응원(4)      │
│  └─ 정렬: [최신순 ▼] [공감순]                   │
│                                                 │
│  [댓글 목록 - 스크롤 가능]                       │
│  ┌─────────────────────────────────────────┐   │
│  │                                         │   │
│  │  🔴 [목격] 홍길동 · 3시간 전             │   │
│  │  ───────────────────────────────────    │   │
│  │  오늘 오전 강남역 근처에서 비슷한 분을    │   │
│  │  봤습니다. 파란색 재킷을 입고 계셨고...   │   │
│  │                                         │   │
│  │  ❤️ 12   💬 답글 2개   [답글 보기]       │   │
│  │  ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯     │   │
│  │                                         │   │
│  │  💙 [응원] 익명123 · 1일 전              │   │
│  │  ───────────────────────────────────    │   │
│  │  하루빨리 무사히 돌아오시길 간절히       │   │
│  │  기도하겠습니다. 힘내세요!               │   │
│  │                                         │   │
│  │  ❤️ 45                                  │   │
│  │  ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯     │   │
│  │                                         │   │
│  │  ❓ [문의] 김철수 · 3일 전               │   │
│  │  ───────────────────────────────────    │   │
│  │  실종 당시 어떤 옷을 입고 계셨나요?      │   │
│  │                                         │   │
│  │  ❤️ 8   💬 답글 1개   [답글 보기]        │   │
│  │  ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯     │   │
│  │                                         │   │
│  │           [더 보기 (9개 남음)]           │   │
│  │                                         │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 개별 댓글 아이템 상세 디자인

```
┌─────────────────────────────────────────┐
│ 🔴 [목격]  홍길동  ·  3시간 전           │  ← 타입 아이콘 + 닉네임 + 시간
│ ───────────────────────────────────────  │
│                                          │
│ 오늘 오전 11시쯤 강남역 8번 출구 앞에서   │
│ 사진 속 분과 비슷한 분을 봤습니다.        │  ← 댓글 내용
│ 파란색 체크 셔츠를 입고 계셨어요.         │
│                                          │
│ ───────────────────────────────────────  │
│                                          │
│ ❤️ 12  💬 답글 2개  📍 서울 강남구        │  ← 공감/답글/위치
│                                          │
│ [❤️ 공감하기]  [💬 답글]  [⚠️ 신고]      │  ← 액션 버튼
│                                          │
└─────────────────────────────────────────┘
```

### 모바일 반응형 디자인

```
[데스크톱]
- InfoWindow 너비: 600px
- 댓글 목록 높이: 최대 400px (스크롤)
- 3단 레이아웃 (사진-정보-댓글)

[태블릿]
- InfoWindow 너비: 500px
- 댓글 목록 높이: 최대 350px
- 2단 레이아웃

[모바일]
- InfoWindow 너비: 90vw
- 댓글 목록 높이: 최대 300px
- 1단 레이아웃 (세로 스크롤)
```

---

## 주요 기능

### 1. 댓글 타입 분류 시스템

#### 타입별 특징

| 타입 | 아이콘 | 색상 | 용도 | 우선순위 |
|------|--------|------|------|----------|
| 🔴 목격 | 🔴 | 빨강 (#FF4444) | 실종자 목격 정보 | 높음 |
| ❓ 문의 | ❓ | 파랑 (#4A90E2) | 실종 관련 질문 | 중간 |
| 💙 응원 | 💙 | 하늘색 (#87CEEB) | 격려 및 응원 | 낮음 |

#### 타입별 UI 처리
- **목격 정보**: 상단 고정 옵션, 배경색 강조, 알림 발송
- **문의**: 일반 표시, 답글 유도
- **응원**: 일반 표시, 공감 유도

### 2. 작성 권한 및 인증

#### 로그인 상태별 처리

```typescript
// 비로그인 사용자
- 댓글 읽기: ✅ 가능
- 댓글 작성: ❌ 불가능
- 공감하기: ❌ 불가능
→ 작성 시도 시 로그인 유도 모달 표시

// 로그인 사용자
- 댓글 읽기: ✅ 가능
- 댓글 작성: ✅ 가능 (실명/익명 선택)
- 공감하기: ✅ 가능 (1회만)
- 본인 댓글 수정/삭제: ✅ 가능

// 관리자
- 모든 댓글 읽기: ✅ 가능
- 모든 댓글 삭제: ✅ 가능
- 신고 댓글 검토: ✅ 가능
- 사용자 제재: ✅ 가능
```

#### 익명 작성 시스템

```typescript
// 익명 닉네임 생성 로직
function generateAnonymousNickname(userId: string): string {
  const hash = hashCode(userId);
  const randomNum = Math.abs(hash) % 9999;
  return `익명${randomNum.toString().padStart(4, '0')}`;
}

// 예시
userId: "abc123xyz" → "익명1234"
userId: "def456uvw" → "익명5678"
```

### 3. 공감(좋아요) 시스템

#### 동작 방식

```typescript
// 1. 공감 추가
async function addLike(commentId: string, userId: string) {
  const commentRef = doc(db, 'missingPersonComments', commentId);

  await runTransaction(db, async (transaction) => {
    const comment = await transaction.get(commentRef);

    if (!comment.exists()) {
      throw new Error('댓글이 존재하지 않습니다');
    }

    const likedBy = comment.data().likedBy || [];

    // 중복 공감 체크
    if (likedBy.includes(userId)) {
      throw new Error('이미 공감한 댓글입니다');
    }

    // 공감 추가
    transaction.update(commentRef, {
      likes: increment(1),
      likedBy: arrayUnion(userId)
    });
  });
}

// 2. 공감 취소
async function removeLike(commentId: string, userId: string) {
  const commentRef = doc(db, 'missingPersonComments', commentId);

  await runTransaction(db, async (transaction) => {
    transaction.update(commentRef, {
      likes: increment(-1),
      likedBy: arrayRemove(userId)
    });
  });
}
```

#### UI 표시

```typescript
// 공감 버튼 상태
const isLiked = comment.likedBy.includes(currentUserId);

<button onClick={handleLikeToggle}>
  {isLiked ? '❤️' : '🤍'} {comment.likes}
</button>
```

### 4. 실시간 업데이트

#### Firestore 실시간 리스너

```typescript
// 실종자별 댓글 실시간 구독
useEffect(() => {
  const q = query(
    collection(db, 'missingPersonComments'),
    where('missingPersonId', '==', missingPersonId),
    where('isHidden', '==', false),
    orderBy('createdAt', 'desc'),
    limit(20)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const comments: Comment[] = [];

    snapshot.forEach((doc) => {
      comments.push({ id: doc.id, ...doc.data() } as Comment);
    });

    setComments(comments);
  });

  return () => unsubscribe();
}, [missingPersonId]);
```

### 5. 댓글 필터링 및 정렬

#### 필터 옵션

```typescript
type FilterType = 'all' | 'sighting' | 'question' | 'support';
type SortType = 'latest' | 'popular';

// 필터 적용
const filteredComments = comments.filter(comment => {
  if (filterType === 'all') return true;
  return comment.type === filterType;
});

// 정렬 적용
const sortedComments = [...filteredComments].sort((a, b) => {
  if (sortType === 'latest') {
    return b.createdAt.toMillis() - a.createdAt.toMillis();
  } else {
    return b.likes - a.likes;
  }
});
```

### 6. 댓글 작성 제한

#### 스팸 방지 로직

```typescript
// 1. 시간 제한 (1분당 1개)
const checkRateLimit = async (userId: string): Promise<boolean> => {
  const lastComment = await getLastComment(userId);

  if (!lastComment) return true;

  const timeDiff = Date.now() - lastComment.createdAt.toMillis();
  const oneMinute = 60 * 1000;

  return timeDiff >= oneMinute;
};

// 2. 내용 길이 검증
const validateContent = (content: string): boolean => {
  const trimmed = content.trim();
  return trimmed.length >= 10 && trimmed.length <= 500;
};

// 3. 중복 내용 체크
const checkDuplicate = async (userId: string, content: string): Promise<boolean> => {
  const recentComments = await getRecentComments(userId, 5);

  return !recentComments.some(comment =>
    comment.content.trim() === content.trim()
  );
};
```

### 7. 신고 시스템

#### 신고 사유 및 처리

```typescript
type ReportReason = 'spam' | 'inappropriate' | 'false' | 'other';

interface ReportModal {
  commentId: string;
  reasons: {
    spam: '스팸 또는 광고',
    inappropriate: '부적절한 내용',
    false: '허위 정보',
    other: '기타'
  };
}

// 신고 처리 로직
async function reportComment(
  commentId: string,
  userId: string,
  reason: ReportReason,
  description?: string
) {
  // 1. 중복 신고 체크
  const alreadyReported = await checkAlreadyReported(commentId, userId);
  if (alreadyReported) {
    throw new Error('이미 신고한 댓글입니다');
  }

  // 2. 신고 기록 저장
  await addDoc(collection(db, 'commentReports'), {
    commentId,
    reportedBy: userId,
    reason,
    description: description || '',
    createdAt: serverTimestamp(),
    status: 'pending'
  });

  // 3. 댓글의 신고 횟수 증가
  const commentRef = doc(db, 'missingPersonComments', commentId);
  await updateDoc(commentRef, {
    reported: true,
    reportCount: increment(1),
    reportedBy: arrayUnion(userId)
  });

  // 4. 신고 3회 이상 시 자동 숨김
  const comment = await getDoc(commentRef);
  if (comment.data()?.reportCount >= 3) {
    await updateDoc(commentRef, {
      isHidden: true
    });

    // 관리자에게 알림
    await notifyAdmin(commentId, '댓글이 자동 숨김 처리되었습니다');
  }
}
```

---

## 보안 및 제한사항

### 1. Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 헬퍼 함수
    function isSignedIn() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return request.auth.uid == userId;
    }

    function isAdmin() {
      return isSignedIn() &&
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }

    function isValidComment() {
      let data = request.resource.data;
      return data.content.size() >= 10 &&
             data.content.size() <= 500 &&
             data.type in ['sighting', 'question', 'support'];
    }

    // 댓글 컬렉션
    match /missingPersonComments/{commentId} {
      // 읽기: 숨김 처리되지 않은 댓글만 모두가 읽을 수 있음
      allow read: if !resource.data.isHidden || isAdmin();

      // 작성: 로그인한 사용자만 가능, 내용 검증 필요
      allow create: if isSignedIn() &&
                       isValidComment() &&
                       request.resource.data.userId == request.auth.uid;

      // 수정: 본인만 가능, 5분 이내만 가능
      allow update: if isSignedIn() &&
                       isOwner(resource.data.userId) &&
                       request.time < resource.data.createdAt + duration.value(5, 'm') &&
                       request.resource.data.content.size() >= 10 &&
                       request.resource.data.content.size() <= 500;

      // 삭제: 본인 또는 관리자만 가능
      allow delete: if isSignedIn() &&
                       (isOwner(resource.data.userId) || isAdmin());
    }

    // 신고 컬렉션
    match /commentReports/{reportId} {
      // 읽기: 관리자만 가능
      allow read: if isAdmin();

      // 작성: 로그인한 사용자만 가능
      allow create: if isSignedIn() &&
                       request.resource.data.reportedBy == request.auth.uid;

      // 수정: 관리자만 가능 (처리 상태 변경)
      allow update: if isAdmin();

      // 삭제: 관리자만 가능
      allow delete: if isAdmin();
    }

    // 알림 컬렉션
    match /commentNotifications/{notificationId} {
      // 읽기: 본인 알림만 읽을 수 있음
      allow read: if isSignedIn() &&
                     resource.data.userId == request.auth.uid;

      // 작성: 시스템에서만 생성 (Cloud Function)
      allow create: if false;

      // 수정: 본인 알림만 수정 가능 (읽음 처리)
      allow update: if isSignedIn() &&
                       resource.data.userId == request.auth.uid;

      // 삭제: 본인 알림만 삭제 가능
      allow delete: if isSignedIn() &&
                       resource.data.userId == request.auth.uid;
    }
  }
}
```

### 2. 콘텐츠 필터링

#### 금지어 필터링

```typescript
// 욕설/비속어 리스트 (예시)
const PROHIBITED_WORDS = [
  '욕설1', '욕설2', '비속어1', '비속어2',
  // ... 더 많은 단어들
];

// 필터링 함수
function filterContent(content: string): string {
  let filtered = content;

  PROHIBITED_WORDS.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, '*'.repeat(word.length));
  });

  return filtered;
}
```

#### 개인정보 마스킹

```typescript
// 전화번호 패턴 감지 및 마스킹
function maskPhoneNumber(content: string): string {
  const phonePattern = /(\d{3})-?(\d{4})-?(\d{4})/g;
  return content.replace(phonePattern, '***-****-****');
}

// 이메일 패턴 감지 및 마스킹
function maskEmail(content: string): string {
  const emailPattern = /([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g;
  return content.replace(emailPattern, '***@***.***');
}

// 통합 마스킹 함수
function maskPersonalInfo(content: string): string {
  let masked = content;
  masked = maskPhoneNumber(masked);
  masked = maskEmail(masked);
  return masked;
}
```

#### URL 링크 검증

```typescript
// 안전한 도메인 화이트리스트
const SAFE_DOMAINS = [
  'safe182.go.kr',
  'police.go.kr',
  'missing.go.kr'
];

// URL 검증 및 차단
function validateUrls(content: string): boolean {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const urls = content.match(urlPattern) || [];

  for (const url of urls) {
    try {
      const domain = new URL(url).hostname;
      if (!SAFE_DOMAINS.some(safe => domain.includes(safe))) {
        return false; // 허용되지 않은 도메인
      }
    } catch {
      return false; // 잘못된 URL 형식
    }
  }

  return true;
}
```

### 3. 사용자 제재 시스템

#### 제재 등급

```typescript
interface UserPenalty {
  userId: string;
  level: 1 | 2 | 3 | 4; // 경고 → 일시정지 → 장기정지 → 영구정지
  reason: string;
  startDate: Timestamp;
  endDate?: Timestamp;
  isActive: boolean;
}

// 제재 기준
const PENALTY_RULES = {
  level1: {
    name: '1차 경고',
    duration: 0, // 경고만
    trigger: '신고 1회',
  },
  level2: {
    name: '7일 정지',
    duration: 7 * 24 * 60 * 60 * 1000,
    trigger: '신고 2회',
  },
  level3: {
    name: '30일 정지',
    duration: 30 * 24 * 60 * 60 * 1000,
    trigger: '신고 3회',
  },
  level4: {
    name: '영구 정지',
    duration: Infinity,
    trigger: '신고 4회 이상',
  }
};
```

---

## 기술 스택

### Frontend

#### 컴포넌트 구조

```
src/components/Comments/
├── CommentSection.tsx           # 메인 컨테이너
│   ├── Props
│   │   ├── missingPersonId: string
│   │   ├── onCommentCountChange?: (count: number) => void
│   │   └── isOpen: boolean
│   └── State
│       ├── comments: Comment[]
│       ├── filterType: FilterType
│       ├── sortType: SortType
│       └── isLoading: boolean
│
├── CommentInput.tsx             # 댓글 작성
│   ├── Props
│   │   ├── missingPersonId: string
│   │   ├── onCommentAdded: () => void
│   │   └── maxLength: number
│   └── State
│       ├── content: string
│       ├── type: CommentType
│       ├── isAnonymous: boolean
│       └── isSubmitting: boolean
│
├── CommentList.tsx              # 댓글 목록
│   ├── Props
│   │   ├── comments: Comment[]
│   │   ├── onLoadMore: () => void
│   │   └── hasMore: boolean
│   └── Render
│       └── CommentItem[] (map)
│
├── CommentItem.tsx              # 개별 댓글
│   ├── Props
│   │   ├── comment: Comment
│   │   ├── onLike: (commentId: string) => void
│   │   ├── onReport: (commentId: string) => void
│   │   └── onDelete?: (commentId: string) => void
│   ├── Components
│   │   ├── LikeButton
│   │   ├── ReportButton
│   │   └── DeleteButton (조건부)
│   └── State
│       ├── isLiked: boolean
│       └── showReportModal: boolean
│
├── CommentTypeFilter.tsx        # 타입 필터
│   ├── Props
│   │   ├── activeType: FilterType
│   │   ├── counts: { [key: string]: number }
│   │   └── onChange: (type: FilterType) => void
│   └── Render
│       └── FilterButton[]
│
├── CommentSortSelector.tsx      # 정렬 선택
│   ├── Props
│   │   ├── activeSortType: SortType
│   │   └── onChange: (type: SortType) => void
│   └── Options
│       ├── latest: "최신순"
│       └── popular: "공감순"
│
├── LikeButton.tsx               # 공감 버튼
│   ├── Props
│   │   ├── commentId: string
│   │   ├── likes: number
│   │   ├── isLiked: boolean
│   │   └── onToggle: () => void
│   └── Animation
│       └── 하트 클릭 애니메이션
│
├── ReportButton.tsx             # 신고 버튼
│   ├── Props
│   │   ├── commentId: string
│   │   └── onReport: () => void
│   └── Modal
│       └── ReportModal
│
└── ReportModal.tsx              # 신고 모달
    ├── Props
    │   ├── commentId: string
    │   ├── isOpen: boolean
    │   └── onClose: () => void
    ├── State
    │   ├── reason: ReportReason
    │   ├── description: string
    │   └── isSubmitting: boolean
    └── Submit
        └── submitReport()
```

#### 주요 Hook

```typescript
// hooks/useComments.ts
export function useComments(missingPersonId: string) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 실시간 구독
  useEffect(() => {
    const unsubscribe = subscribeToComments(missingPersonId, setComments);
    return () => unsubscribe();
  }, [missingPersonId]);

  // 댓글 추가
  const addComment = async (data: CreateCommentData) => {
    // ...
  };

  // 댓글 삭제
  const deleteComment = async (commentId: string) => {
    // ...
  };

  return { comments, isLoading, error, addComment, deleteComment };
}

// hooks/useCommentLike.ts
export function useCommentLike(commentId: string, initialLikes: number) {
  const [likes, setLikes] = useState(initialLikes);
  const [isLiked, setIsLiked] = useState(false);
  const { currentUser } = useAuth();

  const toggleLike = async () => {
    if (!currentUser) {
      showLoginModal();
      return;
    }

    try {
      if (isLiked) {
        await removeLike(commentId, currentUser.uid);
        setLikes(prev => prev - 1);
      } else {
        await addLike(commentId, currentUser.uid);
        setLikes(prev => prev + 1);
      }
      setIsLiked(!isLiked);
    } catch (error) {
      console.error('공감 처리 실패:', error);
    }
  };

  return { likes, isLiked, toggleLike };
}
```

#### 서비스 레이어

```typescript
// services/commentService.ts
export const commentService = {
  // 댓글 조회
  async getComments(
    missingPersonId: string,
    options: QueryOptions
  ): Promise<Comment[]> {
    const q = query(
      collection(db, 'missingPersonComments'),
      where('missingPersonId', '==', missingPersonId),
      where('isHidden', '==', false),
      orderBy(options.sortBy || 'createdAt', options.sortOrder || 'desc'),
      limit(options.limit || 20)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Comment));
  },

  // 댓글 작성
  async createComment(data: CreateCommentData): Promise<string> {
    // 입력 검증
    validateCommentContent(data.content);

    // 스팸 체크
    await checkRateLimit(data.userId);

    // 콘텐츠 필터링
    const filteredContent = filterContent(data.content);
    const maskedContent = maskPersonalInfo(filteredContent);

    // 저장
    const docRef = await addDoc(collection(db, 'missingPersonComments'), {
      ...data,
      content: maskedContent,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      likes: 0,
      likedBy: [],
      isEdited: false,
      reported: false,
      reportCount: 0,
      isHidden: false
    });

    return docRef.id;
  },

  // 댓글 수정
  async updateComment(commentId: string, content: string): Promise<void> {
    validateCommentContent(content);

    const filteredContent = filterContent(content);
    const maskedContent = maskPersonalInfo(filteredContent);

    await updateDoc(doc(db, 'missingPersonComments', commentId), {
      content: maskedContent,
      updatedAt: serverTimestamp(),
      isEdited: true
    });
  },

  // 댓글 삭제 (soft delete)
  async deleteComment(commentId: string): Promise<void> {
    await updateDoc(doc(db, 'missingPersonComments', commentId), {
      isDeleted: true,
      content: '[삭제된 댓글입니다]',
      updatedAt: serverTimestamp()
    });
  },

  // 공감 추가/취소
  async toggleLike(commentId: string, userId: string): Promise<void> {
    const commentRef = doc(db, 'missingPersonComments', commentId);

    await runTransaction(db, async (transaction) => {
      const comment = await transaction.get(commentRef);
      const likedBy = comment.data()?.likedBy || [];

      if (likedBy.includes(userId)) {
        // 공감 취소
        transaction.update(commentRef, {
          likes: increment(-1),
          likedBy: arrayRemove(userId)
        });
      } else {
        // 공감 추가
        transaction.update(commentRef, {
          likes: increment(1),
          likedBy: arrayUnion(userId)
        });
      }
    });
  },

  // 신고
  async reportComment(
    commentId: string,
    userId: string,
    reason: ReportReason,
    description?: string
  ): Promise<void> {
    // 중복 신고 체크
    const alreadyReported = await checkAlreadyReported(commentId, userId);
    if (alreadyReported) {
      throw new Error('이미 신고한 댓글입니다');
    }

    // 신고 기록 저장
    await addDoc(collection(db, 'commentReports'), {
      commentId,
      reportedBy: userId,
      reason,
      description: description || '',
      createdAt: serverTimestamp(),
      status: 'pending'
    });

    // 댓글 신고 횟수 증가
    const commentRef = doc(db, 'missingPersonComments', commentId);
    await updateDoc(commentRef, {
      reported: true,
      reportCount: increment(1),
      reportedBy: arrayUnion(userId)
    });

    // 신고 3회 이상 시 자동 숨김
    const comment = await getDoc(commentRef);
    if (comment.data()?.reportCount >= 3) {
      await updateDoc(commentRef, {
        isHidden: true
      });
    }
  }
};
```

### Backend (Cloud Functions)

#### 알림 발송 함수

```typescript
// functions/src/notifications/commentNotifications.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// 새 댓글 작성 시 알림
export const onCommentCreated = functions.firestore
  .document('missingPersonComments/{commentId}')
  .onCreate(async (snap, context) => {
    const comment = snap.data();

    // 목격 정보인 경우 관리자에게 즉시 알림
    if (comment.type === 'sighting') {
      await notifyAdmins({
        title: '🔴 새로운 목격 정보',
        body: `${comment.nickname}님이 목격 정보를 작성했습니다`,
        data: {
          commentId: context.params.commentId,
          missingPersonId: comment.missingPersonId,
          type: 'sighting'
        }
      });
    }

    // 실종자 가족에게 알림 (설정한 경우)
    await notifyFamilyMembers(comment.missingPersonId, {
      title: '새로운 댓글',
      body: `${comment.nickname}님이 댓글을 작성했습니다`,
      data: {
        commentId: context.params.commentId,
        missingPersonId: comment.missingPersonId
      }
    });
  });

// 공감 10개 달성 시 알림
export const onCommentLikesMilestone = functions.firestore
  .document('missingPersonComments/{commentId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // 10개, 50개, 100개 달성 시 작성자에게 알림
    const milestones = [10, 50, 100];

    for (const milestone of milestones) {
      if (before.likes < milestone && after.likes >= milestone) {
        await sendNotification(after.userId, {
          title: `🎉 축하합니다!`,
          body: `회원님의 댓글이 공감 ${milestone}개를 달성했습니다`,
          data: {
            commentId: context.params.commentId,
            likes: after.likes
          }
        });
      }
    }
  });

// 신고 누적 시 관리자 알림
export const onCommentReported = functions.firestore
  .document('missingPersonComments/{commentId}')
  .onUpdate(async (change, context) => {
    const after = change.after.data();

    // 신고 3회 이상 시 관리자에게 알림
    if (after.reportCount >= 3) {
      await notifyAdmins({
        title: '⚠️ 댓글 자동 숨김 처리',
        body: `신고가 ${after.reportCount}회 누적되어 자동 숨김 처리되었습니다`,
        data: {
          commentId: context.params.commentId,
          reportCount: after.reportCount
        }
      });
    }
  });

// 헬퍼 함수
async function notifyAdmins(notification: NotificationPayload) {
  const adminsSnapshot = await admin.firestore()
    .collection('users')
    .where('isAdmin', '==', true)
    .get();

  const tokens: string[] = [];
  adminsSnapshot.forEach(doc => {
    const fcmToken = doc.data().fcmToken;
    if (fcmToken) tokens.push(fcmToken);
  });

  if (tokens.length > 0) {
    await admin.messaging().sendMulticast({
      tokens,
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: notification.data
    });
  }
}
```

#### 자동 필터링 함수

```typescript
// functions/src/moderation/contentFilter.ts
import * as functions from 'firebase-functions';
import { Filter } from 'bad-words';

const filter = new Filter();

// 댓글 작성 전 콘텐츠 검증
export const validateCommentContent = functions.firestore
  .document('missingPersonComments/{commentId}')
  .onCreate(async (snap, context) => {
    const comment = snap.data();
    let needsUpdate = false;
    let filteredContent = comment.content;

    // 1. 욕설 필터링
    if (filter.isProfane(comment.content)) {
      filteredContent = filter.clean(comment.content);
      needsUpdate = true;
    }

    // 2. 개인정보 마스킹
    const maskedContent = maskPersonalInfo(filteredContent);
    if (maskedContent !== filteredContent) {
      filteredContent = maskedContent;
      needsUpdate = true;
    }

    // 3. URL 검증
    if (!validateUrls(filteredContent)) {
      // 허용되지 않은 URL 제거
      filteredContent = removeUrls(filteredContent);
      needsUpdate = true;
    }

    // 필터링된 내용으로 업데이트
    if (needsUpdate) {
      await snap.ref.update({
        content: filteredContent,
        isFiltered: true
      });
    }
  });

// 스팸 감지 함수
export const detectSpam = functions.firestore
  .document('missingPersonComments/{commentId}')
  .onCreate(async (snap, context) => {
    const comment = snap.data();

    // 같은 사용자의 최근 댓글 조회
    const recentComments = await admin.firestore()
      .collection('missingPersonComments')
      .where('userId', '==', comment.userId)
      .where('createdAt', '>', new Date(Date.now() - 60000)) // 1분 이내
      .get();

    // 1분 내 3개 이상 작성 시 스팸으로 판단
    if (recentComments.size >= 3) {
      await snap.ref.update({
        isHidden: true,
        hiddenReason: 'spam'
      });

      // 사용자에게 경고
      await warnUser(comment.userId, 'spam');
    }
  });
```

---

## 알림 기능

### 1. 푸시 알림 (Firebase Cloud Messaging)

#### 알림 타입별 처리

```typescript
type NotificationType =
  | 'new_comment'        // 새 댓글 작성
  | 'comment_reply'      // 내 댓글에 답글
  | 'comment_like'       // 내 댓글 공감
  | 'like_milestone'     // 공감 마일스톤 (10, 50, 100)
  | 'sighting_alert'     // 목격 정보 등록 (관리자)
  | 'report_alert';      // 신고 누적 (관리자)

interface PushNotification {
  type: NotificationType;
  title: string;
  body: string;
  data: {
    commentId?: string;
    missingPersonId?: string;
    [key: string]: any;
  };
}
```

#### 알림 설정

```typescript
// 사용자별 알림 설정
interface NotificationSettings {
  userId: string;
  enabled: boolean;
  types: {
    newComment: boolean;          // 새 댓글
    commentReply: boolean;        // 답글
    commentLike: boolean;         // 공감
    likeMilestone: boolean;       // 공감 마일스톤
    sightingAlert: boolean;       // 목격 정보 (관리자)
  };
  quiet: {
    enabled: boolean;             // 방해금지 모드
    startTime: string;            // 시작 시간 (예: "22:00")
    endTime: string;              // 종료 시간 (예: "08:00")
  };
}
```

### 2. 인앱 알림

```typescript
// 컴포넌트: NotificationBell.tsx
export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;

    // 실시간 알림 구독
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'commentNotifications'),
        where('userId', '==', currentUser.uid),
        where('isRead', '==', false),
        orderBy('createdAt', 'desc'),
        limit(10)
      ),
      (snapshot) => {
        const notifs: Notification[] = [];
        snapshot.forEach(doc => {
          notifs.push({ id: doc.id, ...doc.data() } as Notification);
        });
        setNotifications(notifs);
        setUnreadCount(notifs.length);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  return (
    <div className="notification-bell">
      <button onClick={handleToggle}>
        🔔
        {unreadCount > 0 && (
          <span className="badge">{unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <NotificationDropdown
          notifications={notifications}
          onMarkAsRead={handleMarkAsRead}
        />
      )}
    </div>
  );
}
```

### 3. 이메일 알림 (선택사항)

```typescript
// Cloud Function: 목격 정보 이메일 알림
export const sendSightingEmailAlert = functions.firestore
  .document('missingPersonComments/{commentId}')
  .onCreate(async (snap, context) => {
    const comment = snap.data();

    if (comment.type !== 'sighting') return;

    // 실종자 가족 이메일 조회
    const familyEmails = await getFamilyEmails(comment.missingPersonId);

    for (const email of familyEmails) {
      await sendEmail({
        to: email,
        subject: '🔴 새로운 목격 정보가 등록되었습니다',
        html: `
          <h2>목격 정보 알림</h2>
          <p><strong>${comment.nickname}</strong>님이 목격 정보를 작성했습니다.</p>
          <blockquote>${comment.content}</blockquote>
          <p>작성 시간: ${comment.createdAt.toDate().toLocaleString('ko-KR')}</p>
          <a href="${APP_URL}/missing-persons/${comment.missingPersonId}">
            자세히 보기
          </a>
        `
      });
    }
  });
```

---

## 단계별 구현 계획

### Phase 1: 기본 댓글 시스템 (1-2주)

#### Week 1: 데이터베이스 및 기본 UI
- [ ] Firestore 컬렉션 생성 및 인덱스 설정
- [ ] Security Rules 작성 및 테스트
- [ ] 댓글 데이터 모델 정의 (TypeScript 인터페이스)
- [ ] `CommentSection` 컴포넌트 기본 구조
- [ ] `CommentInput` 컴포넌트 UI
- [ ] `CommentList` 컴포넌트 UI
- [ ] `CommentItem` 컴포넌트 UI

#### Week 2: 댓글 CRUD 기능
- [ ] 댓글 작성 기능 구현
  - [ ] 입력 검증 (10-500자)
  - [ ] 익명/실명 선택 기능
  - [ ] 타입 선택 (목격/문의/응원)
- [ ] 댓글 조회 기능
  - [ ] Firestore 쿼리 최적화
  - [ ] 실시간 리스너 적용
  - [ ] 페이지네이션 (무한 스크롤)
- [ ] 댓글 수정 기능 (5분 제한)
- [ ] 댓글 삭제 기능 (Soft Delete)
- [ ] 로그인 유도 모달
- [ ] 에러 핸들링 및 토스트 메시지

**산출물:**
- 기본 댓글 시스템 작동
- 실시간 업데이트 확인
- 로그인/비로그인 상태 처리

---

### Phase 2: 공감(좋아요) 시스템 (3-4일)

#### Day 1-2: 공감 기능 구현
- [ ] `LikeButton` 컴포넌트 제작
- [ ] `useCommentLike` Hook 구현
- [ ] Firestore 트랜잭션 처리
  - [ ] 중복 공감 방지
  - [ ] 공감 카운트 증감
  - [ ] `likedBy` 배열 업데이트
- [ ] 공감 상태 실시간 반영

#### Day 3-4: UI/UX 개선
- [ ] 하트 클릭 애니메이션
- [ ] 공감한 사용자 목록 모달
- [ ] 공감순 정렬 기능
- [ ] 로딩 상태 처리

**산출물:**
- 완전히 작동하는 공감 시스템
- 애니메이션 및 피드백

---

### Phase 3: 타입 분류 및 필터 (3-4일)

#### Day 1-2: 타입 분류
- [ ] 댓글 타입별 UI 스타일링
  - [ ] 🔴 목격: 빨강 배경, 강조 표시
  - [ ] ❓ 문의: 파랑 테두리
  - [ ] 💙 응원: 하늘색 아이콘
- [ ] 타입 선택 UI (라디오 버튼)
- [ ] 타입별 아이콘 및 라벨

#### Day 3-4: 필터링
- [ ] `CommentTypeFilter` 컴포넌트
- [ ] 타입별 카운트 표시
- [ ] 필터 선택 시 목록 업데이트
- [ ] URL 쿼리 파라미터 연동 (선택사항)

**산출물:**
- 타입별 시각적 구분
- 필터링 기능 작동

---

### Phase 4: 신고 및 관리 기능 (5-7일)

#### Day 1-3: 신고 시스템
- [ ] `ReportButton` 컴포넌트
- [ ] `ReportModal` 컴포넌트
  - [ ] 신고 사유 선택 (스팸/부적절/허위/기타)
  - [ ] 상세 설명 입력 (선택)
- [ ] 신고 처리 로직
  - [ ] 중복 신고 방지
  - [ ] 신고 횟수 카운트
  - [ ] 3회 이상 시 자동 숨김
- [ ] 신고된 댓글 표시 (관리자만)

#### Day 4-5: 관리자 대시보드
- [ ] 신고 댓글 목록 페이지
- [ ] 신고 상세 내역 보기
- [ ] 신고 처리 기능
  - [ ] 승인 (댓글 삭제)
  - [ ] 기각 (신고 무효)
  - [ ] 사용자 제재
- [ ] 통계 대시보드

#### Day 6-7: 사용자 제재
- [ ] 제재 등급 시스템
- [ ] 제재 내역 저장
- [ ] 제재 중인 사용자 댓글 작성 차단
- [ ] 제재 해제 기능

**산출물:**
- 완전한 신고 시스템
- 관리자 도구
- 자동 필터링 작동

---

### Phase 5: 콘텐츠 필터링 (3-4일)

#### Day 1-2: 자동 필터링
- [ ] 욕설/비속어 필터 라이브러리 적용
- [ ] 개인정보 마스킹 함수
  - [ ] 전화번호 패턴
  - [ ] 이메일 패턴
- [ ] URL 검증 및 차단
- [ ] Cloud Function으로 서버 측 필터링

#### Day 3-4: 스팸 방지
- [ ] Rate Limiting (1분당 1개)
- [ ] 중복 내용 감지
- [ ] 짧은 시간 내 다수 작성 감지
- [ ] 자동 차단 및 경고

**산출물:**
- 자동 콘텐츠 필터링 작동
- 스팸 방지 시스템

---

### Phase 6: 알림 시스템 (5-7일)

#### Day 1-3: 푸시 알림
- [ ] FCM 설정 및 토큰 관리
- [ ] Cloud Function 알림 트리거
  - [ ] 새 댓글 작성
  - [ ] 답글 작성
  - [ ] 공감 받음
  - [ ] 공감 마일스톤
- [ ] 알림 권한 요청 UI
- [ ] 알림 설정 페이지

#### Day 4-5: 인앱 알림
- [ ] `NotificationBell` 컴포넌트
- [ ] 알림 드롭다운 UI
- [ ] 읽음/안읽음 처리
- [ ] 알림 클릭 시 해당 댓글로 이동

#### Day 6-7: 이메일 알림 (선택)
- [ ] 이메일 템플릿 제작
- [ ] SendGrid/Mailgun 연동
- [ ] 목격 정보 이메일 발송
- [ ] 이메일 수신 설정

**산출물:**
- 전체 알림 시스템 작동
- 푸시/인앱/이메일 통합

---

### Phase 7: 성능 최적화 및 테스트 (5-7일)

#### Day 1-2: 성능 최적화
- [ ] Firestore 쿼리 최적화
- [ ] 인덱스 최적화
- [ ] 컴포넌트 메모이제이션
- [ ] 이미지/아이콘 최적화
- [ ] 번들 사이즈 최적화

#### Day 3-4: 테스트
- [ ] 단위 테스트 (Jest)
- [ ] 통합 테스트
- [ ] E2E 테스트 (Cypress)
- [ ] 성능 테스트
- [ ] 보안 테스트

#### Day 5-6: 버그 수정 및 개선
- [ ] 버그 트래킹 및 수정
- [ ] UX 개선
- [ ] 접근성 개선 (a11y)
- [ ] 다국어 지원 준비

#### Day 7: 배포 준비
- [ ] 프로덕션 환경 설정
- [ ] 모니터링 설정 (Sentry)
- [ ] 문서화
- [ ] 사용자 가이드 작성

**산출물:**
- 안정적인 프로덕션 버전
- 테스트 커버리지 80% 이상
- 배포 준비 완료

---

## 예상 사용 시나리오

### 시나리오 1: 긴급 목격 정보 공유

```
[상황]
김철수 씨(35세)가 출근길에 실종자 포스터 속 인물과 비슷한 사람을 봄

[행동 흐름]
1. 지도에서 실종자 마커 클릭
2. InfoWindow 열림 → "근황정보" 탭 선택
3. [🔴 목격] 타입 선택
4. 댓글 작성:
   "오늘 오전 8시 30분쯤 강남역 8번 출구 앞 버스 정류장에서
    비슷한 분을 봤습니다. 파란색 체크 셔츠에 검은색 가방을
    메고 계셨습니다."
5. [익명으로 작성] 체크 → [작성] 버튼 클릭
6. 댓글 즉시 등록 및 관리자에게 자동 알림 발송

[결과]
- 실종자 가족에게 푸시 알림 전송
- 경찰에 정보 전달
- 다른 사용자들이 공감으로 신뢰도 표시
- 근처 CCTV 확인 → 실종자 발견! ✅
```

### 시나리오 2: 응원 메시지로 위로

```
[상황]
이영희 씨가 뉴스에서 본 실종 사건에 마음이 아픔

[행동 흐름]
1. 지도에서 해당 실종자 검색 → 마커 클릭
2. "근황정보" 탭 열람
3. 다른 사람들의 응원 댓글 읽음
4. [💙 응원] 타입 선택
5. 댓글 작성:
   "하루빨리 무사히 가족 품으로 돌아오시길 간절히 기도합니다.
    가족분들도 힘내세요!"
6. 실명으로 작성 → [작성] 버튼 클릭

[결과]
- 가족에게 큰 위로가 됨
- 다른 사용자들이 공감 표시 (❤️ 125)
- 커뮤니티 참여 증가
```

### 시나리오 3: 정보 문의 및 답변

```
[상황]
박민수 씨가 실종자와 비슷한 사람을 봤는데 확신이 서지 않음

[행동 흐름]
1. 실종자 정보 확인
2. "근황정보" 탭에서 [❓ 문의] 선택
3. 댓글 작성:
   "실종 당시 어떤 신발을 신고 계셨나요?
    오늘 비슷한 분을 봤는데 신발이 다른 것 같아서요."
4. [작성] 버튼 클릭

[결과]
- 가족 또는 관리자가 답글로 응답:
  "흰색 운동화를 신고 계셨습니다. 사진을 첨부해드릴게요."
- 박민수 씨가 다시 확인하여 목격 정보 제공
```

### 시나리오 4: 부적절한 댓글 신고

```
[상황]
악의적인 사용자가 허위 정보 또는 부적절한 댓글 작성

[행동 흐름]
1. 문제의 댓글 발견
2. [⚠️ 신고] 버튼 클릭
3. 신고 모달 팝업
   - 사유 선택: "허위 정보"
   - 상세 설명: "확인되지 않은 정보를 사실처럼 작성함"
4. [제출] 버튼 클릭

[결과]
- 신고 접수 (reportCount: 1)
- 3명이 추가 신고 시 자동 숨김 처리
- 관리자가 검토 후 영구 삭제 또는 사용자 제재
```

---

## 차별화 포인트

### 1. 실종자별 독립적인 소통 공간
- 각 실종자마다 고유한 댓글 스레드
- 실종자 ID 기반 격리된 데이터 구조
- 혼선 없는 정보 공유

### 2. 목격 정보 강조 시스템
- 🔴 빨간색 배지 및 배경 강조
- 상단 고정 옵션 (우선순위 높음)
- 자동 알림 발송 (가족, 경찰, 관리자)
- 지도에 목격 위치 표시 (향후 기능)

### 3. 익명 옵션으로 참여 장벽 낮춤
- 개인정보 보호
- 부담 없는 정보 제공
- 익명 번호로 신원 구분 가능

### 4. 실시간 업데이트
- Firestore 실시간 리스너
- 새 댓글 즉시 반영
- 공감 수 실시간 카운트

### 5. 공감 시스템으로 신뢰도 필터링
- 신뢰할 수 있는 정보 부각
- 공감순 정렬로 중요 정보 우선 표시
- 스팸/허위 정보 자연스럽게 하단 이동

### 6. 자동 콘텐츠 필터링
- 욕설/비속어 자동 차단
- 개인정보 자동 마스킹
- 허용되지 않은 URL 제거
- 안전한 소통 환경 조성

### 7. 다층 신고 시스템
- 사용자 신고 → 자동 숨김 (3회)
- 관리자 검토 및 처리
- 사용자 제재 등급제
- 악의적인 사용자 차단

### 8. 포괄적인 알림 시스템
- 푸시 알림 (FCM)
- 인앱 알림 (실시간)
- 이메일 알림 (긴급 상황)
- 사용자별 알림 설정 가능

### 9. 접근성 및 반응형
- 모바일 최적화
- 키보드 네비게이션 지원
- 스크린 리더 호환
- 다양한 디바이스 지원

### 10. 확장 가능한 구조
- 모듈화된 컴포넌트
- 재사용 가능한 Hook
- 명확한 데이터 구조
- 향후 기능 추가 용이
  - 답글 기능
  - 이미지 첨부
  - 위치 태그
  - 멘션 기능

---

## 기대 효과

### 1. 실종자 수색 효율 증대
- 실시간 목격 정보 공유
- 신속한 정보 전달
- 커뮤니티 협력 증진

### 2. 가족과 시민 간 소통 강화
- 양방향 정보 교환
- 심리적 지지 제공
- 공동체 의식 향상

### 3. 플랫폼 활성화
- 사용자 참여도 증가
- 재방문율 향상
- 입소문 효과

### 4. 신뢰도 높은 정보 축적
- 공감 시스템으로 검증
- 허위 정보 필터링
- 가치 있는 데이터베이스 구축

### 5. 사회적 가치 실현
- 실종자 가족 지원
- 사회 안전망 강화
- 긍정적 브랜드 이미지

---

## 향후 확장 계획

### 단기 (3개월)
- [ ] 답글 기능 (대댓글)
- [ ] 이미지 첨부 기능
- [ ] 목격 위치 지도 표시
- [ ] 멘션 기능 (@사용자)

### 중기 (6개월)
- [ ] 번역 기능 (다국어 지원)
- [ ] 음성 댓글
- [ ] AI 기반 스팸 필터링
- [ ] 목격 정보 히트맵

### 장기 (1년)
- [ ] 실시간 채팅방
- [ ] 수색 자원봉사 매칭
- [ ] 통합 수색 대시보드
- [ ] 공공기관 API 연동

---

## 결론

실종 근황 정보 기능은 단순한 댓글 시스템을 넘어, **실종자 수색에 실질적으로 도움이 되는 커뮤니티 플랫폼**으로 발전할 수 있습니다.

### 핵심 가치
1. **생명 구조**: 목격 정보 공유로 실종자 발견 확률 증가
2. **커뮤니티**: 시민들의 자발적 참여와 협력
3. **위로와 지지**: 가족에게 심리적 지원 제공
4. **신뢰성**: 공감 시스템과 필터링으로 검증된 정보

이 기능을 통해 **기술이 사회에 긍정적인 영향을 미치는 사례**를 만들어갈 수 있습니다.

---

**작성일**: 2025-01-15
**버전**: 1.0
**작성자**: Claude Code
**문서 상태**: 초안 (Draft)
