// @ts-nocheck -- CRA's development compiler does not load Jest globals for colocated tests.
import {
  buildCaseImpactContext,
  getSidoCode,
  normalizeCaseCategory,
  PUBLIC_IMPACT_EVENT_NAMES,
  serializePublicImpactEvent,
} from './events';

describe('Public Impact Analytics payload contract', () => {
  it('keeps only event-specific allowlisted fields and removes case/PII values', () => {
    const event = serializePublicImpactEvent(PUBLIC_IMPACT_EVENT_NAMES.CASE_IMPRESSION, {
      case_category: 'missing_child',
      sido_code: '11',
      surface: 'home',
      source_agency: 'police',
      case_id: 'case-secret-1',
      missing_person_id: 'case-secret-1',
      name: '홍길동',
      phone: '010-0000-0000',
      address: '서울특별시 중구 상세주소',
      photo_url: 'https://example.test/private.jpg',
    } as any);

    expect(event).toMatchInlineSnapshot(`
      Object {
        "name": "case_impression",
        "params": Object {
          "case_category": "child",
          "sido_code": "11",
          "source_agency": "police",
          "surface": "home",
        },
      }
    `);
  });

  it('normalizes legacy case categories without exposing the source record key', () => {
    expect(normalizeCaseCategory('runaway')).toBe('adult');
    expect(normalizeCaseCategory('facility')).toBe('unknown');
    expect(buildCaseImpactContext({
      caseCategory: 'dementia',
      address: '부산광역시 해운대구',
      surface: 'detail',
      routeGroup: 'map',
    })).toEqual({
      case_category: 'dementia',
      sido_code: '26',
      surface: 'detail',
      route_group: 'map',
      source_agency: 'police',
    });
  });

  it('accepts only two-digit province codes and valid share channels', () => {
    expect(getSidoCode('대한민국 전북특별자치도 전주시')).toBe('52');
    expect(serializePublicImpactEvent(PUBLIC_IMPACT_EVENT_NAMES.SHARE_CLICK, {
      case_category: 'adult',
      sido_code: '110',
      surface: 'detail',
      share_channel: 'email',
      source_agency: 'police',
    } as any).params).toEqual({
      case_category: 'adult',
      surface: 'detail',
      source_agency: 'police',
    });
  });

  it('keeps non-case P1 events anonymous and does not add a case category', () => {
    expect(serializePublicImpactEvent(PUBLIC_IMPACT_EVENT_NAMES.SEARCH_RESULT_VIEW, {
      sido_code: '11',
      surface: 'search',
      query: '보내면 안 되는 검색어',
      case_id: 'private-id',
    } as any)).toEqual({
      name: 'search_result_view',
      params: { sido_code: '11', surface: 'search' },
    });

    expect(serializePublicImpactEvent(PUBLIC_IMPACT_EVENT_NAMES.MAP_VIEW, {
      route_group: 'map',
    })).toEqual({ name: 'map_view', params: { route_group: 'map' } });
  });
});
