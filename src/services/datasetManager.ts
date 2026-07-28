import {
  ensureCollectionIndex,
  forceSyncSnapshot,
  getCachedSnapshotMetadata,
  syncSnapshotIfNeeded,
  type CollectionIndexRecord,
} from "./snapshotService";
import {
  getPublishedDeltaIndex,
  type PublishedDeltaIndex,
} from "./publishedDeltaService";
import {
  loadCollection,
  type CurrentCollectionResult,
} from "./currentDatasetService";

export type DatasetManagerStatus =
  | "idle"
  | "loading"
  | "ready"
  | "refreshing"
  | "error";

export type DatasetManagerEventType =
  | "loading"
  | "loaded"
  | "refreshing"
  | "refreshed"
  | "error"
  | "cleared";

export type DatasetManagerDiagnostics = {
  status: DatasetManagerStatus;
  initialized: boolean;
  catalogOnly: boolean;
  snapshotVersion: string;
  snapshotRowCount: number;
  activeDeltaCount: number;
  deltaRowCount: number;
  totalRowCount: number;
  collectionCount: number;
  siteCount: number;
  waterbodyCount: number;
  speciesCount: number | null;
  loadedAt: string;
  indexBuiltAt: string;
  loadDurationMs: number;
  lastError: string;
};

export type DatasetManagerEvent = {
  type: DatasetManagerEventType;
  diagnostics: DatasetManagerDiagnostics;
  error?: Error;
};

export type DatasetManagerListener = (
  event: DatasetManagerEvent,
) => void;

type DatasetCatalog = {
  collectionIndex: CollectionIndexRecord[];
  deltaIndex: PublishedDeltaIndex;
};

const listeners = new Set<DatasetManagerListener>();

let status: DatasetManagerStatus = "idle";
let catalog: DatasetCatalog | null = null;
let inFlightLoad: Promise<void> | null = null;
let lastError = "";
let loadedAt = "";
let indexBuiltAt = "";
let loadDurationMs = 0;

function normalizeError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(String(error));
}

function uniqueCount(
  records: CollectionIndexRecord[],
  field: "CollectionID" | "SiteID" | "Waterbody",
): number {
  const values = new Set<string>();

  for (const record of records) {
    const value = record[field];

    if (typeof value === "string" && value.trim()) {
      values.add(value.trim());
    }
  }

  return values.size;
}

function snapshotRowCount(
  records: CollectionIndexRecord[],
): number {
  return records.reduce((total, record) => {
    const value = Number(record.rowCount);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function deltaRowCount(index: PublishedDeltaIndex): number {
  return index.activeDeltas.reduce((total, delta) => {
    const value = Number(delta.rowCount);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function getDiagnostics(): DatasetManagerDiagnostics {
  const snapshotMeta = getCachedSnapshotMetadata();
  const collectionIndex = catalog?.collectionIndex ?? [];
  const deltaIndex = catalog?.deltaIndex;
  const historicRows = snapshotRowCount(collectionIndex);
  const publishedRows = deltaIndex
    ? deltaRowCount(deltaIndex)
    : 0;

  return {
    status,
    initialized: catalog !== null,
    catalogOnly: true,
    snapshotVersion: snapshotMeta?.version ?? "",
    snapshotRowCount: historicRows,
    activeDeltaCount:
      deltaIndex?.activeDeltaIds.length ?? 0,
    deltaRowCount: publishedRows,
    totalRowCount: historicRows + publishedRows,
    collectionCount: uniqueCount(
      collectionIndex,
      "CollectionID",
    ),
    siteCount: uniqueCount(collectionIndex, "SiteID"),
    waterbodyCount: uniqueCount(
      collectionIndex,
      "Waterbody",
    ),
    speciesCount: null,
    loadedAt,
    indexBuiltAt,
    loadDurationMs,
    lastError,
  };
}

function emit(
  type: DatasetManagerEventType,
  error?: Error,
): void {
  const event: DatasetManagerEvent = {
    type,
    diagnostics: getDiagnostics(),
    error,
  };

  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (listenerError) {
      console.error(
        "A DatasetManager listener failed.",
        listenerError,
      );
    }
  });
}

async function loadCatalog(
  forceRefresh: boolean,
): Promise<void> {
  if (!forceRefresh && catalog) {
    return;
  }

  if (inFlightLoad) {
    return inFlightLoad;
  }

  const startedAt = performance.now();
  status = forceRefresh ? "refreshing" : "loading";
  emit(forceRefresh ? "refreshing" : "loading");

  inFlightLoad = (async () => {
    try {
      if (forceRefresh) {
        await forceSyncSnapshot();
      } else {
        await syncSnapshotIfNeeded();
      }

      const [collectionIndex, deltaIndex] =
        await Promise.all([
          ensureCollectionIndex(),
          getPublishedDeltaIndex(),
        ]);

      catalog = {
        collectionIndex,
        deltaIndex,
      };

      loadedAt = new Date().toISOString();
      indexBuiltAt = loadedAt;
      loadDurationMs = Math.max(
        0,
        performance.now() - startedAt,
      );
      lastError = "";
      status = "ready";

      emit(forceRefresh ? "refreshed" : "loaded");
    } catch (error) {
      const normalized = normalizeError(error);
      lastError = normalized.message;
      status = "error";
      emit("error", normalized);
      throw normalized;
    } finally {
      inFlightLoad = null;
    }
  })();

  return inFlightLoad;
}

function initialize(): Promise<void> {
  return loadCatalog(false);
}

function refresh(): Promise<void> {
  catalog = null;
  return loadCatalog(true);
}

function clear(): void {
  catalog = null;
  inFlightLoad = null;
  lastError = "";
  loadedAt = "";
  indexBuiltAt = "";
  loadDurationMs = 0;
  status = "idle";
  emit("cleared");
}

function getCollectionIndex(): CollectionIndexRecord[] {
  if (!catalog) {
    throw new Error(
      "DatasetManager is not initialized. Call initialize() first.",
    );
  }

  return catalog.collectionIndex;
}

function getDeltaIndex(): PublishedDeltaIndex {
  if (!catalog) {
    throw new Error(
      "DatasetManager is not initialized. Call initialize() first.",
    );
  }

  return catalog.deltaIndex;
}

async function getCollection(
  collectionId: string,
): Promise<CurrentCollectionResult> {
  await initialize();
  return loadCollection(collectionId);
}

function subscribe(
  listener: DatasetManagerListener,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export const DatasetManager = {
  initialize,
  refresh,
  clear,
  getDiagnostics,
  getCollectionIndex,
  getDeltaIndex,
  getCollection,
  subscribe,
  isReady: () => catalog !== null && status === "ready",
  getStatus: () => status,
};

export default DatasetManager;
