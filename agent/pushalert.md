# Push Alert 구현 계획

작성일: 2025-10-16
담당자: 운영팀

## 목표
모바일 PWA 이용자에게 실종자 속보를 푸시 알림(Web Push, FCM)으로 전달할 수 있도록 클라이언트/백엔드 전반을 개선한다.

## 범위
- 클라이언트: 푸시 권한 획득, FCM 토큰 저장, foreground 메시지 처리, 서비스워커 연동
- 백엔드: 사용자별 토큰 관리, 푸시 발송 API 또는 Cloud Function, 오류/만료 토큰 정리
- 개인정보/정책: 알림 활용 목적 및 동의 절차 반영

## 세부 작업

### 1. FCM/Web Push 클라이언트 연동
- [ ] Firebase 콘솔에서 Cloud Messaging 및 VAPID 키 확인
- [x] `firebase-messaging-sw.js` 작성 또는 기존 Service Worker에 메시징 코드 통합
- [x] `src/services/firebaseMessaging.ts` 추가
  - `requestNotificationPermission`, `getFcmToken`, `listenForegroundMessages` 구현
- [x] 로그인 성공 시 알림 권한 및 토큰 획득 흐름 추가
- [x] 토큰 저장 실패, 권한 거부 UI 처리

### 2. 사용자 토큰 저장 로직
- [x] Firestore 구조 설계 (`userTokens/{uid}.tokens[token]=true`)
- [x] 로그인/회원가입/재로그인 시 토큰 갱신
- [x] 로그아웃/계정 삭제 시 토큰 제거
- [x] 중복 토큰 및 만료 토큰 정리 로직 마련

### 3. 백엔드 발송 파이프라인
- [x] Firebase Admin SDK 설정
- [x] 토큰 조회 + 멀티캐스트 발송 함수 구현
  - 트리거 예시: 새로운 실종자 제보 등록
- [x] 실패 토큰 정리 및 에러 로깅
- [ ] 이후 확장 고려 (위치별 타깃, 사용자 구독 설정 등)

### 4. UI 및 사용자 경험
- [x] 알림 설정 토글/인터랙션 추가 (프로필 또는 설정 화면)
- [x] 권한 거부 시 안내 메시지 및 재요청 경로 제공
- [x] foreground 알림 표시 토스트/배너 처리

### 5. 보안·정책 사항
- [ ] 개인정보 처리방침에 푸시 알림 및 토큰 활용 목적 추가
- [x] 이용자 동의 흐름 정비

### 6. 테스트 & 배포
- [ ] 크롬/사파리/안드로이드 PWA 환경 테스트
- [ ] iOS 16.4+ Web Push 확인 (홈화면 설치 후)
- [ ] QA 체크리스트 작성 및 배포 계획 수립

## 일정(안)
1. 요구사항 확정 & Firebase 세팅 — 1일
2. 클라이언트 토큰 처리 구현 — 2일
3. 백엔드 발송 로직 구축 — 2일
4. 테스트 & 정책 업데이트 — 1일

총 1주 내외(업무일 기준) 목표.

## 리스크 & 대응
- **권한 거부**: UI 재안내 및 설정 이동 버튼 제공
- **푸시 제한(iOS Safari)**: 지원 버전 안내, 홈화면 설치 유도
- **토큰 만료/에러**: 발송 시 오류 코드 처리 및 정리 주기 설정
- **보안/정책**: 동의 절차 및 문서 업데이트 선행

## 참고 자료
- Firebase Cloud Messaging 공식 문서
- Web Push Notifications MDN 가이드
- iOS Web Push (Safari 16.4+) 지원 안내
