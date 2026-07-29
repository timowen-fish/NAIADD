"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearVadmaSnapshotCache = exports.readCachedVadmaSnapshotColumnNames = exports.readCachedVadmaSnapshotCollectionRows = exports.readCachedVadmaSnapshotRows = exports.forceSyncVadmaSnapshot = exports.syncVadmaSnapshotIfNeeded = exports.ensureVadmaCollectionIndex = exports.getCachedVadmaCollectionIndex = exports.getCachedVadmaSnapshot = exports.getCachedVadmaSnapshotMeta = exports.downloadVadmaCollectionIndex = exports.downloadVadmaSnapshotBlob = exports.fetchVadmaSnapshotConfig = void 0;
exports.fetchSnapshotConfiguration = fetchSnapshotConfiguration;
exports.downloadSnapshotBlob = downloadSnapshotBlob;
exports.downloadCollectionIndex = downloadCollectionIndex;
exports.getCachedSnapshotMetadata = getCachedSnapshotMetadata;
exports.getCachedSnapshot = getCachedSnapshot;
exports.getCachedCollectionIndex = getCachedCollectionIndex;
exports.cacheSnapshot = cacheSnapshot;
exports.ensureCollectionIndex = ensureCollectionIndex;
exports.syncSnapshotIfNeeded = syncSnapshotIfNeeded;
exports.forceSyncSnapshot = forceSyncSnapshot;
exports.readSnapshotRows = readSnapshotRows;
exports.readSnapshotCollectionRows = readSnapshotCollectionRows;
exports.readSnapshotColumnNames = readSnapshotColumnNames;
exports.clearSnapshotCache = clearSnapshotCache;
const firestore_1 = require("firebase/firestore");
const firebase_1 = require("../firebase");
const SNAPSHOT_DB_NAME = "naiadd_snapshot_cache_v1";
const SNAPSHOT_DB_VERSION = 1;
const SNAPSHOT_STORE_NAME = "snapshotCache";
const SNAPSHOT_RECORD_ID = "currentSnapshot";
const COLLECTION_INDEX_RECORD_ID = "currentCollectionIndex";
const SNAPSHOT_META_KEY = "naiadd_snapshot_meta_v1";
function formatMegabytes(bytes) {
    return Math.round((bytes / 1024 / 1024) * 100) / 100;
}
function openSnapshotDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(SNAPSHOT_DB_NAME, SNAPSHOT_DB_VERSION);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
                database.createObjectStore(SNAPSHOT_STORE_NAME, { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            reject(request.error ??
                new Error("Unable to open the local NAIADD snapshot database."));
        };
    });
}
async function readCacheRecord(id) {
    const database = await openSnapshotDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(SNAPSHOT_STORE_NAME, "readonly");
        const store = transaction.objectStore(SNAPSHOT_STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => {
            resolve(request.result ?? null);
        };
        request.onerror = () => {
            reject(request.error ??
                new Error("Unable to read the local NAIADD snapshot cache."));
        };
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => database.close();
        transaction.onabort = () => database.close();
    });
}
async function writeCacheRecord(record) {
    const database = await openSnapshotDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(SNAPSHOT_STORE_NAME, "readwrite");
        const store = transaction.objectStore(SNAPSHOT_STORE_NAME);
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => {
            reject(request.error ??
                new Error("Unable to write the local NAIADD snapshot cache."));
        };
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => database.close();
        transaction.onabort = () => database.close();
    });
}
async function deleteCacheRecord(id) {
    const database = await openSnapshotDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(SNAPSHOT_STORE_NAME, "readwrite");
        const store = transaction.objectStore(SNAPSHOT_STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => {
            reject(request.error ??
                new Error("Unable to delete the local NAIADD snapshot cache."));
        };
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => database.close();
        transaction.onabort = () => database.close();
    });
}
function validateConfiguration(value) {
    if (!value || typeof value !== "object") {
        throw new Error("Snapshot configuration was empty.");
    }
    const configuration = value;
    if (configuration.active !== true) {
        throw new Error("The production NAIADD snapshot is not active.");
    }
    if (typeof configuration.version !== "string" ||
        configuration.version.trim() === "") {
        throw new Error("Snapshot configuration is missing a version.");
    }
    if (typeof configuration.snapshotUrl !== "string" ||
        configuration.snapshotUrl.trim() === "") {
        throw new Error("Snapshot configuration is missing a snapshot URL.");
    }
    if (typeof configuration.snapshotKey !== "string" ||
        !/^[0-9a-fA-F]{128}$/.test(configuration.snapshotKey.trim())) {
        throw new Error("Snapshot configuration requires a 128-character hexadecimal CBC/HMAC key.");
    }
    return {
        active: true,
        version: configuration.version.trim(),
        snapshotUrl: configuration.snapshotUrl.trim(),
        snapshotIndexUrl: typeof configuration.snapshotIndexUrl === "string" &&
            configuration.snapshotIndexUrl.trim() !== ""
            ? configuration.snapshotIndexUrl.trim()
            : undefined,
        snapshotKey: configuration.snapshotKey.trim(),
    };
}
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < hex.length; index += 2) {
        bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
    }
    return bytes;
}
function base64ToBytes(value) {
    const cleaned = value.trim().replace(/^data:.*?;base64,/, "");
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}
function bytesToArrayBuffer(bytes) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}
function concatenateBytes(parts) {
    const totalLength = parts.reduce((total, part) => total + part.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}
function constantTimeEqual(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
        difference |= left[index] ^ right[index];
    }
    return difference === 0;
}
function parseEncryptedPayload(text) {
    const trimmed = text.trim();
    let jsonText = trimmed;
    if (!trimmed.startsWith("{")) {
        jsonText = new TextDecoder().decode(base64ToBytes(trimmed)).trim();
    }
    const payload = JSON.parse(jsonText);
    if (payload.format !== "VADMA_AES_256_CBC_HMAC_SHA256_V1") {
        throw new Error("Unsupported VADMA snapshot encryption format.");
    }
    if (typeof payload.iv !== "string" ||
        typeof payload.ciphertext !== "string" ||
        typeof payload.hmac !== "string") {
        throw new Error("Encrypted VADMA payload is incomplete.");
    }
    return payload;
}
async function decryptPayload(payload, keyHex) {
    const keyBytes = hexToBytes(keyHex);
    if (keyBytes.length !== 64) {
        throw new Error("Snapshot decryption key must contain exactly 64 bytes.");
    }
    const aesKeyBytes = keyBytes.slice(0, 32);
    const hmacKeyBytes = keyBytes.slice(32, 64);
    const iv = base64ToBytes(payload.iv);
    const ciphertext = base64ToBytes(payload.ciphertext);
    const expectedHmac = base64ToBytes(payload.hmac);
    const hmacKey = await crypto.subtle.importKey("raw", bytesToArrayBuffer(hmacKeyBytes), {
        name: "HMAC",
        hash: "SHA-256",
    }, false, ["sign"]);
    const macInput = concatenateBytes([
        new TextEncoder().encode("VADMA_AES_256_CBC_HMAC_SHA256_V1"),
        iv,
        ciphertext,
    ]);
    const calculatedHmac = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, bytesToArrayBuffer(macInput)));
    if (!constantTimeEqual(calculatedHmac, expectedHmac)) {
        throw new Error("Snapshot integrity validation failed.");
    }
    const aesKey = await crypto.subtle.importKey("raw", bytesToArrayBuffer(aesKeyBytes), { name: "AES-CBC" }, false, ["decrypt"]);
    return crypto.subtle.decrypt({
        name: "AES-CBC",
        iv: bytesToArrayBuffer(iv),
    }, aesKey, bytesToArrayBuffer(ciphertext));
}
async function fetchEncryptedPayload(url) {
    const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
    });
    if (!response.ok) {
        throw new Error(`Snapshot request failed: ${response.status} ${response.statusText}`);
    }
    return parseEncryptedPayload(await response.text());
}
function normalizeIndexRecords(value) {
    if (!Array.isArray(value)) {
        throw new Error("Decrypted collection index was not an array.");
    }
    return value
        .filter((item) => {
        if (!item || typeof item !== "object") {
            return false;
        }
        return (typeof item.CollectionID === "string" &&
            Number.isFinite(Number(item.rowStart)) &&
            Number.isFinite(Number(item.rowEnd)));
    })
        .map((item) => {
        const rowStart = Number(item.rowStart);
        const rowEnd = Number(item.rowEnd);
        return {
            ...item,
            CollectionID: String(item.CollectionID),
            rowStart,
            rowEnd,
            rowCount: Number(item.rowCount ?? rowEnd - rowStart + 1),
        };
    });
}
function coerceParquetValue(value) {
    return typeof value === "bigint" ? Number(value) : value;
}
function coerceParquetRow(row) {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [
        key,
        coerceParquetValue(value),
    ]));
}
async function getAvailableParquetColumns(file) {
    try {
        const hyparquet = await Promise.resolve().then(() => __importStar(require("hyparquet")));
        const metadata = await hyparquet.parquetMetadataAsync(file);
        const schema = hyparquet.parquetSchema(metadata);
        return Array.isArray(schema.children)
            ? schema.children
                .map((child) => child.element?.name)
                .filter((name) => typeof name === "string")
            : [];
    }
    catch (error) {
        console.warn("Unable to read Parquet column metadata.", error);
        return null;
    }
}
async function fetchSnapshotConfiguration() {
    const reference = (0, firestore_1.doc)(firebase_1.db, "snapshotKeys", "current");
    const snapshot = await (0, firestore_1.getDoc)(reference);
    if (!snapshot.exists()) {
        throw new Error("Firestore snapshotKeys/current was not found.");
    }
    return validateConfiguration(snapshot.data());
}
async function downloadSnapshotBlob(snapshotUrl, snapshotKey) {
    const payload = await fetchEncryptedPayload(snapshotUrl);
    const decrypted = await decryptPayload(payload, snapshotKey);
    if (decrypted.byteLength < 8) {
        throw new Error("Decrypted snapshot was empty or invalid.");
    }
    return new Blob([decrypted], {
        type: "application/octet-stream",
    });
}
async function downloadCollectionIndex(snapshotIndexUrl, snapshotKey) {
    const payload = await fetchEncryptedPayload(snapshotIndexUrl);
    const decrypted = await decryptPayload(payload, snapshotKey);
    const json = new TextDecoder("utf-8").decode(decrypted);
    return normalizeIndexRecords(JSON.parse(json));
}
function getCachedSnapshotMetadata() {
    const stored = localStorage.getItem(SNAPSHOT_META_KEY);
    if (!stored) {
        return null;
    }
    try {
        return JSON.parse(stored);
    }
    catch {
        localStorage.removeItem(SNAPSHOT_META_KEY);
        return null;
    }
}
async function getCachedSnapshot() {
    const record = await readCacheRecord(SNAPSHOT_RECORD_ID);
    if (!record?.blob || !record.meta) {
        return null;
    }
    return {
        meta: record.meta,
        blob: record.blob,
    };
}
async function getCachedCollectionIndex() {
    const record = await readCacheRecord(COLLECTION_INDEX_RECORD_ID);
    return record?.records ?? null;
}
async function cacheSnapshot(configuration, blob) {
    const meta = {
        version: configuration.version,
        cachedAt: new Date().toISOString(),
        sizeBytes: blob.size,
        snapshotUrl: configuration.snapshotUrl,
        encrypted: true,
    };
    await writeCacheRecord({
        id: SNAPSHOT_RECORD_ID,
        meta,
        blob,
    });
    localStorage.setItem(SNAPSHOT_META_KEY, JSON.stringify(meta));
    return meta;
}
async function cacheCollectionIndex(version, records) {
    await writeCacheRecord({
        id: COLLECTION_INDEX_RECORD_ID,
        version,
        cachedAt: new Date().toISOString(),
        records,
    });
}
async function ensureCollectionIndex() {
    const configuration = await fetchSnapshotConfiguration();
    const cached = await readCacheRecord(COLLECTION_INDEX_RECORD_ID);
    if (cached?.version === configuration.version &&
        Array.isArray(cached.records)) {
        return cached.records;
    }
    if (!configuration.snapshotIndexUrl) {
        throw new Error("snapshotIndexUrl is missing from Firestore snapshotKeys/current.");
    }
    const records = await downloadCollectionIndex(configuration.snapshotIndexUrl, configuration.snapshotKey);
    await cacheCollectionIndex(configuration.version, records);
    return records;
}
async function syncSnapshotIfNeeded() {
    const cachedMeta = getCachedSnapshotMetadata();
    if (!navigator.onLine) {
        return cachedMeta
            ? {
                state: "cached",
                message: `Cached snapshot ${cachedMeta.version} is available offline.`,
                version: cachedMeta.version,
                sizeMB: formatMegabytes(cachedMeta.sizeBytes),
            }
            : {
                state: "offline",
                message: "No production snapshot is cached. Connect once to download it.",
            };
    }
    const configuration = await fetchSnapshotConfiguration();
    if (cachedMeta?.version === configuration.version &&
        cachedMeta.sizeBytes > 0) {
        return {
            state: "cached",
            message: `Snapshot ${cachedMeta.version} is already cached.`,
            version: cachedMeta.version,
            sizeMB: formatMegabytes(cachedMeta.sizeBytes),
        };
    }
    return forceSyncSnapshot(configuration);
}
async function forceSyncSnapshot(suppliedConfiguration) {
    if (!navigator.onLine) {
        return {
            state: "offline",
            message: "Network unavailable. Connect to download the snapshot.",
        };
    }
    const configuration = suppliedConfiguration ?? (await fetchSnapshotConfiguration());
    const blob = await downloadSnapshotBlob(configuration.snapshotUrl, configuration.snapshotKey);
    const meta = await cacheSnapshot(configuration, blob);
    if (configuration.snapshotIndexUrl) {
        const records = await downloadCollectionIndex(configuration.snapshotIndexUrl, configuration.snapshotKey);
        await cacheCollectionIndex(configuration.version, records);
    }
    return {
        state: "updated",
        message: `Downloaded and decrypted snapshot ${meta.version} (${formatMegabytes(meta.sizeBytes)} MB).`,
        version: meta.version,
        sizeMB: formatMegabytes(meta.sizeBytes),
    };
}
async function readSnapshotRows(options = {}) {
    const cached = await getCachedSnapshot();
    if (!cached?.blob) {
        throw new Error("No cached NAIADD snapshot is available.");
    }
    const file = await cached.blob.arrayBuffer();
    const hyparquet = await Promise.resolve().then(() => __importStar(require("hyparquet")));
    const compressorModule = await Promise.resolve().then(() => __importStar(require("hyparquet-compressors")));
    const availableColumns = await getAvailableParquetColumns(file);
    const requestedColumns = options.columns && options.columns.length > 0
        ? [...new Set(options.columns)]
        : undefined;
    const columns = requestedColumns && availableColumns
        ? requestedColumns.filter((column) => availableColumns.includes(column))
        : requestedColumns;
    const rows = (await hyparquet.parquetReadObjects({
        file,
        columns,
        rowStart: options.rowStart,
        rowEnd: options.rowEnd,
        compressors: compressorModule.compressors,
    }));
    return rows.map(coerceParquetRow);
}
async function readSnapshotCollectionRows(collectionID) {
    const normalizedCollectionID = collectionID.trim();
    if (!normalizedCollectionID) {
        throw new Error("CollectionID was empty.");
    }
    const index = await ensureCollectionIndex();
    const match = index.find((record) => record.CollectionID === normalizedCollectionID);
    if (!match) {
        throw new Error(`CollectionID ${normalizedCollectionID} was not found in the collection index.`);
    }
    /*
      The R-generated index uses 1-based inclusive row numbers.
      hyparquet expects a zero-based rowStart and exclusive rowEnd.
    */
    return readSnapshotRows({
        rowStart: Math.max(0, match.rowStart - 1),
        rowEnd: match.rowEnd,
    });
}
async function readSnapshotColumnNames() {
    const cached = await getCachedSnapshot();
    if (!cached?.blob) {
        throw new Error("No cached NAIADD snapshot is available.");
    }
    const columns = await getAvailableParquetColumns(await cached.blob.arrayBuffer());
    return columns ?? [];
}
async function clearSnapshotCache() {
    await Promise.all([
        deleteCacheRecord(SNAPSHOT_RECORD_ID),
        deleteCacheRecord(COLLECTION_INDEX_RECORD_ID),
    ]);
    localStorage.removeItem(SNAPSHOT_META_KEY);
}
/*
  Compatibility aliases matching the older VADMA application. These let
  existing components migrate without having to rename every import at once.
*/
exports.fetchVadmaSnapshotConfig = fetchSnapshotConfiguration;
exports.downloadVadmaSnapshotBlob = downloadSnapshotBlob;
exports.downloadVadmaCollectionIndex = downloadCollectionIndex;
exports.getCachedVadmaSnapshotMeta = getCachedSnapshotMetadata;
exports.getCachedVadmaSnapshot = getCachedSnapshot;
exports.getCachedVadmaCollectionIndex = getCachedCollectionIndex;
exports.ensureVadmaCollectionIndex = ensureCollectionIndex;
exports.syncVadmaSnapshotIfNeeded = syncSnapshotIfNeeded;
exports.forceSyncVadmaSnapshot = forceSyncSnapshot;
exports.readCachedVadmaSnapshotRows = readSnapshotRows;
exports.readCachedVadmaSnapshotCollectionRows = readSnapshotCollectionRows;
exports.readCachedVadmaSnapshotColumnNames = readSnapshotColumnNames;
exports.clearVadmaSnapshotCache = clearSnapshotCache;
//# sourceMappingURL=snapshotService.js.map