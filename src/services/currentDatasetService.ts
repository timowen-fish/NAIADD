import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  getPublishedDeltaIndex,
  type PublishedDeltaIndex,
  type PublishedDeltaMetadata,
} from "./publishedDeltaService";
import {
  forceSyncSnapshot,
  getCachedSnapshotMetadata,
  readSnapshotCollectionRows,
  readSnapshotRows,
  syncSnapshotIfNeeded,
  type SnapshotSyncStatus,
} from "./snapshotService";

const PUBLISHED_DELTAS_COLLECTION = "publishedDeltas";
const ROW_CHUNKS_COLLECTION = "rowChunks";

export type CurrentDatasetRow = Record<string, unknown>;

export type DatasetSourceSummary = {
  snapshotVersion: string;
  snapshotRowCount: number;
  deltaIndexUpdatedAt: string;
  activeDeltaCount: number;
  deltaRowCount: number;
  totalRowCount: number;
  loadedAt: string;
};

export type CurrentDatasetResult = {
  rows: CurrentDatasetRow[];
  source: DatasetSourceSummary;
};

export type CurrentCollectionResult = {
  collectionId: string;
  rows: CurrentDatasetRow[];
  snapshotRowCount: number;
  deltaRowCount: number;
  loadedAt: string;
};

export type SiteSearchResult = {
  siteId: string;
  siteName: string;
  waterbody: string;
  latitude: number | null;
  longitude: number | null;
  collectionCount: number;
  rowCount: number;
  latestSurveyDate: string;
};

export type RefreshCurrentDatasetResult = {
  snapshot: SnapshotSyncStatus;
  dataset: CurrentDatasetResult;
};

type DeltaRowsCacheEntry = {
  checksum: string;
  rows: CurrentDatasetRow[];
};

type DatasetMemoryCache = {
  cacheKey: string;
  result: CurrentDatasetResult;
};

const deltaRowsCache = new Map<string, DeltaRowsCacheEntry>();
let datasetMemoryCache: DatasetMemoryCache | null = null;
let inFlightDatasetLoad: Promise<CurrentDatasetResult> | null = null;

function asRecord(value: unknown): CurrentDatasetRow {
  return value && typeof value === "object"
    ? (value as CurrentDatasetRow)
    : {};
}

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function firstText(
  row: CurrentDatasetRow,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }

  return "";
}

function firstNumber(
  row: CurrentDatasetRow,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = row[key];

    if (value === undefined || value === null || value === "") {
      continue;
    }

    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function collectionIdFromRow(row: CurrentDatasetRow): string {
  return firstText(row, [
    "CollectionID",
    "collectionID",
    "collectionId",
    "CollectionId",
  ]);
}

function siteIdFromRow(row: CurrentDatasetRow): string {
  return firstText(row, [
    "SiteID",
    "siteID",
    "siteId",
    "LocationID",
    "locationID",
    "locationId",
  ]);
}

function siteNameFromRow(row: CurrentDatasetRow): string {
  return firstText(row, [
    "SiteName",
    "siteName",
    "Site_Name",
    "LocationName",
    "locationName",
  ]);
}

function waterbodyFromRow(row: CurrentDatasetRow): string {
  return firstText(row, [
    "Waterbody",
    "waterbody",
    "WaterBody",
    "WaterbodyName",
    "waterbodyName",
    "StreamName",
  ]);
}

function surveyDateFromRow(row: CurrentDatasetRow): string {
  return firstText(row, [
    "Survey_Date",
    "SurveyDate",
    "surveyDate",
    "Date",
    "date",
  ]);
}

function latestDate(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;

  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return right.localeCompare(left) > 0 ? right : left;
  }

  return rightTime > leftTime ? right : left;
}

function normalizedUniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildDatasetCacheKey(
  snapshotVersion: string,
  index: PublishedDeltaIndex,
): string {
  const deltaSignature = index.activeDeltas
    .map((entry) => `${entry.deltaId}:${entry.checksum}`)
    .sort()
    .join("|");

  return [
    snapshotVersion,
    index.updatedAt,
    ...normalizedUniqueStrings(index.activeDeltaIds).sort(),
    deltaSignature,
  ].join("::");
}

