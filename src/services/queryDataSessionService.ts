export type QueryDataCoordinate = {
  latitude: number;
  longitude: number;
};

export type QueryDataCustomFilterField =
  | "species"
  | "surveyor"
  | "project"
  | "targetSpecies"
  | "surveyType"
  | "equipment";

export type QueryDataCustomFilters = Partial<
  Record<QueryDataCustomFilterField, string[]>
>;

export type QueryDataBoundaryType = "county" | "huc8" | "";

export type QueryDataSession = {
  startDate: string;
  endDate: string;
  areaPolygon: QueryDataCoordinate[];
  areaBoundaryType: QueryDataBoundaryType;
  areaBoundaryId: string;
  areaBoundaryLabel: string;
  selectedSiteNames: string[];
  selectedWaterbodies: string[];
  activeCustomFilterFields: QueryDataCustomFilterField[];
  customFilters: QueryDataCustomFilters;
};


export type AppliedQueryData = {
  session: QueryDataSession;
  collectionIDs: string[];
  appliedAt: string;
};

export type SavedQueryData = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  session: QueryDataSession;
};

const QUERY_DATA_SESSION_KEY = "vadma-query-data-session";
const SAVED_QUERY_DATA_KEY_PREFIX = "vadma-query-data-saved";
export const SAVED_QUERY_DATA_EVENT = "vadma-query-data-saved-updated";
export const QUERY_DATA_SESSION_EVENT = "vadma-query-data-session-updated";
export const APPLIED_QUERY_DATA_EVENT = "vadma-query-data-applied-updated";
const APPLIED_QUERY_DATA_KEY = "vadma-query-data-applied";

const DEFAULT_QUERY_DATA_SESSION: QueryDataSession = {
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

function isValidDateInput(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value))
  );
}

function normalizePolygon(value: unknown): QueryDataCoordinate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((coordinate) => {
      if (!coordinate || typeof coordinate !== "object") {
        return null;
      }

      const candidate = coordinate as Partial<QueryDataCoordinate>;
      const latitude = Number(candidate.latitude);
      const longitude = Number(candidate.longitude);

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return null;
      }

      return { latitude, longitude };
    })
    .filter(
      (coordinate): coordinate is QueryDataCoordinate =>
        coordinate !== null,
    );
}


const CUSTOM_FILTER_FIELDS: QueryDataCustomFilterField[] = [
  "species",
  "surveyor",
  "project",
  "targetSpecies",
  "surveyType",
  "equipment",
];

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCustomFilters(
  value: unknown,
): QueryDataCustomFilters {
  if (!value || typeof value !== "object") {
    return {};
  }

  const candidate = value as Record<string, unknown>;
  const normalized: QueryDataCustomFilters = {};

  for (const field of CUSTOM_FILTER_FIELDS) {
    const values = normalizeStringArray(candidate[field]);

    if (values.length > 0) {
      normalized[field] = values;
    }
  }

  return normalized;
}

function normalizeBoundaryType(value: unknown): QueryDataBoundaryType {
  return value === "county" || value === "huc8" ? value : "";
}

function normalizeSession(value: unknown): QueryDataSession {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_QUERY_DATA_SESSION };
  }

  const candidate = value as Partial<QueryDataSession>;

  return {
    startDate: isValidDateInput(candidate.startDate)
      ? candidate.startDate
      : "",
    endDate: isValidDateInput(candidate.endDate)
      ? candidate.endDate
      : "",
    areaPolygon: normalizePolygon(candidate.areaPolygon),
    areaBoundaryType: normalizeBoundaryType(candidate.areaBoundaryType),
    areaBoundaryId:
      typeof candidate.areaBoundaryId === "string"
        ? candidate.areaBoundaryId.trim()
        : "",
    areaBoundaryLabel:
      typeof candidate.areaBoundaryLabel === "string"
        ? candidate.areaBoundaryLabel.trim()
        : "",
    selectedSiteNames: Array.isArray(candidate.selectedSiteNames)
      ? candidate.selectedSiteNames
          .filter((siteName): siteName is string => typeof siteName === "string")
          .map((siteName) => siteName.trim())
          .filter(Boolean)
      : [],
    selectedWaterbodies: normalizeStringArray(
      candidate.selectedWaterbodies,
    ),
    activeCustomFilterFields: normalizeStringArray(
      candidate.activeCustomFilterFields,
    ).filter(
      (field): field is QueryDataCustomFilterField =>
        CUSTOM_FILTER_FIELDS.includes(
          field as QueryDataCustomFilterField,
        ),
    ),
    customFilters: normalizeCustomFilters(candidate.customFilters),
  };
}

export function loadQueryDataSession(): QueryDataSession {
  try {
    const stored = window.localStorage.getItem(QUERY_DATA_SESSION_KEY);

    if (!stored) {
      return { ...DEFAULT_QUERY_DATA_SESSION };
    }

    return normalizeSession(JSON.parse(stored));
  } catch (error) {
    console.warn("Unable to load Query Data session.", error);
    return { ...DEFAULT_QUERY_DATA_SESSION };
  }
}

