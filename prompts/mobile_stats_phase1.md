# Phase 1 Deliverables — 모바일 통계 & 시·군·구 모달 개선

Common 준비부터 Phase 1 체크 항목까지 완료된 산출물과 적용 방식을 정리합니다.

## 1. QA 대상 단말 & 브라우저 범위
| 구분 | 단말/OS | 브라우저 | 비고 |
| --- | --- | --- | --- |
| 모바일 iOS | iPhone 13 (iOS 17), iPhone SE 3 (iOS 17) | Safari, Chrome | 주요 해상도 390×844, 375×667 대응 |
| 모바일 Android | Samsung Galaxy S21 (Android 13), Galaxy A52 (Android 13), Pixel 6 (Android 14) | Chrome, Samsung Internet | 저가형 디바이스 성능 체크 포함 |
| 태블릿 | iPad Air 5 (iPadOS 17), Galaxy Tab S7 (Android 13) | Safari, Chrome | 768px~1024px 중단점 확인 |
| 데스크톱 | Windows 11 | Chrome, Edge | 1440×900, 1920×1080 |
| 데스크톱 | macOS Sonoma | Safari, Chrome | PWA 설치 테스트 포함 |

- QA 시나리오: 통계 탭 진입, CTA 호출, 모달 오픈/드릴다운, 필터 변경, 접근성(스크린 리더/키보드) 점검.

## 2. Firestore 스키마 & API 명세
- `stats/regionDaily/{date}/{regionId}`
  - `regionId: string` 행정코드 (예: "11010")
  - `date: string` ISO(YYYY-MM-DD)
  - `totalCases: number`
  - `activeCases: number`
  - `resolvedCases: number`
  - `updatedAt: Timestamp`
- `regionMetadata/{regionId}`
  - `nameKo: string`
  - `nameEn: string`
  - `parentRegionId: string | null`
  - `center: { lat: number, lng: number }`
  - `population: number`
- `appMetrics/visitorStats`
  - `totalVisitors: number`
  - `updatedAt: number` (epoch ms)

### API 호출 규칙
- Admin 클라이언트는 `stats/regionDaily/{date}` 콜렉션 스트림을 읽기 전용으로 구독, 15분 캐시 TTL (IndexedDB + 메모리)
- 누적 방문 수는 Firestore onSnapshot으로 실시간 반영, 실패 시 0 표시 + 토스트 경고
- Cloud Scheduler(매시 정각) → Cloud Function: SAFE182/내부 API 데이터를 집계 후 문서 업데이트, 권한은 서비스 계정으로 제한

## 3. 측정 기준 (접근성·성능·번들)
- **접근성**: Lighthouse A11y 점수 ≥ 95, 대비 4.5:1, 키보드 포커스 순서 확인, 스크린 리더 레이블 검증
- **성능**: Lighthouse Performance ≥ 80 (모바일), LCP ≤ 2.8s, TBT ≤ 200ms (3G Fast 시나리오)
- **번들 사이즈**: 통계 탭 진입 번들 < 250KB (gzip), 차트 라이브러리 지연 로딩 후 < 350KB, eval 없는 tree-shaking 확인
- 측정 주기: 개발 완료 후 QA, 스테이징 배포 전, 정기 회귀 시 월 1회

## 4. 디자인 토큰 & 모바일 가이드
- **타이포그래피**: `font-size-base 14px`, 헤드라인 18px (모바일), 카드 숫자 28px, 라벨 12px
- **컬러 토큰**:
  - Primary `--color-primary-500 #3498db`
  - Success `--color-success-500 #27ae60`
  - Accent `--color-accent-500 #3b82f6`
  - Neutral 배경 `--color-bg-muted #f7f9fc`, 글자 `--color-text-secondary #7f8c8d`
  - 접근성 대비 확보를 위해 다크모드 기준 동일 대비 체크
- **간격**: 기본 여백 16px, 카드 내부 패딩 12px, 아이콘-텍스트 간격 8px
- **컴포넌트 가이드**: CTA 버튼 최소 폭 48px, 카드 모서리 8px, 도넛/막대 차트 모바일 높이 240px 유지
- 문서화 위치: 디자인 팀 피그마 링크 & README 추가 예정 (링크 placeholder)

## Phase 1 UX/UI 구현 내용
### CTA & 요약 카드
- 헤더 CTA 및 모바일 FAB 와이어프레임 정의, `aria-label="지역별 실종자 통계 모달 열기"` 적용
- 통계 요약 카드는 모바일 중단점(≤600px)에서 1열, 숫자 포맷터(`formatNumberCompact`) 도입
- Skeleton 컴포넌트(`StatisticsSkeleton`) 정의, fetch 중 표시·오류 토스트 문구 세트 작성

### 모달 기본 구조
- 핫라인/데이터 출처/업데이트 시각 포함한 헤더 고정 섹션 구조 설계
- 본문: 시·도 막대 차트 + Top3 텍스트 카드, 모바일은 스택형 카드
- 하단: 개인정보 안내, 피드백 메일, 닫기 버튼을 sticky footer로 구성

## Phase 1 데이터 & 엔지니어링 구현 내용
- Cloud Scheduler/Function 설계 문서 초안 작성, 필드 검증 로직 포함
- `appMetrics/visitorStats` 구독 실패 처리: `console.error` + 토스트 + 0 디스플레이
- 캐싱 전략: `useStatisticsData` 훅 내부에 타임스탬프 체크하여 15분 이내 재사용
- 접근성 검수 체크리스트 작성(포커스 순서, 터치 영역, 대비 확인 항목 포함)

## QA 체크리스트 (Phase 1)
- 모바일/데스크톱 단말에서 통계 탭 → CTA → 모달 열기/닫기 → 데이터 확인 → 오류 상황 재현
- Skeleton → 실제 데이터 → 실패 토스트 전환 시 UI 깨짐 없는지 확인
- 스크린 리더(VoiceOver, TalkBack)로 CTA, 모달 제목, 차트 설명 읽기 확인
- 터치 영역 44px 이상 여부(브라우저 DevTools 터치 모드) 점검

---

Phase 2/3에서 참고할 수 있도록 산출물 링크 및 측정 기준을 유지보수합니다.

