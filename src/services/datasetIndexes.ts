import type { CurrentDatasetRow } from "./currentDatasetService";

export type DatasetIndexSummary = {
  rowCount: number;
  collectionCount: number;
  siteCount: number;
  waterbodyCount: number;
  speciesCount: number;
};

export type DatasetIndexes = {
  byCollectionId: Map<string, CurrentDatasetRow[]>;
  bySiteId: Map<string, CurrentDatasetRow[]>;
  byWaterbody: Map<string, CurrentDatasetRow[]>;
  bySpecies: Map<string, CurrentDatasetRow[]>;
  collectionIds: string[];
  siteIds: string[];
  waterbodies: string[];
  species: string[];
  summary: DatasetIndexSummary;
};

const COLLECTION_ID_FIELDS = [
  "CollectionID",
  "collectionID",
  "collectionId",
  "CollectionId",
] as const;

const SITE_ID_FIELDS = [
  "SiteID",
  "siteID",
  "siteId",
  "LocationID",
  "locationID",
  "locationId",
] as const;

const WATERBODY_FIELDS = [
  "Waterbody",
  "waterbody",
  "WaterBody",
  "WaterbodyName",
  "waterbodyName",
  "StreamName",
] as const;

const SPECIES_FIELDS = [
  "CommonName",
  "commonName",
  "ScientificName",
  "scientificName",
  "Species",
  "species",
  "Taxon",
  "taxon",
  "AcceptedCommonName",
  "acceptedCommonName",
  "AcceptedScientificName",
  "acceptedScientificName",
] as const;

const EMPTY_SPECIES_VALUES = new Set([
  "nofish",
  "nospecimen",
  "none",
  "not observed",
  "notobserved",
]);

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function firstText(
  row: CurrentDatasetRow,
  fields: readonly string[],
): string {
  for (const field of fields) {
    const value = normalizeText(row[field]);
    if (value) return value;
  }

  return "";
}


function speciesIndexValue(row: CurrentDatasetRow): string {
  const value = firstText(row, SPECIES_FIELDS);

  if (!value) {
    return "";
  }

  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  return EMPTY_SPECIES_VALUES.has(normalized) ? "" : value;
}

function appendToIndex(
  index: Map<string, CurrentDatasetRow[]>,
  key: string,
  row: CurrentDatasetRow,
): void {
  if (!key) return;

  const existing = index.get(key);

  if (existing) {
    existing.push(row);
    return;
  }

  index.set(key, [row]);
}

function sortedKeys(index: Map<string, CurrentDatasetRow[]>): string[] {
  return [...index.keys()].sort((left, right) =>
    left.localeCompare(right, undefined, {
      sensitivity: "base",
      numeric: true,
    }),
  );
}

export function buildDatasetIndexes(
  rows: CurrentDatasetRow[],
): DatasetIndexes {
  const byCollectionId = new Map<string, CurrentDatasetRow[]>();
  const bySiteId = new Map<string, CurrentDatasetRow[]>();
  const byWaterbody = new Map<string, CurrentDatasetRow[]>();
  const bySpecies = new Map<string, CurrentDatasetRow[]>();

  for (const row of rows) {
    appendToIndex(
      byCollectionId,
      firstText(row, COLLECTION_ID_FIELDS),
      row,
    );
    appendToIndex(bySiteId, firstText(row, SITE_ID_FIELDS), row);
    appendToIndex(
      byWaterbody,
      firstText(row, WATERBODY_FIELDS),
      row,
    );
    appendToIndex(bySpecies, speciesIndexValue(row), row);
  }

  const collectionIds = sortedKeys(byCollectionId);
  const siteIds = sortedKeys(bySiteId);
  const waterbodies = sortedKeys(byWaterbody);
  const species = sortedKeys(bySpecies);

  return {
    byCollectionId,
    bySiteId,
    byWaterbody,
    bySpecies,
    collectionIds,
    siteIds,
    waterbodies,
    species,
    summary: {
      rowCount: rows.length,
      collectionCount: collectionIds.length,
      siteCount: siteIds.length,
      waterbodyCount: waterbodies.length,
      speciesCount: species.length,
    },
  };
}

export function getCollectionRows(
  indexes: DatasetIndexes,
  collectionId: string,
): CurrentDatasetRow[] {
  return indexes.byCollectionId.get(collectionId.trim()) ?? [];
}

export function getSiteRows(
  indexes: DatasetIndexes,
  siteId: string,
): CurrentDatasetRow[] {
  return indexes.bySiteId.get(siteId.trim()) ?? [];
}

export function getWaterbodyRows(
  indexes: DatasetIndexes,
  waterbody: string,
): CurrentDatasetRow[] {
  return indexes.byWaterbody.get(waterbody.trim()) ?? [];
}

export function getSpeciesRows(
  indexes: DatasetIndexes,
  speciesName: string,
): CurrentDatasetRow[] {
  return indexes.bySpecies.get(speciesName.trim()) ?? [];
}
