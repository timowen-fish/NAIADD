"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APPLIED_QUERY_DATA_EVENT = exports.QUERY_DATA_SESSION_EVENT = exports.SAVED_QUERY_DATA_EVENT = void 0;
exports.loadQueryDataSession = loadQueryDataSession;
exports.saveQueryDataSession = saveQueryDataSession;
exports.updateQueryDataSession = updateQueryDataSession;
exports.clearQueryDataSession = clearQueryDataSession;
exports.loadSavedQueryData = loadSavedQueryData;
exports.saveNamedQueryData = saveNamedQueryData;
exports.deleteSavedQueryData = deleteSavedQueryData;
exports.saveAppliedQueryData = saveAppliedQueryData;
exports.loadAppliedQueryData = loadAppliedQueryData;
const QUERY_DATA_SESSION_KEY = "naiadd-query-data-session";
const SAVED_QUERY_DATA_KEY_PREFIX = "naiadd-query-data-saved";
exports.SAVED_QUERY_DATA_EVENT = "naiadd-query-data-saved-updated";
exports.QUERY_DATA_SESSION_EVENT = "naiadd-query-data-session-updated";
exports.APPLIED_QUERY_DATA_EVENT = "naiadd-query-data-applied-updated";
const APPLIED_QUERY_DATA_KEY = "naiadd-query-data-applied";
const DEFAULT_QUERY_DATA_SESSION = {
    startDate: "",
    endDate: "",
    areaPolygon: [],
    areaBoundaryType: "",
    areaBoundaryId: "",
    areaBoundaryLabel: "",
    selectedSiteNames: [],
    selectedWaterbodies: [],
    activeCustomFilterFields: [],
    customFilters: {},
};
function isValidDateInput(value) {
    return (typeof value === "string" &&
        (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value)));
}
function normalizePolygon(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((coordinate) => {
        if (!coordinate || typeof coordinate !== "object") {
            return null;
        }
        const candidate = coordinate;
        const latitude = Number(candidate.latitude);
        const longitude = Number(candidate.longitude);
        if (!Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180) {
            return null;
        }
        return { latitude, longitude };
    })
        .filter((coordinate) => coordinate !== null);
}
const CUSTOM_FILTER_FIELDS = [
    "species",
    "surveyor",
    "project",
    "targetSpecies",
    "surveyType",
    "equipment",
];
function normalizeStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
}
function normalizeCustomFilters(value) {
    if (!value || typeof value !== "object") {
        return {};
    }
    const candidate = value;
    const normalized = {};
    for (const field of CUSTOM_FILTER_FIELDS) {
        const values = normalizeStringArray(candidate[field]);
        if (values.length > 0) {
            normalized[field] = values;
        }
    }
    return normalized;
}
function normalizeBoundaryType(value) {
    return value === "county" || value === "huc8" ? value : "";
}
function normalizeSession(value) {
    if (!value || typeof value !== "object") {
        return { ...DEFAULT_QUERY_DATA_SESSION };
    }
    const candidate = value;
    return {
        startDate: isValidDateInput(candidate.startDate)
            ? candidate.startDate
            : "",
        endDate: isValidDateInput(candidate.endDate)
            ? candidate.endDate
            : "",
        areaPolygon: normalizePolygon(candidate.areaPolygon),
        areaBoundaryType: normalizeBoundaryType(candidate.areaBoundaryType),
        areaBoundaryId: typeof candidate.areaBoundaryId === "string"
            ? candidate.areaBoundaryId.trim()
            : "",
        areaBoundaryLabel: typeof candidate.areaBoundaryLabel === "string"
            ? candidate.areaBoundaryLabel.trim()
            : "",
        selectedSiteNames: Array.isArray(candidate.selectedSiteNames)
            ? candidate.selectedSiteNames
                .filter((siteName) => typeof siteName === "string")
                .map((siteName) => siteName.trim())
                .filter(Boolean)
            : [],
        selectedWaterbodies: normalizeStringArray(candidate.selectedWaterbodies),
        activeCustomFilterFields: normalizeStringArray(candidate.activeCustomFilterFields).filter((field) => CUSTOM_FILTER_FIELDS.includes(field)),
        customFilters: normalizeCustomFilters(candidate.customFilters),
    };
}
function loadQueryDataSession() {
    try {
        const stored = window.localStorage.getItem(QUERY_DATA_SESSION_KEY);
        if (!stored) {
            return { ...DEFAULT_QUERY_DATA_SESSION };
        }
        return normalizeSession(JSON.parse(stored));
    }
    catch (error) {
        console.warn("Unable to load Query Data session.", error);
        return { ...DEFAULT_QUERY_DATA_SESSION };
    }
}
function saveQueryDataSession(session) {
    const normalized = normalizeSession(session);
    try {
        window.localStorage.setItem(QUERY_DATA_SESSION_KEY, JSON.stringify(normalized));
        window.dispatchEvent(new CustomEvent(exports.QUERY_DATA_SESSION_EVENT, {
            detail: normalized,
        }));
    }
    catch (error) {
        console.warn("Unable to save Query Data session.", error);
    }
    return normalized;
}
function updateQueryDataSession(updates) {
    return saveQueryDataSession({
        ...loadQueryDataSession(),
        ...updates,
    });
}
function clearQueryDataSession() {
    return saveQueryDataSession(DEFAULT_QUERY_DATA_SESSION);
}
function getCurrentUserStorageKey() {
    try {
        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (!key || !key.startsWith("firebase:authUser:")) {
                continue;
            }
            const rawUser = window.localStorage.getItem(key);
            if (!rawUser)
                continue;
            const user = JSON.parse(rawUser);
            const identity = String(user.uid ?? user.email ?? "").trim();
            if (identity) {
                return identity.replace(/[^a-zA-Z0-9@._-]/g, "_");
            }
        }
    }
    catch (error) {
        console.warn("Unable to resolve the Query Data user storage key.", error);
    }
    return "local-user";
}
function getSavedQueryStorageKey() {
    return `${SAVED_QUERY_DATA_KEY_PREFIX}:${getCurrentUserStorageKey()}`;
}
function normalizeSavedQuery(value) {
    if (!value || typeof value !== "object")
        return null;
    const candidate = value;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!id || !name)
        return null;
    const createdAt = typeof candidate.createdAt === "string" && candidate.createdAt
        ? candidate.createdAt
        : new Date().toISOString();
    const updatedAt = typeof candidate.updatedAt === "string" && candidate.updatedAt
        ? candidate.updatedAt
        : createdAt;
    return {
        id,
        name,
        createdAt,
        updatedAt,
        session: normalizeSession(candidate.session),
    };
}
function loadSavedQueryData() {
    try {
        const stored = window.localStorage.getItem(getSavedQueryStorageKey());
        if (!stored)
            return [];
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed))
            return [];
        return parsed
            .map(normalizeSavedQuery)
            .filter((query) => query !== null)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }
    catch (error) {
        console.warn("Unable to load saved Query Data queries.", error);
        return [];
    }
}
function persistSavedQueryData(queries) {
    const normalized = queries
        .map(normalizeSavedQuery)
        .filter((query) => query !== null)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    try {
        window.localStorage.setItem(getSavedQueryStorageKey(), JSON.stringify(normalized));
        window.dispatchEvent(new CustomEvent(exports.SAVED_QUERY_DATA_EVENT, {
            detail: normalized,
        }));
    }
    catch (error) {
        console.warn("Unable to save Query Data queries.", error);
    }
    return normalized;
}
function saveNamedQueryData(name, session, existingId) {
    const trimmedName = name.trim();
    if (!trimmedName)
        return loadSavedQueryData();
    const now = new Date().toISOString();
    const current = loadSavedQueryData();
    const matchingById = existingId
        ? current.find((query) => query.id === existingId)
        : undefined;
    const matchingByName = current.find((query) => query.name.toLowerCase() === trimmedName.toLowerCase());
    const existing = matchingById ?? matchingByName;
    const id = existing?.id ??
        `query_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const saved = {
        id,
        name: trimmedName,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        session: normalizeSession(session),
    };
    return persistSavedQueryData([
        saved,
        ...current.filter((query) => query.id !== id),
    ]);
}
function deleteSavedQueryData(id) {
    return persistSavedQueryData(loadSavedQueryData().filter((query) => query.id !== id));
}
function saveAppliedQueryData(session, collectionIDs) {
    const applied = {
        session: normalizeSession(session),
        collectionIDs: [...new Set(collectionIDs.map((value) => value.trim()).filter(Boolean))],
        appliedAt: new Date().toISOString(),
    };
    try {
        window.localStorage.setItem(APPLIED_QUERY_DATA_KEY, JSON.stringify(applied));
        window.dispatchEvent(new CustomEvent(exports.APPLIED_QUERY_DATA_EVENT, {
            detail: applied,
        }));
    }
    catch (error) {
        console.warn("Unable to save the applied Query Data result.", error);
    }
    return applied;
}
function loadAppliedQueryData() {
    try {
        const stored = window.localStorage.getItem(APPLIED_QUERY_DATA_KEY);
        if (!stored)
            return null;
        const candidate = JSON.parse(stored);
        if (!candidate || typeof candidate !== "object")
            return null;
        return {
            session: normalizeSession(candidate.session),
            collectionIDs: normalizeStringArray(candidate.collectionIDs),
            appliedAt: typeof candidate.appliedAt === "string"
                ? candidate.appliedAt
                : "",
        };
    }
    catch (error) {
        console.warn("Unable to load the applied Query Data result.", error);
        return null;
    }
}
//# sourceMappingURL=queryDataSessionService.js.map