"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDatasetIndexes = buildDatasetIndexes;
exports.getCollectionRows = getCollectionRows;
exports.getSiteRows = getSiteRows;
exports.getWaterbodyRows = getWaterbodyRows;
exports.getSpeciesRows = getSpeciesRows;
const COLLECTION_ID_FIELDS = [
    "CollectionID",
    "collectionID",
    "collectionId",
    "CollectionId",
];
const SITE_ID_FIELDS = [
    "SiteID",
    "siteID",
    "siteId",
    "LocationID",
    "locationID",
    "locationId",
];
const WATERBODY_FIELDS = [
    "Waterbody",
    "waterbody",
    "WaterBody",
    "WaterbodyName",
    "waterbodyName",
    "StreamName",
];
const SPECIES_FIELDS = [
    "CommonName",
    "commonName",
    "ScientificName",
    "scientificName",
    "Species",
    "species",
];
function normalizeText(value) {
    if (value === null || value === undefined)
        return "";
    return String(value).trim();
}
function firstText(row, fields) {
    for (const field of fields) {
        const value = normalizeText(row[field]);
        if (value)
            return value;
    }
    return "";
}
function appendToIndex(index, key, row) {
    if (!key)
        return;
    const existing = index.get(key);
    if (existing) {
        existing.push(row);
        return;
    }
    index.set(key, [row]);
}
function sortedKeys(index) {
    return [...index.keys()].sort((left, right) => left.localeCompare(right, undefined, {
        sensitivity: "base",
        numeric: true,
    }));
}
function buildDatasetIndexes(rows) {
    const byCollectionId = new Map();
    const bySiteId = new Map();
    const byWaterbody = new Map();
    const bySpecies = new Map();
    for (const row of rows) {
        appendToIndex(byCollectionId, firstText(row, COLLECTION_ID_FIELDS), row);
        appendToIndex(bySiteId, firstText(row, SITE_ID_FIELDS), row);
        appendToIndex(byWaterbody, firstText(row, WATERBODY_FIELDS), row);
        appendToIndex(bySpecies, firstText(row, SPECIES_FIELDS), row);
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
function getCollectionRows(indexes, collectionId) {
    return indexes.byCollectionId.get(collectionId.trim()) ?? [];
}
function getSiteRows(indexes, siteId) {
    return indexes.bySiteId.get(siteId.trim()) ?? [];
}
function getWaterbodyRows(indexes, waterbody) {
    return indexes.byWaterbody.get(waterbody.trim()) ?? [];
}
function getSpeciesRows(indexes, speciesName) {
    return indexes.bySpecies.get(speciesName.trim()) ?? [];
}
//# sourceMappingURL=datasetIndexes.js.map