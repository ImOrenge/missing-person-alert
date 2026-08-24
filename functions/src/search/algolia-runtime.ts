import axios from "axios";
import {AlgoliaConfig} from "./algolia-client";

const SECRET_CACHE_TTL_MS = 5 * 60_000;
const secretCache = new Map<string, {value: string; expiresAt: number}>();
let metadataTokenCache: {value: string; expiresAt: number} | null = null;

const accessToken = async (): Promise<string> => {
  if (metadataTokenCache && metadataTokenCache.expiresAt > Date.now()) return metadataTokenCache.value;
  const response = await axios.get("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    timeout: 2000,
    headers: {"Metadata-Flavor": "Google"},
  });
  const value = typeof response.data?.access_token === "string" ? response.data.access_token : "";
  const expiresIn = Number(response.data?.expires_in) || 300;
  if (!value) throw new Error("GCP_METADATA_TOKEN_UNAVAILABLE");
  metadataTokenCache = {value, expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000};
  return value;
};

const readSecret = async (name: string): Promise<string> => {
  const localValue = process.env[name]?.trim();
  if (localValue) return localValue;
  const cached = secretCache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) throw new Error("GCP_PROJECT_UNAVAILABLE");
  const token = await accessToken();
  const response = await axios.get(
    `https://secretmanager.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/secrets/${encodeURIComponent(name)}/versions/latest:access`,
    {timeout: 3000, headers: {Authorization: `Bearer ${token}`}},
  );
  const encoded = typeof response.data?.payload?.data === "string" ? response.data.payload.data : "";
  const value = encoded ? Buffer.from(encoded, "base64").toString("utf8").trim() : "";
  if (!value) throw new Error(`SECRET_VALUE_UNAVAILABLE:${name}`);
  secretCache.set(name, {value, expiresAt: Date.now() + SECRET_CACHE_TTL_MS});
  return value;
};

const indexPrefix = (): string => process.env.ALGOLIA_INDEX_PREFIX?.trim() || "missingalert_prod";

export const getAlgoliaSearchConfig = async (): Promise<Partial<AlgoliaConfig>> => ({
  applicationId: await readSecret("ALGOLIA_APPLICATION_ID"),
  apiKey: await readSecret("ALGOLIA_SEARCH_API_KEY"),
  indexPrefix: indexPrefix(),
});

export const getAlgoliaWriteConfig = async (): Promise<Partial<AlgoliaConfig>> => ({
  applicationId: await readSecret("ALGOLIA_APPLICATION_ID"),
  apiKey: await readSecret("ALGOLIA_WRITE_API_KEY"),
  indexPrefix: indexPrefix(),
});
