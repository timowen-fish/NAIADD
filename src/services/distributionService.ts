import { readSnapshotRows } from "./snapshotService";

export type DistributionCondition = "Live" | "Shell" | "Historic" | "Unknown";

export type DistributionRecord = {
  id: string;
  sourceRow: number;
  sourceFile: string;
  dataset: string;
  datasetGroup: string;
  bova: string;
  scientificName: string;
  surveyDate: string;
  surveyDateValue: number | null;
  latitude: number;
  longitude: number;
  condition: DistributionCondition;
  project: string;
  raw: Record<string, unknown>;
};

export type DistributionSpecies = {
  bova: string;
  scientificName: string;
  commonName: string;
  label: string;
};

type JsonRecord = Record<string, unknown>;

type DatasetManifestEntry = {
  dataset: string;
  sourceFile: string;
  files: string[] | string;
};

type DistributionManifest = {
  version: number;
  datasets: DatasetManifestEntry[];
};

const DISTRIBUTION_BASE = "/data/distributions";
const MANIFEST_URL = `${DISTRIBUTION_BASE}/observations/manifest.json`;
const SPECIES_URL = `${DISTRIBUTION_BASE}/lookups/species-reference.json`;

const SNAPSHOT_COLUMNS = [
  "BOVA",
  "ScientificName",
  "Scientific_Name",
  "SurveyDate",
  "Survey_Date",
  "Latitude",
  "Longitude",
  "LatitudeDD",
  "LongitudeDD",
  "Condition",
  "Project",
  "Dataset",
  "HistoricData",
  "CollectionID",
  "SpecimenID",
];

let cachedStaticRecords: DistributionRecord[] | null = null;
let cachedSpecies: DistributionSpecies[] | null = null;
let cachedSpeciesReference: Map<string, DistributionSpecies> | null = null;

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function first(row: JsonRecord, candidates: string[]): unknown {
  for (const candidate of candidates) {
    if (candidate in row) return row[candidate];
  }

  return undefined;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(text(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBova(value: unknown): string {
  const digits = text(value).replace(/\D/g, "");
  return digits ? digits.padStart(6, "0") : "";
}

function bovaMatchKey(value: unknown): string {
  const digits = text(value).replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/^0+/, "") || "0";
}

function parseDate(value: unknown): {
  display: string;
  timestamp: number | null;
} {
  const raw = text(value);

  if (!raw || ["NA", "NaN", "Unknown", "UNKNOWN"].includes(raw)) {
    return { display: "Unknown", timestamp: null };
  }

  const parsed = new Date(raw);

  if (Number.isFinite(parsed.getTime())) {
    return {
      display: parsed.toLocaleDateString(),
      timestamp: parsed.getTime(),
    };
  }

  const mdy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);

  if (mdy) {
    const year = Number(mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3]);
    const fallback = new Date(year, Number(mdy[1]) - 1, Number(mdy[2]));

    if (Number.isFinite(fallback.getTime())) {
      return {
        display: fallback.toLocaleDateString(),
        timestamp: fallback.getTime(),
      };
    }
  }

  return { display: raw, timestamp: null };
}

function datasetGroup(datasetValue: unknown, sourceFile: string): string {
  const normalized = text(datasetValue || sourceFile)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (["naiadd", "naiaddsnapshot", "aquaticsnongameoutput"].includes(normalized)) {
    return "NAIADD Snapshot";
  }

  if (["brianreleasedatabase", "releaseoutput"].includes(normalized)) {
    return "Brian Release Database";
  }

  if (["vafwis", "vafwislatlong"].includes(normalized)) {
    return "VAFWIS";
  }

  if (["aldermandataset", "jmadataset", "jma"].includes(normalized)) {
    return "Alderman Dataset";
  }

  if (["naturalheritage", "naturalheritageclean", "nhp"].includes(normalized)) {
    return "Natural Heritage";
  }

  if (
    ["ortmannhistoricdataset", "historicortmanndata", "ortmann"].includes(
      normalized,
    )
  ) {
    return "Ortmann Historic Dataset";
  }

  return text(datasetValue) || sourceFile.replace(/\.rds$/i, "");
}

