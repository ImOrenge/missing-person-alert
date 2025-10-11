# Firebase 전화번호 인증 설정 가이드

## 오류: `auth/invalid-app-credential`

이 오류는 Firebase Console에서 전화번호 인증이 제대로 설정되지 않았을 때 발생합니다.

## 🚀 빠른 해결 방법

### 1. Firebase Console 설정 (필수)

**A. 전화번호 인증 활성화**
1. Firebase Console 접속: https://console.firebase.google.com/project/missing-person-alram
2. 좌측 메뉴 **Authentication** > **Sign-in method** 클릭
3. **전화** 또는 **Phone** 제공업체 찾기
4. **사용 설정** 토글 ON
5. **저장** 클릭

**B. 승인된 도메인 확인**
1. Authentication > Settings > Authorized domains
2. 다음 도메인이 있는지 확인:
   - ✅ `localhost` (자동 포함)
   - ✅ 배포 도메인 (예: `your-app.web.app`)

### 2. 테스트 전화번호 추가 (개발용 - 강력 권장)

**실제 SMS 없이 테스트하기:**
1. Firebase Console > Authentication > Sign-in method
2. **Phone** 제공업체의 톱니바퀴 아이콘 클릭
3. **전화번호 > 테스트용 전화번호 추가**
4. 테스트 번호 추가:
   ```
   전화번호: +821012345678
   인증 코드: 123456
   ```
5. **저장** 클릭

**앱에서 테스트:**
- 전화번호: `010-1234-5678` 또는 `+82 10-1234-5678`
- 인증 코드: `123456`
- SMS 발송 없이 즉시 인증 완료!

### 3. reCAPTCHA 설정 확인

Firebase 전화번호 인증은 자동으로 reCAPTCHA를 사용합니다.

**현재 코드 설정:**
- reCAPTCHA 모드: `invisible` (사용자가 보지 않음)
- 자동 초기화 및 렌더링 적용

**문제 발생 시:**
```typescript
// src/services/firebase.ts에서 임시로 'normal' 모드 사용
size: 'normal' // invisible → normal 변경
```

### 4. 실제 SMS 발송 (프로덕션 배포용)

**필수 요구사항:**
- ✅ Firebase Blaze 플랜 (종량제)
- ✅ 결제 정보 등록
- ✅ SMS 할당량 확인 (기본: 월 10,000건)

**설정 방법:**
1. Firebase Console > 좌측 하단 톱니바퀴 > **요금제**
2. **Blaze 플랜으로 업그레이드**
3. 결제 정보 입력

## 📋 체크리스트

단계별로 확인하세요:

### Firebase Console
- [ ] Authentication > Sign-in method에서 "전화" 활성화
- [ ] Authorized domains에 `localhost` 포함 확인
- [ ] 테스트 전화번호 추가 (예: `+821012345678` → `123456`)

### 코드 설정
- [ ] `.env` 파일에 Firebase 설정 확인
  ```env
  REACT_APP_FIREBASE_API_KEY=your_actual_key
  REACT_APP_FIREBASE_AUTH_DOMAIN=missing-person-alram.firebaseapp.com
  REACT_APP_FIREBASE_PROJECT_ID=missing-person-alram
  ```
- [ ] reCAPTCHA 컨테이너가 DOM에 존재하는지 확인 (자동)

### 테스트
- [ ] 테스트 전화번호로 인증 시도
- [ ] 브라우저 콘솔에서 오류 메시지 확인
- [ ] Network 탭에서 Firebase API 요청 확인

## 🔧 문제 해결

### "reCAPTCHA 초기화 실패"
**원인:** DOM이 준비되기 전에 초기화 시도
**해결:** 현재 코드는 300ms 지연 적용됨 (자동 해결)

### "reCAPTCHA 컨테이너를 찾을 수 없습니다"
**원인:** 모달이 렌더링되지 않음
**해결:** 모달이 열린 후 reCAPTCHA 초기화 (자동)

### "SMS 전송 실패"
**원인 1:** Firebase Console에서 전화 인증 미활성화
**해결:** 위의 1단계 진행

**원인 2:** 실제 SMS 발송 시도 (Blaze 플랜 필요)
**해결:** 테스트 전화번호 사용 또는 Blaze 플랜 업그레이드

### "auth/invalid-verification-code"
**원인:** 잘못된 인증 코드 입력
**해결:**
- 테스트 번호: Firebase Console에서 설정한 코드 입력
- 실제 번호: SMS로 받은 6자리 코드 정확히 입력

## 🎯 현재 구현 상태

✅ **완료된 기능:**
- reCAPTCHA invisible 모드 자동 초기화
- 기존 계정 전화번호 연동 지원
- 에러 핸들링 및 사용자 안내
- 자동 재시도 로직
- Rate limiting 보안 기능

⚠️ **필요한 작업:**
- Firebase Console에서 전화번호 인증 활성화
- 테스트 전화번호 설정 (개발용)
- Blaze 플랜 업그레이드 (실제 SMS 발송용)

## 📚 참고 문서

- [Firebase 전화번호 인증 공식 문서](https://firebase.google.com/docs/auth/web/phone-auth)
- [Firebase reCAPTCHA 설정](https://firebase.google.com/docs/auth/web/phone-auth#web-version-9_4)
- [Firebase 가격 정책](https://firebase.google.com/pricing)

## 💡 개발 팁

**빠르게 테스트하려면:**
1. Firebase Console에서 테스트 번호 설정
2. 앱에서 해당 번호로 인증
3. 설정한 코드 입력
4. SMS 없이 즉시 인증 완료!

**프로덕션 배포 시:**
1. Blaze 플랜 업그레이드
2. 테스트 번호 제거
3. 실제 전화번호로 테스트
4. SMS 할당량 모니터링