async function ensureSnapshotAvailable(
  forceSnapshotRefresh = false,
): Promise<SnapshotSyncStatus> {
  const status = forceSnapshotRefresh
    ? await forceSyncSnapshot()
    : await syncSnapshotIfNeeded();

  if (
    status.state === "offline" &&
    !getCachedSnapshotMetadata()
  ) {
    throw new Error(status.message);
  }

  return status;
}

async function readPublishedDeltaRows(
  deltaId: string,
  expectedChecksum = "",
): Promise<CurrentDatasetRow[]> {
  const cached = deltaRowsCache.get(deltaId);

  if (
    cached &&
    (!expectedChecksum || cached.checksum === expectedChecksum)
  ) {
    return cached.rows;
  }

  const deltaReference = doc(
    db,
    PUBLISHED_DELTAS_COLLECTION,
    deltaId,
  );
  const deltaSnapshot = await getDoc(deltaReference);

  if (!deltaSnapshot.exists()) {
    throw new Error(`Published delta ${deltaId} was not found.`);
  }

  const metadata = deltaSnapshot.data() as PublishedDeltaMetadata;

  if (metadata.status !== "Published") {
    throw new Error(
      `Delta ${deltaId} has status ${metadata.status}, not Published.`,
    );
  }

  if (
    expectedChecksum &&
    metadata.checksum &&
    metadata.checksum !== expectedChecksum
  ) {
    throw new Error(
      `Delta ${deltaId} checksum does not match the active delta index.`,
    );
  }

  const chunksReference = collection(
    deltaReference,
    ROW_CHUNKS_COLLECTION,
  );
  const chunksSnapshot = await getDocs(
    query(chunksReference, orderBy("chunkIndex", "asc")),
  );

  const rows: CurrentDatasetRow[] = [];

  chunksSnapshot.docs.forEach((chunkDocument) => {
    const chunk = asRecord(chunkDocument.data());
    const chunkRows = Array.isArray(chunk.rows) ? chunk.rows : [];

    chunkRows.forEach((row) => {
      rows.push(asRecord(row));
    });
  });

  if (
    Number.isFinite(metadata.rowChunkCount) &&
    metadata.rowChunkCount !== chunksSnapshot.size
  ) {
    throw new Error(
      `Delta ${deltaId} expected ${metadata.rowChunkCount} row chunks but ${chunksSnapshot.size} were found.`,
    );
  }

  if (
    Number.isFinite(metadata.rowCount) &&
    metadata.rowCount !== rows.length
  ) {
    throw new Error(
      `Delta ${deltaId} expected ${metadata.rowCount} rows but ${rows.length} were loaded.`,
    );
  }

  deltaRowsCache.set(deltaId, {
    checksum: metadata.checksum || expectedChecksum,
    rows,
  });

  return rows;
}

async function loadActiveDeltaRows(
  index: PublishedDeltaIndex,
): Promise<CurrentDatasetRow[]> {
  const activeIds = normalizedUniqueStrings(index.activeDeltaIds);
  const activeEntries = new Map(
    index.activeDeltas.map((entry) => [entry.deltaId, entry]),
  );

  const activeIdSet = new Set(activeIds);

  for (const cachedId of deltaRowsCache.keys()) {
    if (!activeIdSet.has(cachedId)) {
      deltaRowsCache.delete(cachedId);
    }
  }

  const rowsByDelta = await Promise.all(
    activeIds.map((deltaId) =>
      readPublishedDeltaRows(
        deltaId,
        activeEntries.get(deltaId)?.checksum ?? "",
      ),
    ),
  );

  return rowsByDelta.flat();
}

