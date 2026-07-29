"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatasetManager = void 0;
const snapshotService_1 = require("./snapshotService");
const publishedDeltaService_1 = require("./publishedDeltaService");
const currentDatasetService_1 = require("./currentDatasetService");
const listeners = new Set();
let status = "idle";
let catalog = null;
let inFlightLoad = null;
let lastError = "";
let loadedAt = "";
let indexBuiltAt = "";
let loadDurationMs = 0;
function normalizeError(error) {
    return error instanceof Error
        ? error
        : new Error(String(error));
}
function uniqueCount(records, field) {
    const values = new Set();
    for (const record of records) {
        const value = record[field];
        if (typeof value === "string" && value.trim()) {
            values.add(value.trim());
        }
    }
    return values.size;
}
function snapshotRowCount(records) {
    return records.reduce((total, record) => {
        const value = Number(record.rowCount);
        return total + (Number.isFinite(value) ? value : 0);
    }, 0);
}
function deltaRowCount(index) {
    return index.activeDeltas.reduce((total, delta) => {
        const value = Number(delta.rowCount);
        return total + (Number.isFinite(value) ? value : 0);
    }, 0);
}
function getDiagnostics() {
    const snapshotMeta = (0, snapshotService_1.getCachedSnapshotMetadata)();
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
        activeDeltaCount: deltaIndex?.activeDeltaIds.length ?? 0,
        deltaRowCount: publishedRows,
        totalRowCount: historicRows + publishedRows,
        collectionCount: uniqueCount(collectionIndex, "CollectionID"),
        siteCount: uniqueCount(collectionIndex, "SiteID"),
        waterbodyCount: uniqueCount(collectionIndex, "Waterbody"),
        speciesCount: null,
        loadedAt,
        indexBuiltAt,
        loadDurationMs,
        lastError,
    };
}
function emit(type, error) {
    const event = {
        type,
        diagnostics: getDiagnostics(),
        error,
    };
    listeners.forEach((listener) => {
        try {
            listener(event);
        }
        catch (listenerError) {
            console.error("A DatasetManager listener failed.", listenerError);
        }
    });
}
async function loadCatalog(forceRefresh) {
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
                await (0, snapshotService_1.forceSyncSnapshot)();
            }
            else {
                await (0, snapshotService_1.syncSnapshotIfNeeded)();
            }
            const [collectionIndex, deltaIndex] = await Promise.all([
                (0, snapshotService_1.ensureCollectionIndex)(),
                (0, publishedDeltaService_1.getPublishedDeltaIndex)(),
            ]);
            catalog = {
                collectionIndex,
                deltaIndex,
            };
            loadedAt = new Date().toISOString();
            indexBuiltAt = loadedAt;
            loadDurationMs = Math.max(0, performance.now() - startedAt);
            lastError = "";
            status = "ready";
            emit(forceRefresh ? "refreshed" : "loaded");
        }
        catch (error) {
            const normalized = normalizeError(error);
            lastError = normalized.message;
            status = "error";
            emit("error", normalized);
            throw normalized;
        }
        finally {
            inFlightLoad = null;
        }
    })();
    return inFlightLoad;
}
function initialize() {
    return loadCatalog(false);
}
function refresh() {
    catalog = null;
    return loadCatalog(true);
}
function clear() {
    catalog = null;
    inFlightLoad = null;
    lastError = "";
    loadedAt = "";
    indexBuiltAt = "";
    loadDurationMs = 0;
    status = "idle";
    emit("cleared");
}
function getCollectionIndex() {
    if (!catalog) {
        throw new Error("DatasetManager is not initialized. Call initialize() first.");
    }
    return catalog.collectionIndex;
}
function getDeltaIndex() {
    if (!catalog) {
        throw new Error("DatasetManager is not initialized. Call initialize() first.");
    }
    return catalog.deltaIndex;
}
async function getCollection(collectionId) {
    await initialize();
    return (0, currentDatasetService_1.loadCollection)(collectionId);
}
function subscribe(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
exports.DatasetManager = {
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
exports.default = exports.DatasetManager;
//# sourceMappingURL=datasetManager.js.map