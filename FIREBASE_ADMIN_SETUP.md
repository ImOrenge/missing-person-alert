# Firebase Admin SDK 설정 가이드

## 현재 오류

```
관리자 권한 확인 실패: Could not load the default credentials.
```

Firebase Admin SDK가 서비스 계정 키를 찾을 수 없어 발생하는 오류입니다.

---

## 해결 방법

### 옵션 1: 개발 환경 (권장 - 빠른 테스트용)

`.env` 파일에 관리자 이메일을 추가하면 서비스 계정 키 없이 사용 가능합니다.

```env
# 개발 환경 설정
NODE_ENV=development

# 관리자 이메일 목록 (쉼표로 구분)
ADMIN_EMAILS=your-email@gmail.com,another-admin@gmail.com
```

**장점**: 즉시 테스트 가능
**단점**: 프로덕션에서는 사용 불가

---

### 옵션 2: 서비스 계정 키 발급 (프로덕션용)

#### 1단계: Firebase 콘솔에서 서비스 계정 키 생성

1. **Firebase Console 접속**
   - https://console.firebase.google.com/
   - 프로젝트 선택: `missing-person-alram`

2. **설정 → 서비스 계정**
   - 왼쪽 상단 톱니바퀴 ⚙️ 클릭
   - "프로젝트 설정" 선택
   - "서비스 계정" 탭 클릭

3. **새 비공개 키 생성**
   - "새 비공개 키 생성" 버튼 클릭
   - JSON 파일 다운로드
   - 파일명 예: `missing-person-alram-firebase-adminsdk-xxxxx-xxxxxxxxxx.json`

#### 2단계: 키 파일 배치

다운로드한 JSON 파일을 백엔드 폴더에 저장:

```bash
backend/
  ├── serviceAccountKey.json  ← 여기에 저장
  ├── .env
  └── ...
```

**⚠️ 보안 주의사항:**
- `.gitignore`에 `serviceAccountKey.json` 추가 필수
- 절대로 Git에 커밋하지 말 것

#### 3단계: `.env` 파일 설정

```env
# Firebase Admin SDK 서비스 계정 키
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json

# 프로덕션 환경
NODE_ENV=production
```

---

## 관리자 권한 부여 방법

### 방법 1: 커스텀 클레임 설정 (프로덕션)

서비스 계정 키가 있는 경우, Firebase CLI로 관리자 권한 부여:

```bash
# Firebase CLI 설치
npm install -g firebase-tools

# 로그인
firebase login

# 관리자 권한 부여 스크립트 실행
node backend/scripts/setAdminClaim.js user@example.com
```

**스크립트 예시** (`backend/scripts/setAdminClaim.js`):
```javascript
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const email = process.argv[2];
if (!email) {
  console.error('이메일을 입력하세요: node setAdminClaim.js user@example.com');
  process.exit(1);
}

admin.auth().getUserByEmail(email)
  .then(user => {
    return admin.auth().setCustomUserClaims(user.uid, { admin: true });
  })
  .then(() => {
    console.log(`✅ ${email}에게 관리자 권한 부여 완료`);
    process.exit(0);
  })
  .catch(error => {
    console.error('오류:', error);
    process.exit(1);
  });
```

### 방법 2: 개발 환경 (간단)

`.env`에 이메일만 추가:

```env
ADMIN_EMAILS=your-email@gmail.com
```

---

## 환경별 동작 방식

### 개발 환경 (`NODE_ENV=development`)
1. `FIREBASE_SERVICE_ACCOUNT_PATH` 없음
2. `ADMIN_EMAILS`에 있는 이메일 확인
3. 일치하면 관리자 권한 부여 ✅

### 프로덕션 환경 (`NODE_ENV=production`)
1. `FIREBASE_SERVICE_ACCOUNT_PATH` 필수
2. Firebase에서 커스텀 클레임 확인
3. `admin: true` 클레임 있어야 함 ✅

---

## 테스트

### 1. 백엔드 서버 재시작
```bash
cd backend
npm start
```

### 2. 관리자 API 테스트
```bash
# 로그인 후 토큰 받기
# 전체 제보 조회 (관리자 전용)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/reports/all
```

---

## 문제 해결

### "Could not load the default credentials" 오류
- `.env`에 `ADMIN_EMAILS` 추가 (개발 환경)
- 또는 `FIREBASE_SERVICE_ACCOUNT_PATH` 설정 (프로덕션)

### "관리자 권한이 필요합니다" 오류
- 개발: `.env`의 `ADMIN_EMAILS`에 로그인한 이메일 추가
- 프로덕션: Firebase 커스텀 클레임 설정

### 서비스 계정 키 파일 찾을 수 없음
- 파일 경로 확인: `backend/serviceAccountKey.json`
- `.env`의 경로가 올바른지 확인