function normalizeCondition(
  conditionValue: unknown,
  historicValue: unknown,
  group: string,
): DistributionCondition {
  if (group === "Brian Release Database") return "Live";

  const condition = text(conditionValue);
  const historic = text(historicValue).toLowerCase();

  if (
    historic === "yes" ||
    ["D", "Historic"].includes(condition)
  ) {
    return "Historic";
  }

  if (["Live", "L", "N"].includes(condition)) return "Live";

  if (
    ["F", "Fresh Dead", "Qualitative", "Relic Shell", "S", "Shell"].includes(
      condition,
    )
  ) {
    return "Shell";
  }

  return "Unknown";
}

function normalizeRecord(
  row: JsonRecord,
  sourceFile: string,
  sourceRow: number,
): DistributionRecord | null {
  const latitude = numberValue(
    first(row, [
      "Latitude",
      "latitude",
      "LatitudeDD",
      "LatDD",
      "ReleaseLatitude",
      "Lat",
      "LAT",
    ]),
  );
  const longitude = numberValue(
    first(row, [
      "Longitude",
      "longitude",
      "LongitudeDD",
      "LongDD",
      "ReleaseLongitude",
      "Lon",
      "Long",
      "LONG",
    ]),
  );

  if (
    latitude === null ||
    longitude === null ||
    latitude === 0 ||
    longitude === 0 ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const group = datasetGroup(first(row, ["Dataset", "dataset"]), sourceFile);
  const date = parseDate(
    first(row, [
      "SurveyDate",
      "Survey_Date",
      "ReleaseDate",
      "ObsDate",
      "Date",
    ]),
  );
  const bova = normalizeBova(
    first(row, ["BOVA", "Bova", "bova", "SppBova"]),
  );
  const scientificName = text(
    first(row, [
      "ScientificName",
      "Scientific_Name",
      "Scientific Name",
      "Species",
    ]),
  );

  return {
    id:
      text(first(row, ["TableID", "SpecimenID", "CollectionID"])) ||
      `${sourceFile.replace(/\.rds$/i, "")}__${sourceRow}`,
    sourceRow,
    sourceFile,
    dataset: text(first(row, ["Dataset", "dataset"])) || group,
    datasetGroup: group,
    bova,
    scientificName,
    surveyDate: date.display,
    surveyDateValue: date.timestamp,
    latitude,
    longitude,
    condition: normalizeCondition(
      first(row, ["Condition", "condition", "Cond"]),
      first(row, ["HistoricData", "Historic", "historic"]),
      group,
    ),
    project:
      text(
        first(row, [
          "Project",
          "project",
          "PartnersandAffiliatedProjects",
          "DB_Description",
        ]),
      ) || "Unknown",
    raw: row,
  };
}

async function fetchJson<T>(
  url: string,
  cache: RequestCache = "force-cache",
): Promise<T> {
  const response = await fetch(url, { cache });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}.`);
  }

  const body = await response.text();

  if (!body.trim()) {
    throw new Error(`${url} was empty.`);
  }

  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw new Error(
      `${url} contains invalid or incomplete JSON: ${
        error instanceof Error ? error.message : "parse failed"
      }`,
    );
  }
}

async function fetchJsonRows(
  url: string,
  cache: RequestCache = "force-cache",
): Promise<JsonRecord[]> {
  const value = await fetchJson<unknown>(url, cache);

  if (!Array.isArray(value)) {
    throw new Error(`${url} did not contain a JSON array.`);
  }

  return value.filter(
    (item): item is JsonRecord => Boolean(item && typeof item === "object"),
  );
}

async function loadStaticRecords(): Promise<DistributionRecord[]> {
  if (cachedStaticRecords) return cachedStaticRecords;

  const manifest = await fetchJson<DistributionManifest>(
    `${MANIFEST_URL}?t=${Date.now()}`,
    "no-store",
  );

  if (!manifest || !Array.isArray(manifest.datasets)) {
    throw new Error(`${MANIFEST_URL} is missing its datasets list.`);
  }

  const loaded: DistributionRecord[] = [];

  for (const dataset of manifest.datasets) {
    let sourceRow = 0;

    const files = Array.isArray(dataset.files)
      ? dataset.files
      : typeof dataset.files === "string" && dataset.files.trim()
        ? [dataset.files]
        : [];

    for (const relativePath of files) {
      const rows = await fetchJsonRows(
        `${DISTRIBUTION_BASE}/observations/${relativePath}?v=${manifest.version}`,
        "reload",
      );

      for (const row of rows) {
        sourceRow += 1;
        const normalized = normalizeRecord(
          {
            ...row,
            Dataset: row.Dataset || dataset.dataset,
          },
          dataset.sourceFile,
          sourceRow,
        );

        if (normalized) loaded.push(normalized);
      }
    }
  }

  cachedStaticRecords = loaded;
  return cachedStaticRecords;
}

async function loadSnapshotRecords(): Promise<DistributionRecord[]> {
  const rows = await readSnapshotRows({ columns: SNAPSHOT_COLUMNS });

  return rows
    .map((row, index) =>
      normalizeRecord(
        {
          ...row,
          Dataset: "NAIADD Snapshot",
        },
        "NAIADD_Snapshot.parquet",
        index + 1,
      ),
    )
    .filter((record): record is DistributionRecord => record !== null);
}

async function loadSpeciesReference(): Promise<
  Map<string, DistributionSpecies>
> {
  if (cachedSpeciesReference) return cachedSpeciesReference;

  const lookupRows = await fetchJsonRows(
    `${SPECIES_URL}?t=${Date.now()}`,
    "no-store",
  );
  const reference = new Map<string, DistributionSpecies>();

  for (const row of lookupRows) {
    const rawBova = first(row, ["BOVA", "Bova", "bova"]);
    const key = bovaMatchKey(rawBova);
    const bova = normalizeBova(rawBova);
    const scientificName = text(
      first(row, ["ScientificName", "Scientific_Name", "Scientific Name"]),
    );
    const commonName = text(
      first(row, [
        "CommonName",
        "Common_Name",
        "Common Name",
        "COMMON_NAME",
        "COMMON_NAM",
      ]),
    );

    if (!key || !bova || !scientificName) continue;

    reference.set(key, {
      bova,
      scientificName,
      commonName,
      label: `${scientificName} (${bova})`,
    });
  }

  cachedSpeciesReference = reference;
  return reference;
}

export async function loadDistributionRecords(): Promise<DistributionRecord[]> {
  const [snapshot, historical, speciesReference] = await Promise.all([
    loadSnapshotRecords(),
    loadStaticRecords(),
    loadSpeciesReference(),
  ]);

  return [...snapshot, ...historical].map((record) => {
    const referenceSpecies = speciesReference.get(bovaMatchKey(record.bova));

    if (!referenceSpecies) return record;

    return {
      ...record,
      bova: referenceSpecies.bova,
      scientificName: referenceSpecies.scientificName,
    };
  });
}

export async function loadDistributionSpecies(
  records: DistributionRecord[],
): Promise<DistributionSpecies[]> {
  if (cachedSpecies) return cachedSpecies;

  const speciesReference = await loadSpeciesReference();
  const occurrenceKeys = new Set(
    records.map((record) => bovaMatchKey(record.bova)).filter(Boolean),
  );

  cachedSpecies = [...speciesReference.entries()]
    .filter(([key]) => occurrenceKeys.has(key))
    .map(([, species]) => species)
    .sort((left, right) => left.scientificName.localeCompare(right.scientificName));

  return cachedSpecies;
}

export function exportDistributionRecords(
  rows: DistributionRecord[],
  fileName = "NAIADD_Distribution_Records.csv",
): void {
  const columns = [
    "Dataset",
    "BOVA",
    "ScientificName",
    "SurveyDate",
    "Condition",
    "Project",
    "Latitude",
    "Longitude",
    "SourceFile",
    "SourceRow",
  ];

  const escape = (value: unknown) => {
    const stringValue = value === null || value === undefined ? "" : String(value);
    return `"${stringValue.replaceAll('"', '""')}"`;
  };

  const lines = [
    columns.join(","),
    ...rows.map((row) =>
      [
        row.datasetGroup,
        row.bova,
        row.scientificName,
        row.surveyDate,
        row.condition,
        row.project,
        row.latitude,
        row.longitude,
        row.sourceFile,
        row.sourceRow,
      ]
        .map(escape)
        .join(","),
    ),
  ];

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