async function buildCurrentDataset(
  forceReload = false,
): Promise<CurrentDatasetResult> {
  await ensureSnapshotAvailable(false);

  const snapshotMetadata = getCachedSnapshotMetadata();

  if (!snapshotMetadata) {
    throw new Error(
      "The NAIADD snapshot was not available after synchronization.",
    );
  }

  const deltaIndex = await getPublishedDeltaIndex();
  const cacheKey = buildDatasetCacheKey(
    snapshotMetadata.version,
    deltaIndex,
  );

  if (
    !forceReload &&
    datasetMemoryCache?.cacheKey === cacheKey
  ) {
    return datasetMemoryCache.result;
  }

  const [snapshotRows, deltaRows] = await Promise.all([
    readSnapshotRows(),
    loadActiveDeltaRows(deltaIndex),
  ]);

  const result: CurrentDatasetResult = {
    rows: [...snapshotRows, ...deltaRows],
    source: {
      snapshotVersion: snapshotMetadata.version,
      snapshotRowCount: snapshotRows.length,
      deltaIndexUpdatedAt: deltaIndex.updatedAt,
      activeDeltaCount: normalizedUniqueStrings(
        deltaIndex.activeDeltaIds,
      ).length,
      deltaRowCount: deltaRows.length,
      totalRowCount: snapshotRows.length + deltaRows.length,
      loadedAt: new Date().toISOString(),
    },
  };

  datasetMemoryCache = {
    cacheKey,
    result,
  };

  return result;
}

/**
 * Loads the complete active NAIADD dataset:
 * historic snapshot rows followed by all rows from active published deltas.
 */
export async function loadCurrentDataset(
  forceReload = false,
): Promise<CurrentDatasetResult> {
  if (forceReload) {
    clearCurrentDatasetMemoryCache();
  }

  if (inFlightDatasetLoad) {
    return inFlightDatasetLoad;
  }

  inFlightDatasetLoad = buildCurrentDataset(forceReload);

  try {
    return await inFlightDatasetLoad;
  } finally {
    inFlightDatasetLoad = null;
  }
}

/**
 * Loads a single collection without reading the entire historic snapshot.
 * Delta rows are filtered from the active published deltas.
 */
