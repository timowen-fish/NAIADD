"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGabelhouseThreshold = getGabelhouseThreshold;
exports.classifyGabelhouseLength = classifyGabelhouseLength;
exports.analyzeSizeStructure = analyzeSizeStructure;
const gabelhouseThresholds_1 = require("../data/gabelhouseThresholds");
const datasetManager_1 = require("./datasetManager");
const thresholdBySpecies = new Map(gabelhouseThresholds_1.GABELHOUSE_THRESHOLDS.map((threshold) => [
    normalizeSpeciesName(threshold.species),
    threshold,
]));
const SPECIES_ALIASES = {
    largemouthbass: "largemouthbass",
    smallmouthbass: "smallmouthbass",
    spottedbass: "spottedbass",
    rockbass: "rockbass",
    bluegill: "bluegill",
    redearsunfish: "redearsunfish",
    redbreastsunfish: "redbreastsunfish",
    pumpkinseedsunfish: "pumpkinseed",
    pumpkinseed: "pumpkinseed",
    blackcrappie: "blackcrappie",
    whitecrappie: "whitecrappie",
    brooktrout: "brooktrout",
    browntrout: "browntrout",
    rainbowtrout: "rainbowtrout",
};
function normalizeSpeciesName(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "");
}
function textValue(row, keys) {
    for (const key of keys) {
        const value = row[key];
        if (value !== null && value !== undefined) {
            const text = String(value).trim();
            if (text) {
                return text;
            }
        }
    }
    return "";
}
function numericValue(row, keys) {
    for (const key of keys) {
        const raw = row[key];
        if (raw === null || raw === undefined || raw === "") {
            continue;
        }
        const value = typeof raw === "number"
            ? raw
            : Number(String(raw).replace(/,/g, "").trim());
        if (Number.isFinite(value)) {
            return value;
        }
    }
    return null;
}
function normalizeLengthToMm(length, unit) {
    if (!Number.isFinite(length) || length <= 0) {
        return null;
    }
    const normalizedUnit = unit.trim().toLowerCase();
    if (normalizedUnit.includes("centimeter") ||
        normalizedUnit === "cm") {
        return length * 10;
    }
    if (normalizedUnit.includes("inch") ||
        normalizedUnit === "in") {
        return length * 25.4;
    }
    // VADMA specimen lengths are normally stored in millimeters.
    return length;
}
function getGabelhouseThreshold(commonName) {
    const normalized = normalizeSpeciesName(commonName);
    const alias = SPECIES_ALIASES[normalized] ?? normalized;
    return thresholdBySpecies.get(alias) ?? null;
}
function classifyGabelhouseLength(threshold, lengthMm) {
    if (threshold.trophyMm !== null &&
        lengthMm >= threshold.trophyMm) {
        return "Trophy";
    }
    if (threshold.memorableMm !== null &&
        lengthMm >= threshold.memorableMm) {
        return "Memorable";
    }
    if (threshold.preferredMm !== null &&
        lengthMm >= threshold.preferredMm) {
        return "Preferred";
    }
    if (lengthMm >= threshold.qualityMm) {
        return "Quality";
    }
    if (lengthMm >= threshold.stockMm) {
        return "Stock";
    }
    return "Substock";
}
function buildHistogram(lengths) {
    if (lengths.length === 0) {
        return [];
    }
    const maximum = Math.max(...lengths.map((item) => item.lengthMm));
    const binWidth = maximum <= 300 ? 10 : maximum <= 700 ? 25 : 50;
    const upperBound = Math.ceil(maximum / binWidth) * binWidth;
    const histogram = [];
    for (let minimumMm = 0; minimumMm < upperBound; minimumMm += binWidth) {
        const maximumMm = minimumMm + binWidth;
        const count = lengths.reduce((total, item) => item.lengthMm >= minimumMm && item.lengthMm < maximumMm
            ? total + item.quantity
            : total, 0);
        histogram.push({
            minimumMm,
            maximumMm,
            count,
        });
    }
    return histogram;
}
function percentage(numerator, denominator) {
    if (denominator <= 0) {
        return null;
    }
    return (numerator / denominator) * 100;
}
function throwIfAborted(signal) {
    if (signal?.aborted) {
        throw new DOMException("Analysis cancelled.", "AbortError");
    }
}
async function analyzeSizeStructure({ collectionIDs, signal, onProgress, }) {
    await datasetManager_1.DatasetManager.initialize();
    const ids = [
        ...new Set(collectionIDs
            .map((collectionID) => collectionID.trim())
            .filter(Boolean)),
    ];
    const fish = [];
    const unmatchedSpecies = new Set();
    for (let index = 0; index < ids.length; index += 1) {
        throwIfAborted(signal);
        const collectionID = ids[index];
        const collection = await datasetManager_1.DatasetManager.getCollection(collectionID);
        for (const row of collection.rows) {
            throwIfAborted(signal);
            const commonName = textValue(row, [
                "CommonName",
                "Common_Name",
                "Species",
            ]);
            if (!commonName) {
                continue;
            }
            const threshold = getGabelhouseThreshold(commonName);
            if (!threshold) {
                unmatchedSpecies.add(commonName);
                continue;
            }
            const length = numericValue(row, [
                "Length",
                "TotalLength",
                "ForkLength",
            ]);
            if (length === null) {
                continue;
            }
            const lengthUnit = textValue(row, [
                "LengthUnit",
                "Length_Unit",
            ]);
            const lengthMm = normalizeLengthToMm(length, lengthUnit);
            if (lengthMm === null) {
                continue;
            }
            const rawQuantity = numericValue(row, ["Quantity"]);
            const quantity = rawQuantity !== null && rawQuantity > 0
                ? Math.max(1, Math.round(rawQuantity))
                : 1;
            const weight = numericValue(row, [
                "Weight",
                "TotalWeight",
            ]);
            fish.push({
                collectionID,
                commonName: threshold.species,
                lengthMm,
                lengthDisplay: `${lengthMm.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                })} mm`,
                quantity,
                designation: classifyGabelhouseLength(threshold, lengthMm),
                weight,
                weightUnit: textValue(row, [
                    "WeightUnit",
                    "Weight_Unit",
                ]),
                waterbody: textValue(row, ["Waterbody"]),
                siteName: textValue(row, ["SiteName"]),
                surveyDate: textValue(row, [
                    "Survey_Date_std",
                    "Survey_Date",
                ]),
                surveyor: textValue(row, [
                    "Surveyors",
                    "Surveyor",
                    "LeadBiologist",
                    "Lead_Biologist",
                ]),
            });
        }
        const completedCollections = index + 1;
        onProgress?.({
            completedCollections,
            totalCollections: ids.length,
            percentComplete: ids.length > 0
                ? Math.round((completedCollections / ids.length) * 100)
                : 100,
            currentCollectionID: collectionID,
        });
        await Promise.resolve();
    }
    const bySpecies = new Map();
    for (const item of fish) {
        const threshold = getGabelhouseThreshold(item.commonName);
        if (!threshold) {
            continue;
        }
        const existing = bySpecies.get(threshold.species);
        if (existing) {
            existing.fish.push(item);
        }
        else {
            bySpecies.set(threshold.species, {
                threshold,
                fish: [item],
            });
        }
    }
    const species = [...bySpecies.entries()]
        .map(([speciesName, entry]) => {
        const exclusive = {
            Substock: 0,
            Stock: 0,
            Quality: 0,
            Preferred: 0,
            Memorable: 0,
            Trophy: 0,
        };
        let measuredFish = 0;
        let totalLength = 0;
        let largestLengthMm = 0;
        const lengths = [];
        for (const item of entry.fish) {
            exclusive[item.designation] += item.quantity;
            measuredFish += item.quantity;
            totalLength += item.lengthMm * item.quantity;
            largestLengthMm = Math.max(largestLengthMm, item.lengthMm);
            lengths.push({
                lengthMm: item.lengthMm,
                quantity: item.quantity,
            });
        }
        const stockAndLarger = exclusive.Stock +
            exclusive.Quality +
            exclusive.Preferred +
            exclusive.Memorable +
            exclusive.Trophy;
        const qualityAndLarger = exclusive.Quality +
            exclusive.Preferred +
            exclusive.Memorable +
            exclusive.Trophy;
        const preferredAndLarger = exclusive.Preferred +
            exclusive.Memorable +
            exclusive.Trophy;
        const memorableAndLarger = exclusive.Memorable + exclusive.Trophy;
        const trophyAndLarger = exclusive.Trophy;
        return {
            species: speciesName,
            measuredFish,
            substock: exclusive.Substock,
            stock: exclusive.Stock,
            quality: exclusive.Quality,
            preferred: exclusive.Preferred,
            memorable: exclusive.Memorable,
            trophy: exclusive.Trophy,
            stockAndLarger,
            qualityAndLarger,
            preferredAndLarger,
            memorableAndLarger,
            trophyAndLarger,
            psd: percentage(qualityAndLarger, stockAndLarger),
            psdP: percentage(preferredAndLarger, stockAndLarger),
            psdM: percentage(memorableAndLarger, stockAndLarger),
            psdT: percentage(trophyAndLarger, stockAndLarger),
            meanLengthMm: measuredFish > 0
                ? totalLength / measuredFish
                : null,
            largestLengthMm: measuredFish > 0 ? largestLengthMm : null,
            thresholds: entry.threshold,
            histogram: buildHistogram(lengths),
        };
    })
        .sort((left, right) => right.measuredFish - left.measuredFish ||
        left.species.localeCompare(right.species));
    return {
        generatedAt: new Date().toISOString(),
        collectionCount: ids.length,
        measuredFish: fish.reduce((total, item) => total + item.quantity, 0),
        matchedSpeciesCount: species.length,
        unmatchedSpecies: [...unmatchedSpecies].sort((a, b) => a.localeCompare(b)),
        species,
        fish,
    };
}
//# sourceMappingURL=gabelhouseService.js.map