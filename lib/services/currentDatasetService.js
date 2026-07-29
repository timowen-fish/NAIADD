"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCurrentDataset = loadCurrentDataset;
exports.loadCollection = loadCollection;
exports.findSite = findSite;
exports.searchSites = searchSites;
exports.refreshCurrentDataset = refreshCurrentDataset;
exports.clearCurrentDatasetMemoryCache = clearCurrentDatasetMemoryCache;
exports.getCurrentDatasetFromMemory = getCurrentDatasetFromMemory;
const firestore_1 = require("firebase/firestore");
const firebase_1 = require("../firebase");
const publishedDeltaService_1 = require("./publishedDeltaService");
const snapshotService_1 = require("./snapshotService");
const PUBLISHED_DELTAS_COLLECTION = "publishedDeltas";
const ROW_CHUNKS_COLLECTION = "rowChunks";
const deltaRowsCache = new Map();
let datasetMemoryCache = null;
let inFlightDatasetLoad = null;
function asRecord(value) {
    return value && typeof value === "object"
        ? value
        : {};
}
function text(value) {
    if (value === undefined || value === null)
        return "";
    return String(value).trim();
}
function firstText(row, keys) {
    for (const key of keys) {
        const value = text(row[key]);
        if (value)
            return value;
    }
    return "";
}
function firstNumber(row, keys) {
    for (const key of keys) {
        const value = row[key];
        if (value === undefined || value === null || value === "") {
            continue;
        }
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return null;
}
function collectionIdFromRow(row) {
    return firstText(row, [
        "CollectionID",
        "collectionID",
        "collectionId",
        "CollectionId",
    ]);
}
function siteIdFromRow(row) {
    return firstText(row, [
        "SiteID",
        "siteID",
        "siteId",
        "LocationID",
        "locationID",
        "locationId",
    ]);
}
function siteNameFromRow(row) {
    return firstText(row, [
        "SiteName",
        "siteName",
        "Site_Name",
        "LocationName",
        "locationName",
    ]);
}
function waterbodyFromRow(row) {
    return firstText(row, [
        "Waterbody",
        "waterbody",
        "WaterBody",
        "WaterbodyName",
        "waterbodyName",
        "StreamName",
    ]);
}
function surveyDateFromRow(row) {
    return firstText(row, [
        "Survey_Date",
        "SurveyDate",
        "surveyDate",
        "Date",
        "date",
    ]);
}
function latestDate(left, right) {
    if (!left)
        return right;
    if (!right)
        return left;
    const leftTime = new Date(left).getTime();
    const rightTime = new Date(right).getTime();
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
        return right.localeCompare(left) > 0 ? right : left;
    }
    return rightTime > leftTime ? right : left;
}
function normalizedUniqueStrings(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
function buildDatasetCacheKey(snapshotVersion, index) {
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
async function ensureSnapshotAvailable(forceSnapshotRefresh = false) {
    const status = forceSnapshotRefresh
        ? await (0, snapshotService_1.forceSyncSnapshot)()
        : await (0, snapshotService_1.syncSnapshotIfNeeded)();
    if (status.state === "offline" &&
        !(0, snapshotService_1.getCachedSnapshotMetadata)()) {
        throw new Error(status.message);
    }
    return status;
}
async function readPublishedDeltaRows(deltaId, expectedChecksum = "") {
    const cached = deltaRowsCache.get(deltaId);
    if (cached &&
        (!expectedChecksum || cached.checksum === expectedChecksum)) {
        return cached.rows;
    }
    const deltaReference = (0, firestore_1.doc)(firebase_1.db, PUBLISHED_DELTAS_COLLECTION, deltaId);
    const deltaSnapshot = await (0, firestore_1.getDoc)(deltaReference);
    if (!deltaSnapshot.exists()) {
        throw new Error(`Published delta ${deltaId} was not found.`);
    }
    const metadata = deltaSnapshot.data();
    if (metadata.status !== "Published") {
        throw new Error(`Delta ${deltaId} has status ${metadata.status}, not Published.`);
    }
    if (expectedChecksum &&
        metadata.checksum &&
        metadata.checksum !== expectedChecksum) {
        throw new Error(`Delta ${deltaId} checksum does not match the active delta index.`);
    }
    const chunksReference = (0, firestore_1.collection)(deltaReference, ROW_CHUNKS_COLLECTION);
    const chunksSnapshot = await (0, firestore_1.getDocs)((0, firestore_1.query)(chunksReference, (0, firestore_1.orderBy)("chunkIndex", "asc")));
    const rows = [];
    chunksSnapshot.docs.forEach((chunkDocument) => {
        const chunk = asRecord(chunkDocument.data());
        const chunkRows = Array.isArray(chunk.rows) ? chunk.rows : [];
        chunkRows.forEach((row) => {
            rows.push(asRecord(row));
        });
    });
    if (Number.isFinite(metadata.rowChunkCount) &&
        metadata.rowChunkCount !== chunksSnapshot.size) {
        throw new Error(`Delta ${deltaId} expected ${metadata.rowChunkCount} row chunks but ${chunksSnapshot.size} were found.`);
    }
    if (Number.isFinite(metadata.rowCount) &&
        metadata.rowCount !== rows.length) {
        throw new Error(`Delta ${deltaId} expected ${metadata.rowCount} rows but ${rows.length} were loaded.`);
    }
    deltaRowsCache.set(deltaId, {
        checksum: metadata.checksum || expectedChecksum,
        rows,
    });
    return rows;
}
async function loadActiveDeltaRows(index) {
    const activeIds = normalizedUniqueStrings(index.activeDeltaIds);
    const activeEntries = new Map(index.activeDeltas.map((entry) => [entry.deltaId, entry]));
    const activeIdSet = new Set(activeIds);
    for (const cachedId of deltaRowsCache.keys()) {
        if (!activeIdSet.has(cachedId)) {
            deltaRowsCache.delete(cachedId);
        }
    }
    const rowsByDelta = await Promise.all(activeIds.map((deltaId) => readPublishedDeltaRows(deltaId, activeEntries.get(deltaId)?.checksum ?? "")));
    return rowsByDelta.flat();
}
async function buildCurrentDataset(forceReload = false) {
    await ensureSnapshotAvailable(false);
    const snapshotMetadata = (0, snapshotService_1.getCachedSnapshotMetadata)();
    if (!snapshotMetadata) {
        throw new Error("The VADMA snapshot was not available after synchronization.");
    }
    const deltaIndex = await (0, publishedDeltaService_1.getPublishedDeltaIndex)();
    const cacheKey = buildDatasetCacheKey(snapshotMetadata.version, deltaIndex);
    if (!forceReload &&
        datasetMemoryCache?.cacheKey === cacheKey) {
        return datasetMemoryCache.result;
    }
    const [snapshotRows, deltaRows] = await Promise.all([
        (0, snapshotService_1.readSnapshotRows)(),
        loadActiveDeltaRows(deltaIndex),
    ]);
    const result = {
        rows: [...snapshotRows, ...deltaRows],
        source: {
            snapshotVersion: snapshotMetadata.version,
            snapshotRowCount: snapshotRows.length,
            deltaIndexUpdatedAt: deltaIndex.updatedAt,
            activeDeltaCount: normalizedUniqueStrings(deltaIndex.activeDeltaIds).length,
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
 * Loads the complete active VADMA dataset:
 * historic snapshot rows followed by all rows from active published deltas.
 */
async function loadCurrentDataset(forceReload = false) {
    if (forceReload) {
        clearCurrentDatasetMemoryCache();
    }
    if (inFlightDatasetLoad) {
        return inFlightDatasetLoad;
    }
    inFlightDatasetLoad = buildCurrentDataset(forceReload);
    try {
        return await inFlightDatasetLoad;
    }
    finally {
        inFlightDatasetLoad = null;
    }
}
/**
 * Loads a single collection without reading the entire historic snapshot.
 * Delta rows are filtered from the active published deltas.
 */
async function loadCollection(collectionId) {
    const normalizedCollectionId = collectionId.trim();
    if (!normalizedCollectionId) {
        throw new Error("CollectionID was empty.");
    }
    await ensureSnapshotAvailable(false);
    let snapshotRows = [];
    try {
        snapshotRows = await (0, snapshotService_1.readSnapshotCollectionRows)(normalizedCollectionId);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("was not found in the collection index")) {
            throw error;
        }
    }
    const deltaIndex = await (0, publishedDeltaService_1.getPublishedDeltaIndex)();
    const deltaRows = (await loadActiveDeltaRows(deltaIndex)).filter((row) => collectionIdFromRow(row) === normalizedCollectionId);
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
async function findSite(siteId) {
    const normalizedSiteId = siteId.trim();
    if (!normalizedSiteId) {
        return [];
    }
    const dataset = await loadCurrentDataset();
    return dataset.rows.filter((row) => siteIdFromRow(row) === normalizedSiteId);
}
/**
 * Searches unique sites by SiteID, site name, waterbody, coordinates,
 * collection ID, and survey date.
 */
async function searchSites(searchText, limit = 50) {
    const normalizedSearch = searchText.trim().toLowerCase();
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const dataset = await loadCurrentDataset();
    const sites = new Map();
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
        const fallbackKey = siteId ||
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
            collectionIds: new Set(),
            rowCount: 0,
            latestSurveyDate: "",
            searchable: new Set(),
        };
        if (!existing.siteId && siteId)
            existing.siteId = siteId;
        if (!existing.siteName && siteName)
            existing.siteName = siteName;
        if (!existing.waterbody && waterbody)
            existing.waterbody = waterbody;
        if (existing.latitude === null && latitude !== null) {
            existing.latitude = latitude;
        }
        if (existing.longitude === null && longitude !== null) {
            existing.longitude = longitude;
        }
        if (collectionId)
            existing.collectionIds.add(collectionId);
        existing.rowCount += 1;
        existing.latestSurveyDate = latestDate(existing.latestSurveyDate, surveyDate);
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
            if (normalized)
                existing.searchable.add(normalized);
        });
        sites.set(fallbackKey, existing);
    });
    return [...sites.values()]
        .filter((site) => !normalizedSearch ||
        [...site.searchable].some((value) => value.includes(normalizedSearch)))
        .sort((left, right) => {
        const waterbodyCompare = left.waterbody.localeCompare(right.waterbody);
        if (waterbodyCompare !== 0)
            return waterbodyCompare;
        const siteNameCompare = left.siteName.localeCompare(right.siteName);
        if (siteNameCompare !== 0)
            return siteNameCompare;
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
async function refreshCurrentDataset() {
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
function clearCurrentDatasetMemoryCache() {
    datasetMemoryCache = null;
    inFlightDatasetLoad = null;
    deltaRowsCache.clear();
}
/**
 * Returns the currently loaded result without triggering disk or network I/O.
 */
function getCurrentDatasetFromMemory() {
    return datasetMemoryCache?.result ?? null;
}
//# sourceMappingURL=currentDatasetService.js.map