export function saveQueryDataSession(
  session: QueryDataSession,
): QueryDataSession {
  const normalized = normalizeSession(session);

  try {
    window.localStorage.setItem(
      QUERY_DATA_SESSION_KEY,
      JSON.stringify(normalized),
    );

    window.dispatchEvent(
      new CustomEvent<QueryDataSession>(QUERY_DATA_SESSION_EVENT, {
        detail: normalized,
      }),
    );
  } catch (error) {
    console.warn("Unable to save Query Data session.", error);
  }

  return normalized;
}

export function updateQueryDataSession(
  updates: Partial<QueryDataSession>,
): QueryDataSession {
  return saveQueryDataSession({
    ...loadQueryDataSession(),
    ...updates,
  });
}

export function clearQueryDataSession(): QueryDataSession {
  return saveQueryDataSession(DEFAULT_QUERY_DATA_SESSION);
}


function getCurrentUserStorageKey(): string {
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (!key || !key.startsWith("firebase:authUser:")) {
        continue;
      }

      const rawUser = window.localStorage.getItem(key);
      if (!rawUser) continue;

      const user = JSON.parse(rawUser) as { uid?: unknown; email?: unknown };
      const identity = String(user.uid ?? user.email ?? "").trim();

      if (identity) {
        return identity.replace(/[^a-zA-Z0-9@._-]/g, "_");
      }
    }
  } catch (error) {
    console.warn("Unable to resolve the Query Data user storage key.", error);
  }

  return "local-user";
}

function getSavedQueryStorageKey(): string {
  return `${SAVED_QUERY_DATA_KEY_PREFIX}:${getCurrentUserStorageKey()}`;
}

function normalizeSavedQuery(value: unknown): SavedQueryData | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<SavedQueryData>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";

  if (!id || !name) return null;

  const createdAt =
    typeof candidate.createdAt === "string" && candidate.createdAt
      ? candidate.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof candidate.updatedAt === "string" && candidate.updatedAt
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

export function loadSavedQueryData(): SavedQueryData[] {
  try {
    const stored = window.localStorage.getItem(getSavedQueryStorageKey());
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeSavedQuery)
      .filter((query): query is SavedQueryData => query !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch (error) {
    console.warn("Unable to load saved Query Data queries.", error);
    return [];
  }
}

function persistSavedQueryData(queries: SavedQueryData[]): SavedQueryData[] {
  const normalized = queries
    .map(normalizeSavedQuery)
    .filter((query): query is SavedQueryData => query !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  try {
    window.localStorage.setItem(
      getSavedQueryStorageKey(),
      JSON.stringify(normalized),
    );
    window.dispatchEvent(
      new CustomEvent<SavedQueryData[]>(SAVED_QUERY_DATA_EVENT, {
        detail: normalized,
      }),
    );
  } catch (error) {
    console.warn("Unable to save Query Data queries.", error);
  }

  return normalized;
}

export function saveNamedQueryData(
  name: string,
  session: QueryDataSession,
  existingId?: string,
): SavedQueryData[] {
  const trimmedName = name.trim();
  if (!trimmedName) return loadSavedQueryData();

  const now = new Date().toISOString();
  const current = loadSavedQueryData();
  const matchingById = existingId
    ? current.find((query) => query.id === existingId)
    : undefined;
  const matchingByName = current.find(
    (query) => query.name.toLowerCase() === trimmedName.toLowerCase(),
  );
  const existing = matchingById ?? matchingByName;
  const id =
    existing?.id ??
    `query_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const saved: SavedQueryData = {
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

export function deleteSavedQueryData(id: string): SavedQueryData[] {
  return persistSavedQueryData(
    loadSavedQueryData().filter((query) => query.id !== id),
  );
}


export function saveAppliedQueryData(
  session: QueryDataSession,
  collectionIDs: string[],
): AppliedQueryData {
  const applied: AppliedQueryData = {
    session: normalizeSession(session),
    collectionIDs: [...new Set(collectionIDs.map((value) => value.trim()).filter(Boolean))],
    appliedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(APPLIED_QUERY_DATA_KEY, JSON.stringify(applied));
    window.dispatchEvent(
      new CustomEvent<AppliedQueryData>(APPLIED_QUERY_DATA_EVENT, {
        detail: applied,
      }),
    );
  } catch (error) {
    console.warn("Unable to save the applied Query Data result.", error);
  }

  return applied;
}

export function loadAppliedQueryData(): AppliedQueryData | null {
  try {
    const stored = window.localStorage.getItem(APPLIED_QUERY_DATA_KEY);
    if (!stored) return null;

    const candidate = JSON.parse(stored) as Partial<AppliedQueryData>;
    if (!candidate || typeof candidate !== "object") return null;

    return {
      session: normalizeSession(candidate.session),
      collectionIDs: normalizeStringArray(candidate.collectionIDs),
      appliedAt:
        typeof candidate.appliedAt === "string"
          ? candidate.appliedAt
          : "",
    };
  } catch (error) {
    console.warn("Unable to load the applied Query Data result.", error);
    return null;
  }
}
