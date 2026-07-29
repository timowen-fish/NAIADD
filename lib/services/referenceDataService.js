"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReferenceList = getReferenceList;
exports.makeSpeciesId = makeSpeciesId;
exports.normalizeSpecies = normalizeSpecies;
exports.loadReferenceData = loadReferenceData;
exports.loadReferenceDataResilient = loadReferenceDataResilient;
exports.replaceReferenceData = replaceReferenceData;
exports.loadBundledReferenceData = loadBundledReferenceData;
const firestore_1 = require("firebase/firestore");
const firebase_1 = require("../firebase");
const GENERAL_COLLECTION = "referenceData";
const SPECIES_COLLECTION = "species";
const FIRESTORE_BATCH_LIMIT = 450;
function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
}
function normalizeReferenceKey(value) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function normalizeStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(new Set(value.map(normalizeText).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}
function getReferenceList(generalLists, aliases) {
    const entries = Object.entries(generalLists);
    const normalizedAliases = aliases.map(normalizeReferenceKey);
    const exact = entries.find(([key]) => normalizedAliases.includes(normalizeReferenceKey(key)));
    if (exact) {
        return exact[1];
    }
    const partial = entries.find(([key]) => {
        const normalizedKey = normalizeReferenceKey(key);
        return normalizedAliases.some((alias) => normalizedKey.includes(alias) ||
            alias.includes(normalizedKey));
    });
    return partial?.[1] ?? [];
}
function normalizeGeneralLists(input) {
    const normalized = {};
    Object.entries(input).forEach(([key, value]) => {
        if (!Array.isArray(value)) {
            return;
        }
        normalized[key] = Array.from(new Set(value
            .map(normalizeText)
            .filter(Boolean))).sort((left, right) => left.localeCompare(right));
    });
    return normalized;
}
function makeSpeciesId(species) {
    const source = `${species.BOVA}-${species.CommonName}-${species.ScientificName}`
        .toLowerCase()
        .trim();
    const slug = source
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 140);
    return slug || crypto.randomUUID();
}
function normalizeSpecies(input) {
    const seen = new Set();
    return input
        .map((record) => {
        const speciesInput = {
            BOVA: normalizeText(record.BOVA),
            CommonName: normalizeText(record.CommonName),
            ScientificName: normalizeText(record.ScientificName),
        };
        const suppliedId = normalizeText(record.id);
        const id = suppliedId || makeSpeciesId(speciesInput);
        return {
            id,
            ...speciesInput,
        };
    })
        .filter((species) => {
        if (!species.CommonName || !species.ScientificName) {
            return false;
        }
        if (seen.has(species.id)) {
            return false;
        }
        seen.add(species.id);
        return true;
    })
        .sort((left, right) => left.CommonName.localeCompare(right.CommonName));
}
async function loadReferenceData() {
    const [generalSnapshot, speciesSnapshot] = await Promise.all([
        (0, firestore_1.getDocs)((0, firestore_1.collection)(firebase_1.db, GENERAL_COLLECTION)),
        (0, firestore_1.getDocs)((0, firestore_1.collection)(firebase_1.db, SPECIES_COLLECTION)),
    ]);
    const generalLists = {};
    generalSnapshot.docs.forEach((document) => {
        const data = document.data();
        const documentValues = normalizeStringArray(data.values).length > 0
            ? normalizeStringArray(data.values)
            : normalizeStringArray(data.items).length > 0
                ? normalizeStringArray(data.items)
                : normalizeStringArray(data.options);
        if (documentValues.length > 0) {
            generalLists[document.id] = documentValues;
        }
        Object.entries(data).forEach(([fieldName, fieldValue]) => {
            if (fieldName === "values" ||
                fieldName === "items" ||
                fieldName === "options" ||
                fieldName === "updatedAt") {
                return;
            }
            const fieldValues = normalizeStringArray(fieldValue);
            if (fieldValues.length > 0) {
                generalLists[fieldName] = fieldValues;
            }
        });
    });
    const species = speciesSnapshot.docs
        .map((document) => {
        const data = document.data();
        return {
            id: document.id,
            BOVA: normalizeText(data.BOVA),
            CommonName: normalizeText(data.CommonName),
            ScientificName: normalizeText(data.ScientificName),
        };
    })
        .sort((left, right) => left.CommonName.localeCompare(right.CommonName));
    return {
        generalLists,
        species,
    };
}
async function loadReferenceDataResilient() {
    try {
        const firestoreData = await loadReferenceData();
        if (Object.keys(firestoreData.generalLists).length > 0) {
            return firestoreData;
        }
        return await loadBundledReferenceData();
    }
    catch (firestoreError) {
        console.warn("Firestore reference data could not be loaded; using bundled reference data.", firestoreError);
        return await loadBundledReferenceData();
    }
}
async function commitOperations(operations) {
    for (let index = 0; index < operations.length; index += FIRESTORE_BATCH_LIMIT) {
        const batch = (0, firestore_1.writeBatch)(firebase_1.db);
        operations
            .slice(index, index + FIRESTORE_BATCH_LIMIT)
            .forEach((operation) => operation(batch));
        await batch.commit();
    }
}
async function replaceReferenceData(snapshot) {
    const normalizedGeneral = normalizeGeneralLists(snapshot.generalLists);
    const normalizedSpecies = normalizeSpecies(snapshot.species);
    const [existingGeneral, existingSpecies] = await Promise.all([
        (0, firestore_1.getDocs)((0, firestore_1.collection)(firebase_1.db, GENERAL_COLLECTION)),
        (0, firestore_1.getDocs)((0, firestore_1.collection)(firebase_1.db, SPECIES_COLLECTION)),
    ]);
    const operations = [];
    existingGeneral.docs.forEach((document) => {
        operations.push((batch) => batch.delete(document.ref));
    });
    existingSpecies.docs.forEach((document) => {
        operations.push((batch) => batch.delete(document.ref));
    });
    Object.entries(normalizedGeneral).forEach(([listName, values]) => {
        const reference = (0, firestore_1.doc)(firebase_1.db, GENERAL_COLLECTION, listName);
        operations.push((batch) => batch.set(reference, {
            values,
            updatedAt: (0, firestore_1.serverTimestamp)(),
        }));
    });
    normalizedSpecies.forEach((species) => {
        const reference = (0, firestore_1.doc)(firebase_1.db, SPECIES_COLLECTION, species.id);
        operations.push((batch) => batch.set(reference, {
            BOVA: species.BOVA,
            CommonName: species.CommonName,
            ScientificName: species.ScientificName,
            updatedAt: (0, firestore_1.serverTimestamp)(),
        }));
    });
    await commitOperations(operations);
}
async function loadBundledReferenceData() {
    const [generalResponse, speciesResponse] = await Promise.all([
        fetch("/data/data_entry_lists.json", { cache: "no-store" }),
        fetch("/data/fish_species.json", { cache: "no-store" }),
    ]);
    if (!generalResponse.ok || !speciesResponse.ok) {
        throw new Error("The bundled reference-data files could not be loaded. Confirm both JSON files are in public/data.");
    }
    const generalJson = (await generalResponse.json());
    const speciesJson = (await speciesResponse.json());
    return {
        generalLists: normalizeGeneralLists(generalJson),
        species: normalizeSpecies(speciesJson),
    };
}
//# sourceMappingURL=referenceDataService.js.map