export async function loadCollection(
  collectionId: string,
): Promise<CurrentCollectionResult> {
  const normalizedCollectionId = collectionId.trim();

  if (!normalizedCollectionId) {
    throw new Error("CollectionID was empty.");
  }

  await ensureSnapshotAvailable(false);

  let snapshotRows: CurrentDatasetRow[] = [];

  try {
    snapshotRows = await readSnapshotCollectionRows(
      normalizedCollectionId,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    if (!message.includes("was not found in the collection index")) {
      throw error;
    }
  }

  const deltaIndex = await getPublishedDeltaIndex();
  const deltaRows = (await loadActiveDeltaRows(deltaIndex)).filter(
    (row) => collectionIdFromRow(row) === normalizedCollectionId,
  );

  return {
    collectionId: normalizedCollectionId,
    rows: [...snapshotRows, ...deltaRows],
    snapshotRowCount: snapshotRows.length,
    deltaRowCount: deltaRows.length,
    loadedAt: new Date().toISOString(),
  };
}

/**
 * Returns every active row associated with a SiteID or compatible location ID.
 */
export async function findSite(
  siteId: string,
): Promise<CurrentDatasetRow[]> {
  const normalizedSiteId = siteId.trim();

  if (!normalizedSiteId) {
    return [];
  }

  const dataset = await loadCurrentDataset();

  return dataset.rows.filter(
    (row) => siteIdFromRow(row) === normalizedSiteId,
  );
}

/**
 * Searches unique sites by SiteID, site name, waterbody, coordinates,
 * collection ID, and survey date.
 */
export async function searchSites(
  searchText: string,
  limit = 50,
): Promise<SiteSearchResult[]> {
  const normalizedSearch = searchText.trim().toLowerCase();
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const dataset = await loadCurrentDataset();

  type MutableSite = {
    siteId: string;
    siteName: string;
    waterbody: string;
    latitude: number | null;
    longitude: number | null;
    collectionIds: Set<string>;
    rowCount: number;
    latestSurveyDate: string;
    searchable: Set<string>;
  };

  const sites = new Map<string, MutableSite>();

  dataset.rows.forEach((row) => {
    const siteId = siteIdFromRow(row);
    const siteName = siteNameFromRow(row);
    const waterbody = waterbodyFromRow(row);
    const collectionId = collectionIdFromRow(row);
    const surveyDate = surveyDateFromRow(row);
    const latitude = firstNumber(row, [
      "Latitude",
      "latitude",
      "Lat",
      "lat",
      "DecimalLatitude",
      "decimalLatitude",
    ]);
    const longitude = firstNumber(row, [
      "Longitude",
      "longitude",
      "Lon",
      "lon",
      "Long",
      "long",
      "DecimalLongitude",
      "decimalLongitude",
    ]);

    const fallbackKey =
      siteId ||
      [
        waterbody.toLowerCase(),
        siteName.toLowerCase(),
        latitude ?? "",
        longitude ?? "",
      ].join("|");

    if (!fallbackKey.replaceAll("|", "")) {
      return;
    }

    const existing = sites.get(fallbackKey) ?? {
      siteId,
      siteName,
      waterbody,
      latitude,
      longitude,
      collectionIds: new Set<string>(),
      rowCount: 0,
      latestSurveyDate: "",
      searchable: new Set<string>(),
    };

    if (!existing.siteId && siteId) existing.siteId = siteId;
    if (!existing.siteName && siteName) existing.siteName = siteName;
    if (!existing.waterbody && waterbody) existing.waterbody = waterbody;
    if (existing.latitude === null && latitude !== null) {
      existing.latitude = latitude;
    }
    if (existing.longitude === null && longitude !== null) {
      existing.longitude = longitude;
    }

    if (collectionId) existing.collectionIds.add(collectionId);

    existing.rowCount += 1;
    existing.latestSurveyDate = latestDate(
      existing.latestSurveyDate,
      surveyDate,
    );

    [
      siteId,
      siteName,
      waterbody,
      collectionId,
      surveyDate,
      latitude,
      longitude,
    ].forEach((value) => {
      const normalized = text(value).toLowerCase();
      if (normalized) existing.searchable.add(normalized);
    });

    sites.set(fallbackKey, existing);
  });

  return [...sites.values()]
    .filter(
      (site) =>
        !normalizedSearch ||
        [...site.searchable].some((value) =>
          value.includes(normalizedSearch),
        ),
    )
    .sort((left, right) => {
      const waterbodyCompare = left.waterbody.localeCompare(
        right.waterbody,
      );

      if (waterbodyCompare !== 0) return waterbodyCompare;

      const siteNameCompare = left.siteName.localeCompare(
        right.siteName,
      );

      if (siteNameCompare !== 0) return siteNameCompare;

      return left.siteId.localeCompare(right.siteId);
    })
    .slice(0, safeLimit)
    .map((site) => ({
      siteId: site.siteId,
      siteName: site.siteName,
      waterbody: site.waterbody,
      latitude: site.latitude,
      longitude: site.longitude,
      collectionCount: site.collectionIds.size,
      rowCount: site.rowCount,
      latestSurveyDate: site.latestSurveyDate,
    }));
}

/**
 * Forces the encrypted snapshot to refresh, clears all in-memory delta/data
 * caches, and rebuilds the current dataset from its authoritative sources.
 */
export async function refreshCurrentDataset(): Promise<RefreshCurrentDatasetResult> {
  const snapshot = await ensureSnapshotAvailable(true);

  clearCurrentDatasetMemoryCache();

  const dataset = await loadCurrentDataset(true);

  return {
    snapshot,
    dataset,
  };
}

/**
 * Clears only in-memory caches. It does not remove the IndexedDB snapshot.
 */
export function clearCurrentDatasetMemoryCache(): void {
  datasetMemoryCache = null;
  inFlightDatasetLoad = null;
  deltaRowsCache.clear();
}

/**
 * Returns the currently loaded result without triggering disk or network I/O.
 */
export function getCurrentDatasetFromMemory(): CurrentDatasetResult | null {
  return datasetMemoryCache?.result ?? null;
}
