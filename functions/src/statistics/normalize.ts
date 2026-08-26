import {createHash} from "node:crypto";
import iconv from "iconv-lite";
import {parse} from "csv-parse/sync";
import type {PoliceStatisticsYear, StatisticsCategoryCounts, StatisticsCategoryKey} from "./types";

const DATASET_TITLE = "경찰청 연도별 실종아동등 가출인 접수 및 해제현황";
const CATEGORY_HEADERS: Record<StatisticsCategoryKey, string> = {
  children: "18세_미만_아동",
  disabled: "지적자폐성정신장애인",
  dementia: "치매환자",
  adult: "가출인(실종성인)",
};
const REQUIRED_HEADERS = [
  "연도",
  ...Object.values(CATEGORY_HEADERS).flatMap((prefix) => [`${prefix}_접수`, `${prefix}_해제`, `${prefix}_미해제`]),
];

const asNonNegativeInteger = (value: unknown, label: string): number => {
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`Invalid non-negative integer for ${label}`);
  return Number(normalized);
};

export const getDaysInYear = (year: number): number =>
  year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0) ? 366 : 365;

const percent = (current: number, previous: number): number | null =>
  previous === 0 ? null : Number((((current - previous) / previous) * 100).toFixed(3));

export const sha256 = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");

export const decodeStatisticsCsv = (buffer: Buffer, encoding: string): string => {
  const normalizedEncoding = encoding.toLowerCase();
  const decoded = normalizedEncoding === "utf8" || normalizedEncoding === "utf-8"
    ? buffer.toString("utf8")
    : iconv.decode(buffer, encoding);
  return decoded.replace(/^\uFEFF/, "");
};

export const parseAndNormalizeStatistics = (input: {
  buffer: Buffer;
  encoding: string;
  sourceHash: string;
  storagePath?: string;
  datasetCutoff?: string | null;
  officialPageUrl?: string | null;
}): PoliceStatisticsYear[] => {
  const records = parse(decodeStatisticsCsv(input.buffer, input.encoding), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, unknown>[];
  if (records.length === 0) throw new Error("CSV contains no data rows");

  const presentHeaders = new Set(Object.keys(records[0] || {}));
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !presentHeaders.has(header));
  if (missingHeaders.length) throw new Error(`Missing required headers: ${missingHeaders.join(", ")}`);

  const seenYears = new Set<number>();
  const rows = records.map((record): PoliceStatisticsYear => {
    const year = asNonNegativeInteger(record["연도"], "연도");
    if (year < 2000 || year > new Date().getUTCFullYear() + 1) throw new Error(`Year out of expected range: ${year}`);
    if (seenYears.has(year)) throw new Error(`Duplicate year: ${year}`);
    seenYears.add(year);

    const categories = {} as Record<StatisticsCategoryKey, StatisticsCategoryCounts>;
    (Object.entries(CATEGORY_HEADERS) as Array<[StatisticsCategoryKey, string]>).forEach(([key, prefix]) => {
      categories[key] = {
        received: asNonNegativeInteger(record[`${prefix}_접수`], `${prefix}_접수`),
        released: asNonNegativeInteger(record[`${prefix}_해제`], `${prefix}_해제`),
        unresolved: asNonNegativeInteger(record[`${prefix}_미해제`], `${prefix}_미해제`),
      };
    });

    const values = Object.values(categories);
    const received = values.reduce((sum, value) => sum + value.received, 0);
    const released = values.reduce((sum, value) => sum + value.released, 0);
    const unresolved = values.reduce((sum, value) => sum + value.unresolved, 0);
    const vulnerableReceived = categories.children.received + categories.disabled.received + categories.dementia.received;
    const daysInYear = getDaysInYear(year);

    return {
      year,
      categories,
      totals: {received, released, unresolved, vulnerableReceived},
      derived: {
        daysInYear,
        dailyAverageReceived: Number((received / daysInYear).toFixed(3)),
        dailyAverageVulnerableReceived: Number((vulnerableReceived / daysInYear).toFixed(3)),
        yearOverYearPercent: {},
      },
      source: {
        sourceId: "police_missing_statistics",
        datasetTitle: DATASET_TITLE,
        datasetCutoff: input.datasetCutoff ?? null,
        sourceHash: input.sourceHash,
        ...(input.storagePath ? {storagePath: input.storagePath} : {}),
        encoding: input.encoding,
        officialPageUrl: input.officialPageUrl ?? null,
      },
      schemaVersion: 1,
      published: true,
    };
  }).sort((left, right) => left.year - right.year);

  rows.forEach((current, index) => {
    const previous = rows[index - 1];
    if (!previous || current.year !== previous.year + 1) return;
    current.derived.yearOverYearPercent = {
      received: percent(current.totals.received, previous.totals.received),
      released: percent(current.totals.released, previous.totals.released),
      unresolved: percent(current.totals.unresolved, previous.totals.unresolved),
      vulnerableReceived: percent(current.totals.vulnerableReceived, previous.totals.vulnerableReceived),
      childrenReceived: percent(current.categories.children.received, previous.categories.children.received),
      disabledReceived: percent(current.categories.disabled.received, previous.categories.disabled.received),
      dementiaReceived: percent(current.categories.dementia.received, previous.categories.dementia.received),
      adultReceived: percent(current.categories.adult.received, previous.categories.adult.received),
    };
  });
  return rows;
};
