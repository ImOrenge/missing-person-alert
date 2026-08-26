const SAFE182_SOURCE_ID = "safe182_missing_persons";
const SAFE182_OFFICIAL_URL = "https://www.safe182.go.kr/";

const publicScalarFields = [
  "name", "age", "currentAge", "ageAtMissing", "gender", "photo", "description",
  "missingDate", "type", "status", "source", "seoVisible", "height", "weight",
  "clothes", "bodyType", "faceShape", "hairShape", "hairColor", "apiTargetCode",
  "updatedAt", "commentCount", "commentStats", "viewCount", "viewStats", "schemaVersion",
] as const;

export const isPublicOfficialMissingPerson = (data: Record<string, any>): boolean =>
  data.source === "api" && data.status === "active" && data.seoVisible !== false;

export const projectPublicMissingPerson = (
  documentId: string,
  data: Record<string, any>,
  datasetLastCheckedAt?: unknown,
): Record<string, unknown> | null => {
  if (!isPublicOfficialMissingPerson(data)) return null;

  const projected: Record<string, unknown> = {id: documentId};
  publicScalarFields.forEach((field) => {
    if (data[field] !== undefined) projected[field] = data[field];
  });
  if (data.location && typeof data.location === "object") {
    projected.location = {
      lat: data.location.lat,
      lng: data.location.lng,
      address: data.location.address,
    };
  }
  if (Array.isArray(data.photos)) projected.photos = data.photos.slice(0, 5);

  const sourceTrace = data.sourceTrace && typeof data.sourceTrace === "object" ? data.sourceTrace : {};
  projected.sourceTrace = {
    agency: typeof sourceTrace.agency === "string" ? sourceTrace.agency : "경찰청",
    sourceId: typeof sourceTrace.sourceId === "string" ? sourceTrace.sourceId : SAFE182_SOURCE_ID,
    officialUrl: typeof sourceTrace.officialUrl === "string" ? sourceTrace.officialUrl : SAFE182_OFFICIAL_URL,
    ...(sourceTrace.sourcePublishedAt ? {sourcePublishedAt: sourceTrace.sourcePublishedAt} : {}),
    ...(sourceTrace.sourceUpdatedAt ? {sourceUpdatedAt: sourceTrace.sourceUpdatedAt} : {}),
    ...(datasetLastCheckedAt || sourceTrace.lastCheckedAt ? {
      lastCheckedAt: datasetLastCheckedAt || sourceTrace.lastCheckedAt,
    } : {}),
  };
  projected.visibility = {
    public: data.visibility?.public !== false,
    searchable: data.visibility?.searchable !== false,
    shareable: data.visibility?.shareable !== false,
  };

  return projected;
};
