"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectCollectionEffort = detectCollectionEffort;
exports.loadCollectionEfforts = loadCollectionEfforts;
exports.analyzeCollections = analyzeCollections;
const datasetManager_1 = __importDefault(require("../services/datasetManager"));
const gabelhouseService_1 = require("../services/gabelhouseService");
function text(value) {
    return value == null ? "" : String(value).trim();
}
function numeric(value) {
    if (value == null || value === "")
        return null;
    const parsed = Number(String(value).replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
}
function firstPositive(row, fields) {
    for (const field of fields) {
        const value = numeric(row[field]);
        if (value != null && value > 0)
            return value;
    }
    return null;
}
function getSpecies(row) {
    return text(row.CommonName) || text(row.Common_Name) || text(row.Species) || text(row.SpeciesName);
}
function getWaterbody(row) {
    return text(row.Waterbody) || text(row.waterbody);
}
function getSurveyor(row) {
    return text(row.Surveyors) || text(row.Surveyor);
}
function getDate(row) {
    const value = text(row.Survey_Date) || text(row.SurveyDate);
    if (!value)
        return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
function getGroupValue(row, grouping, collectionID) {
    switch (grouping) {
        case "collection":
            return collectionID;
        case "species":
            return getSpecies(row) || "Unknown Species";
        case "waterbody":
            return getWaterbody(row) || "Unknown Waterbody";
        case "surveyor":
            return getSurveyor(row) || "Unknown Surveyor";
        case "year": {
            const date = getDate(row);
            return date ? String(date.getFullYear()) : "Unknown Year";
        }
        case "month": {
            const date = getDate(row);
            return date
                ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
                : "Unknown Month";
        }
        default:
            return "Overall";
    }
}
function getGroupParts(row, grouping, secondaryGrouping, collectionID) {
    const primaryGroup = getGroupValue(row, grouping, collectionID);
    const secondaryGroup = secondaryGrouping && secondaryGrouping !== "overall"
        ? getGroupValue(row, secondaryGrouping, collectionID)
        : null;
    return {
        key: `${primaryGroup}\u001f${secondaryGroup ?? ""}`,
        group: secondaryGroup
            ? `${primaryGroup} — ${secondaryGroup}`
            : primaryGroup,
        primaryGroup,
        secondaryGroup,
    };
}
function detectHour(rows) {
    const passMap = new Map();
    let directHourFallback = null;
    let effortSecondsFallback = null;
    rows.forEach((row) => {
        // Explicit hour fields are already hours.
        const directHours = firstPositive(row, [
            "EffortHours",
            "Hours",
            "DurationHours",
            "Effort_Hours",
        ]);
        if (directHours != null)
            directHourFallback ??= directHours;
        // The generic VADMA Effort field is stored in seconds.
        const effortSeconds = firstPositive(row, ["Effort"]);
        if (effortSeconds != null) {
            const effortHours = effortSeconds / 3600;
            const pass = text(row.SamplePass) || text(row.RunN);
            if (pass)
                passMap.set(pass, effortHours);
            effortSecondsFallback ??= effortHours;
        }
    });
    if (directHourFallback != null)
        return directHourFallback;
    if (passMap.size) {
        return [...passMap.values()].reduce((sum, value) => sum + value, 0);
    }
    return effortSecondsFallback;
}
function detectNetNight(rows) {
    const netMap = new Map();
    let fallback = null;
    rows.forEach((row) => {
        const value = firstPositive(row, ["NightsSet", "NetNight_Net", "NetNights", "Net_Nights"]);
        if (value == null)
            return;
        const net = text(row.NetNumber) || text(row.NetNumber_Gear);
        if (net)
            netMap.set(net, value);
        fallback ??= value;
    });
    if (netMap.size)
        return [...netMap.values()].reduce((sum, value) => sum + value, 0);
    return fallback;
}
function detectDistanceMeters(rows) {
    for (const row of rows) {
        const reachLengthMeters = firstPositive(row, [
            "ReachLength_m",
            "ReachLengthM",
            "DistanceM",
            "Distance_m",
            "SampleDistanceM",
            "Sample_Distance_m",
            "TransectLengthM",
        ]);
        if (reachLengthMeters != null) {
            return reachLengthMeters;
        }
        const distanceKilometers = firstPositive(row, [
            "DistanceKm",
            "Distance_km",
            "DistanceKM",
            "SampleDistanceKm",
            "Sample_Distance_km",
            "TransectLengthKm",
            "ReachLengthKm",
            "Kilometers",
            "EffortKm",
        ]);
        if (distanceKilometers != null) {
            return distanceKilometers * 1000;
        }
    }
    return null;
}
function detectCollectionEffort(rows, collectionID) {
    return {
        collectionID,
        detectedHour: detectHour(rows),
        detectedNetNight: detectNetNight(rows),
        detectedDistanceMeters: detectDistanceMeters(rows),
    };
}
async function loadCollectionEfforts(collectionIDs, signal, onProgress) {
    await datasetManager_1.default.initialize();
    const ids = [...new Set(collectionIDs.map((id) => id.trim()).filter(Boolean))];
    const values = [];
    for (let index = 0; index < ids.length; index += 1) {
        if (signal?.aborted)
            throw new DOMException("Analysis cancelled.", "AbortError");
        const collectionID = ids[index];
        const collection = await datasetManager_1.default.getCollection(collectionID);
        values.push(detectCollectionEffort(collection.rows, collectionID));
        onProgress?.({
            completedCollections: index + 1,
            totalCollections: ids.length,
            percentComplete: ids.length ? Math.round(((index + 1) / ids.length) * 100) : 100,
            currentCollectionID: collectionID,
        });
    }
    return values;
}
function normalizeLengthToMm(length, unit) {
    const normalizedUnit = unit.trim().toLowerCase();
    if (normalizedUnit === "cm" || normalizedUnit.includes("centimeter")) {
        return length * 10;
    }
    if (normalizedUnit === "in" || normalizedUnit.includes("inch")) {
        return length * 25.4;
    }
    return length;
}
function addRow(map, row, collectionID, effort, grouping, secondaryGrouping) {
    const groupParts = getGroupParts(row, grouping, secondaryGrouping, collectionID);
    let metric = map.get(groupParts.key);
    if (!metric) {
        metric = {
            group: groupParts.group,
            primaryGroup: groupParts.primaryGroup,
            secondaryGroup: groupParts.secondaryGroup,
            collections: new Set(),
            fish: 0,
            effort: 0,
            stockFish: 0,
            qualityFish: 0,
            preferredFish: 0,
            memorableFish: 0,
            trophyFish: 0,
            hasGabelhouseSpecies: false,
            totalLength: 0,
            totalWeight: 0,
        };
        map.set(groupParts.key, metric);
    }
    if (!metric.collections.has(collectionID)) {
        metric.collections.add(collectionID);
        metric.effort += effort;
    }
    const rawQuantity = numeric(row.Quantity ?? row.quantity ?? row.Count);
    const quantity = Math.max(1, rawQuantity ?? 1);
    metric.fish += quantity;
    const rawLength = numeric(row.TotalLength ?? row.Length ?? row.Length_mm);
    const lengthUnit = text(row.LengthUnit ?? row.Length_Unit);
    const lengthMm = rawLength != null
        ? normalizeLengthToMm(rawLength, lengthUnit)
        : null;
    metric.totalLength += (rawLength ?? 0) * quantity;
    metric.totalWeight += (numeric(row.Weight ?? row.Weight_g) ?? 0) * quantity;
    const species = getSpecies(row);
    const threshold = (0, gabelhouseService_1.getGabelhouseThreshold)(species);
    if (threshold) {
        metric.hasGabelhouseSpecies = true;
    }
    if (!threshold || lengthMm == null || lengthMm <= 0) {
        return;
    }
    const designation = (0, gabelhouseService_1.classifyGabelhouseLength)(threshold, lengthMm);
    // Gabelhouse size categories are cumulative above Stock:
    // Trophy also counts as Memorable, Preferred, Quality, and Stock.
    if (designation !== "Substock")
        metric.stockFish += quantity;
    if (["Quality", "Preferred", "Memorable", "Trophy"].includes(designation)) {
        metric.qualityFish += quantity;
    }
    if (["Preferred", "Memorable", "Trophy"].includes(designation)) {
        metric.preferredFish += quantity;
    }
    if (["Memorable", "Trophy"].includes(designation)) {
        metric.memorableFish += quantity;
    }
    if (designation === "Trophy")
        metric.trophyFish += quantity;
}
function finalizeMetrics(metrics) {
    return [...metrics.values()].map((metric) => {
        const canCalculateDesignationCpue = metric.effort > 0 && metric.hasGabelhouseSpecies;
        return {
            group: metric.group,
            primaryGroup: metric.primaryGroup,
            secondaryGroup: metric.secondaryGroup,
            collections: metric.collections.size,
            fish: metric.fish,
            effort: metric.effort,
            cpue: metric.effort > 0 ? metric.fish / metric.effort : 0,
            stockFish: metric.stockFish,
            qualityFish: metric.qualityFish,
            preferredFish: metric.preferredFish,
            memorableFish: metric.memorableFish,
            trophyFish: metric.trophyFish,
            cpueS: canCalculateDesignationCpue ? metric.stockFish / metric.effort : null,
            cpueQ: canCalculateDesignationCpue ? metric.qualityFish / metric.effort : null,
            cpueP: canCalculateDesignationCpue ? metric.preferredFish / metric.effort : null,
            cpueM: canCalculateDesignationCpue ? metric.memorableFish / metric.effort : null,
            cpueT: canCalculateDesignationCpue ? metric.trophyFish / metric.effort : null,
            averageLength: metric.fish > 0 ? metric.totalLength / metric.fish : undefined,
            averageWeight: metric.fish > 0 ? metric.totalWeight / metric.fish : undefined,
        };
    }).sort((a, b) => b.cpue - a.cpue);
}
async function analyzeCollections(options) {
    await datasetManager_1.default.initialize();
    const ids = [...new Set(options.collectionIDs.map((id) => id.trim()).filter(Boolean))];
    const metrics = new Map();
    let totalEffort = 0;
    for (let index = 0; index < ids.length; index += 1) {
        if (options.signal?.aborted)
            throw new DOMException("Analysis cancelled.", "AbortError");
        const collectionID = ids[index];
        const collection = await datasetManager_1.default.getCollection(collectionID);
        const detected = detectCollectionEffort(collection.rows, collectionID);
        const detectedValue = options.effortMethod === "hour"
            ? detected.detectedHour
            : options.effortMethod === "net_night"
                ? detected.detectedNetNight
                : detected.detectedDistanceMeters;
        const override = options.effortOverrides?.[collectionID];
        const rawEffort = Number.isFinite(override) && override > 0
            ? override
            : (detectedValue ?? 0);
        const effort = options.effortMethod === "kilometer"
            ? rawEffort / 1000
            : rawEffort;
        // Effort belongs to the collection, not to each flat specimen/species row.
        // Add each collection's effort exactly once to the overall analysis total.
        totalEffort += effort;
        collection.rows.forEach((row) => addRow(metrics, row, collectionID, effort, options.grouping, options.secondaryGrouping));
        options.onProgress?.({
            completedCollections: index + 1,
            totalCollections: ids.length,
            percentComplete: ids.length ? Math.round(((index + 1) / ids.length) * 100) : 100,
            currentCollectionID: collectionID,
        });
    }
    return {
        generatedAt: new Date().toISOString(),
        collectionCount: ids.length,
        effortMethod: options.effortMethod,
        totalEffort,
        metrics: finalizeMetrics(metrics),
    };
}
//# sourceMappingURL=analysisEngine.js.map