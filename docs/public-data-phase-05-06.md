# MissingAlert Public Data Phase 05-06

## 상태

- 구현 기준일: 2026-08-26
- Phase 05 로컬 구현: 완료
- Phase 05 외부 검증: 미완료 — Function/Hosting 미배포, SNS crawler 실서비스 캐시 미검증
- Phase 06 준비 도구·템플릿: 완료
- Phase 06 제출 가능 상태: 미달 — 3개 연속 공개 승인 Impact 월이 존재하지 않음

## Phase 05 — SNS 공유·SPA SEO

### 공유 렌더링

- 공개 공유 URL: `https://missingalert.kr/share/{publicCaseId}`
- Hosting의 `/share/**` rewrite를 SPA catch-all보다 먼저 배치
- `renderSharePage`는 `GET`/`HEAD`만 허용하는 read-only Gen 2 HTTP Function
- active, 공식 API, 공개·공유 허용 사건만 사건별 OG HTML 반환
- 활성 사건 cache: `public, max-age=60, s-maxage=300, stale-while-revalidate=60`
- 종결·비공개·미존재: 개인 상세가 없는 공통 안내, `no-store`, `noindex`
- crawler 접근이 필요하므로 공유 Function에는 App Check를 강제하지 않음
- 입력 길이/경로 검증, max instances, HTML attribute escape, HTTPS 이미지만 허용
- 유효한 사진이 없으면 1200×630 `missingalert-share-fallback-v1.png` 사용
- 공유 페이지는 중복 검색 노출을 피하기 위해 `noindex`이며 canonical은 기존 `/missing/{id}`
- 사용자 브라우저는 `/map?personId={id}`로 이동

React 공유 모달과 서버 렌더링 상세 페이지의 공유 버튼은 모두 `/share/{id}`를 사용한다.

### SPA SEO

- `/statistics`, `/impact`, `/about/data` route 계약과 단일 canonical을 정의
- `/statistics`와 `/impact`는 각 기능 flag가 켜지고 쿼리 파라미터가 없을 때만 SPA robots를 `index`로 변경
- `/about/data`는 항상 공개 가능한 출처·처리·한계 설명 화면
- route별 title, description, canonical, OG URL을 갱신
- 기본 `index.html`에 OG/Twitter fallback metadata 추가
- 정적 sitemap에 `/statistics`, `/impact`, `/about/data` 추가
- 동적 사건 sitemap은 기존처럼 active·공식·`seoVisible=true` 사건만 포함
- Hosting 전역에 nosniff, referrer, permissions, HSTS 헤더 추가. CSP는 실제 지도·Analytics·이미지 출처 조사 후 별도 report-only 단계로 유지

프레임워크 전환이나 전체 SSR은 하지 않았다. SNS crawler가 필요한 사건 공유 경로만 서버 렌더링한다.

### App Check 준비

웹 SDK는 아래 설정이 모두 있을 때 reCAPTCHA Enterprise App Check를 초기화하고 token auto-refresh를 사용한다.

```text
REACT_APP_FIREBASE_APP_CHECK_ENABLED=true
REACT_APP_FIREBASE_APP_CHECK_SITE_KEY=<public site key>
```

개발 환경에서는 `REACT_APP_FIREBASE_APP_CHECK_DEBUG=true`일 때 SDK가 debug token을 생성한다. 실제 debug token을 소스나 `.env`에 저장하지 않는다.

도입 순서:

1. Firebase Console에 웹 앱/provider 등록
2. 로컬 debug token 검증
3. production 코드 배포, enforcement 비활성
4. valid/invalid/unknown metrics 관찰
5. 정상 사용자 비율 확인
6. 관리자 callable을 포함한 Functions부터 단계적 enforcement

현재 관리자 변경 callable은 `enforceAppCheck=true`다. provider 등록·클라이언트 설정 확인 전에 Functions를 단독 배포하면 관리자 Import/승인이 차단될 수 있으므로 함께 활성화해야 한다.

### 검증

- share HTML 계약: active OG/canonical/cache 필드, 종결 generic, HTML injection, unsafe image fallback 통과
- SEO 계약 gate: 통과
- Frontend 공유 URL 계약: native/Facebook이 `/share/{id}` 사용
- Frontend production build: 통과
- `/about/data` 브라우저: H1 1개, index robots, canonical/OG URL, 개인정보·성과 한계 문구 확인

카카오톡·Facebook·X의 실제 미리보기, CDN cache 전환, Hosting rewrite와 production App Check는 배포하지 않아 확인하지 않았다.

## Phase 06 — 활용사례 증거팩 준비

### 추가한 준비물

- `evidence/README.md`: 저장·비공개 경계와 필수 파일 구조
- `evidence/templates/monthly-impact-report.md`: 월간 지표와 한계 검토표
- `evidence/templates/data-correction-log.md`: 정정 전후·sync/audit 연결 템플릿
- `evidence/templates/public-data-case-study-1page.md`: 수치 없는 제출 전 1페이지 초안
- `docs/operations/public-impact-evidence-runbook.md`: 월별 생성·승인·제출 판정 절차
- `docs/operations/public-data-3month-pilot.md`: 지자체·경찰 협력용 3개월 실증 초안
- `scripts/validate-impact-evidence.mjs`: 필수 파일, 승인 상태, BigQuery raw count 일치, 월/query version, 음수 지표, 과대 발견 주장 검사

검증기는 다음을 거부한다.

- draft/rejected/unpublished approval record
- `rawMonthlyValidated`가 아닌 공개 수치
- 폴더 월과 snapshot/approval 월 불일치
- 빈 값 또는 다른 BigQuery query version
- 음수·비수치 event count
- “MissingAlert가 N명을 발견”, “경찰청보다 더 빠름”, “정확히 N명의 시민” 같은 과대 주장

### 제출 준비가 아직 완료되지 않은 이유

첨부 문서의 완료 조건은 3개 연속 published Impact 월과 BigQuery/Firestore 원장 전수 대조다. 현재는 Analytics BigQuery export·예약 집계·관리자 공개 승인을 실행하지 않았고 실제 승인 월도 없다. 따라서 사례서에 성과 수치를 입력하거나 제출 완료로 표시하지 않았다.

## 롤백

1. SNS 문제 시 React/서버 공유 URL을 기존 `/missing/{id}`로 되돌림
2. Hosting `/share/**` rewrite 제거
3. `renderSharePage` 트래픽 중지 또는 Function 제거
4. App Check 정상 사용자 차단 시 enforcement 해제; 클라이언트 초기화 코드는 monitor mode로 유지 가능
5. sitemap에서 미준비 route 제거, route flag 비활성
