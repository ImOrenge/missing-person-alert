# 쿠팡파트너스 광고 단위 측정

## 적용 방식

`CoupangPartnerAd`에 쿠팡파트너스에서 발급받은 링크를 전달하면 광고 단위별 노출과 클릭이 Firebase Analytics에 기록된다.

```tsx
<CoupangPartnerAd
  unitId="dashboard_top_01"
  placement="dashboard_top"
  creativeType="banner"
  href={coupangLink}
>
  <img src="/ads/example.png" alt="추천 상품 보기" />
</CoupangPartnerAd>
```

링크가 비어 있으면 컴포넌트가 렌더링되지 않으므로 환경변수나 CMS 연결 전에는 빈 광고 영역이 생기지 않는다.

## 이벤트 규격

| 이벤트 | 발생 시점 | 주요 파라미터 |
| --- | --- | --- |
| `affiliate_ad_impression` | 광고가 뷰포트 50% 이상에 진입한 최초 1회 | `ad_network`, `ad_unit_id`, `ad_placement`, `ad_creative_type`, `product_id` |
| `affiliate_ad_click` | 쿠팡 링크 클릭 시 | 동일 |

측정 ID에는 개인정보나 이메일을 넣지 않는다. `unitId`는 배치와 크리에이티브가 바뀌어도 같은 단위를 비교할 수 있도록 고정한다.
