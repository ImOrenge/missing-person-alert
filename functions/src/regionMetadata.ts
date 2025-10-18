export interface RegionMetadata {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  center: {
    lat: number;
    lng: number;
  };
  aliases?: string[];
}

export const REGION_METADATA: RegionMetadata[] = [
  {
    id: "seoul",
    name: "서울특별시",
    code: "11",
    parentId: null,
    center: {lat: 37.5665, lng: 126.9780},
    aliases: ["서울", "서울시"]
  },
  {
    id: "busan",
    name: "부산광역시",
    code: "26",
    parentId: null,
    center: {lat: 35.1796, lng: 129.0756},
    aliases: ["부산", "부산시"]
  },
  {
    id: "daegu",
    name: "대구광역시",
    code: "27",
    parentId: null,
    center: {lat: 35.8714, lng: 128.6014},
    aliases: ["대구", "대구시"]
  },
  {
    id: "incheon",
    name: "인천광역시",
    code: "28",
    parentId: null,
    center: {lat: 37.4563, lng: 126.7052},
    aliases: ["인천", "인천시"]
  },
  {
    id: "gwangju",
    name: "광주광역시",
    code: "29",
    parentId: null,
    center: {lat: 35.1595, lng: 126.8526},
    aliases: ["광주", "광주시"]
  },
  {
    id: "daejeon",
    name: "대전광역시",
    code: "30",
    parentId: null,
    center: {lat: 36.3504, lng: 127.3845},
    aliases: ["대전", "대전시"]
  },
  {
    id: "ulsan",
    name: "울산광역시",
    code: "31",
    parentId: null,
    center: {lat: 35.5384, lng: 129.3114},
    aliases: ["울산", "울산시"]
  },
  {
    id: "sejong",
    name: "세종특별자치시",
    code: "36",
    parentId: null,
    center: {lat: 36.4800, lng: 127.2890},
    aliases: ["세종", "세종시", "세종특별자치시"]
  },
  {
    id: "gyeonggi",
    name: "경기도",
    code: "41",
    parentId: null,
    center: {lat: 37.4138, lng: 127.5183},
    aliases: ["경기", "경기도"]
  },
  {
    id: "gangwon",
    name: "강원특별자치도",
    code: "51",
    parentId: null,
    center: {lat: 37.8228, lng: 128.1555},
    aliases: ["강원", "강원도", "강원특별자치도"]
  },
  {
    id: "chungbuk",
    name: "충청북도",
    code: "43",
    parentId: null,
    center: {lat: 36.6357, lng: 127.4917},
    aliases: ["충북"]
  },
  {
    id: "chungnam",
    name: "충청남도",
    code: "44",
    parentId: null,
    center: {lat: 36.6588, lng: 126.6728},
    aliases: ["충남"]
  },
  {
    id: "jeonbuk",
    name: "전북특별자치도",
    code: "45",
    parentId: null,
    center: {lat: 35.7175, lng: 127.1530},
    aliases: ["전북", "전북특별자치도"]
  },
  {
    id: "jeonnam",
    name: "전라남도",
    code: "46",
    parentId: null,
    center: {lat: 34.8679, lng: 126.9910},
    aliases: ["전남"]
  },
  {
    id: "gyeongbuk",
    name: "경상북도",
    code: "47",
    parentId: null,
    center: {lat: 36.4919, lng: 128.8889},
    aliases: ["경북"]
  },
  {
    id: "gyeongnam",
    name: "경상남도",
    code: "48",
    parentId: null,
    center: {lat: 35.2383, lng: 128.6921},
    aliases: ["경남"]
  },
  {
    id: "jeju",
    name: "제주특별자치도",
    code: "50",
    parentId: null,
    center: {lat: 33.4996, lng: 126.5312},
    aliases: ["제주", "제주도", "제주시"]
  },
  {
    id: "unknown",
    name: "기타/미상",
    code: "00",
    parentId: null,
    center: {lat: 36.5, lng: 127.8},
    aliases: []
  }
];

const normalizeKey = (value: string): string => value.replace(/\s+/g, "").replace(/[^\u3131-\uD79D\w]/g, "").trim();

export const REGION_ALIAS_LOOKUP = REGION_METADATA.reduce<Record<string, RegionMetadata>>((acc, region) => {
  acc[region.name] = region;
  acc[normalizeKey(region.name)] = region;
  if (region.aliases) {
    for (const alias of region.aliases) {
      acc[alias] = region;
      acc[normalizeKey(alias)] = region;
    }
  }
  return acc;
}, {});

export const findRegionByName = (name: string | undefined | null): RegionMetadata => {
  if (!name) {
    return REGION_METADATA.find((region) => region.id === "unknown")!;
  }

  const trimmed = name.trim();
  const normalized = normalizeKey(trimmed);
  return REGION_ALIAS_LOOKUP[normalized] ?? REGION_ALIAS_LOOKUP[trimmed] ?? REGION_METADATA.find((region) => region.id === "unknown")!;
};
