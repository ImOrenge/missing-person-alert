export interface RegionShapeEntry {
  svgId: string;
  label: string;
  aliases: string[];
}

const normalizeKey = (value: string): string => {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[-_.·]/g, '')
    .toLowerCase();
};

export const REGION_SHAPE_ENTRIES: ReadonlyArray<RegionShapeEntry> = [
  {
    svgId: '서울특별시',
    label: '서울특별시',
    aliases: ['서울특별시', '서울', 'seoul', 'gyeongseong', 'kr11', '11']
  },
  {
    svgId: '부산광역시',
    label: '부산광역시',
    aliases: ['부산광역시', '부산', 'busan', 'pusan', 'kr26', '26']
  },
  {
    svgId: '대구광역시',
    label: '대구광역시',
    aliases: ['대구광역시', '대구', 'daegu', 'taegu', 'kr27', '27']
  },
  {
    svgId: '인천광역시',
    label: '인천광역시',
    aliases: ['인천광역시', '인천', 'incheon', 'kr28', '28']
  },
  {
    svgId: '광주광역시',
    label: '광주광역시',
    aliases: ['광주광역시', '광주', 'gwangju', 'kr29', '29']
  },
  {
    svgId: '대전광역시',
    label: '대전광역시',
    aliases: ['대전광역시', '대전', 'daejeon', 'kr30', '30']
  },
  {
    svgId: '울산광역시',
    label: '울산광역시',
    aliases: ['울산광역시', '울산', 'ulsan', 'kr31', '31']
  },
  {
    svgId: '세종특별자치시',
    label: '세종특별자치시',
    aliases: ['세종특별자치시', '세종시', '세종', 'sejong', 'kr36', '36']
  },
  {
    svgId: '경기도',
    label: '경기도',
    aliases: ['경기도', '경기', 'gyeonggi', 'gyeonggido', 'kr41', '41']
  },
  {
    svgId: '강원도',
    label: '강원도',
    aliases: ['강원도', '강원특별자치도', '강원', 'gangwon', 'gangwondo', 'kr42', '42']
  },
  {
    svgId: '충청북도',
    label: '충청북도',
    aliases: ['충청북도', '충북', 'chungbuk', 'chungcheongbukdo', 'kr43', '43']
  },
  {
    svgId: '충청남도',
    label: '충청남도',
    aliases: ['충청남도', '충남', 'chungnam', 'chungcheongnamdo', 'kr44', '44']
  },
  {
    svgId: '전라북도',
    label: '전라북도',
    aliases: ['전라북도', '전북', 'jeonbuk', 'jeollabukdo', 'kr45', '45']
  },
  {
    svgId: '전라남도',
    label: '전라남도',
    aliases: ['전라남도', '전남', 'jeonnam', 'jeollanamdo', 'kr46', '46']
  },
  {
    svgId: '경상북도',
    label: '경상북도',
    aliases: ['경상북도', '경북', 'gyeongbuk', 'gyeongsangbukdo', 'kr47', '47']
  },
  {
    svgId: '경상남도',
    label: '경상남도',
    aliases: ['경상남도', '경남', 'gyeongnam', 'gyeongsangnamdo', 'kr48', '48']
  },
  {
    svgId: '제주특별자치도',
    label: '제주특별자치도',
    aliases: ['제주특별자치도', '제주도', '제주', 'jeju', 'jejudo', 'kr49', '49']
  }
];

const buildRegionLookup = () => {
  const map = new Map<string, RegionShapeEntry>();
  REGION_SHAPE_ENTRIES.forEach((entry) => {
    entry.aliases.forEach((alias) => {
      const key = normalizeKey(alias);
      if (!key) {
        return;
      }
      if (map.has(key)) {
        return;
      }
      map.set(key, entry);
    });
  });
  return map;
};

const REGION_LOOKUP = buildRegionLookup();

export interface RegionIdentity {
  regionId?: string | null;
  code?: string | null;
  regionName?: string | null;
}

const keysFromIdentity = (identity: RegionIdentity): string[] => {
  const candidates: (string | null | undefined)[] = [identity.regionId, identity.code, identity.regionName];
  return candidates.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
};

export const matchRegionShape = (identity: RegionIdentity): RegionShapeEntry | null => {
  for (const candidate of keysFromIdentity(identity)) {
    const normalized = normalizeKey(candidate);
    if (!normalized) {
      continue;
    }
    const match = REGION_LOOKUP.get(normalized);
    if (match) {
      return match;
    }
  }
  return null;
};

export const getRegionShapeByKey = (value: string | null | undefined): RegionShapeEntry | null => {
  if (!value) {
    return null;
  }
  const normalized = normalizeKey(value);
  return REGION_LOOKUP.get(normalized) ?? null;
};
