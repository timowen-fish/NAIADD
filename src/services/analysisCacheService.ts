import type {
  AnalysisGrouping,
  AnalysisResult,
  EffortMethod,
} from "./analysisEngine";

const ANALYSIS_CACHE_KEY_PREFIX = "naiadd-analysis-cache-v1";
const ANALYSIS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type AnalysisCacheIdentity = {
  collectionIDs: string[];
  grouping: AnalysisGrouping;
  effortMethod: EffortMethod;
  appliedAt?: string;
};

export type CachedAnalysis = {
  key: string;
  createdAt: string;
  identity: AnalysisCacheIdentity;
  result: AnalysisResult;
};

function getCurrentUserStorageKey(): string {
  try {
    for (
      let index = 0;
      index < window.localStorage.length;
      index += 1
    ) {
      const key = window.localStorage.key(index);

      if (!key || !key.startsWith("firebase:authUser:")) {
        continue;
      }

      const rawUser = window.localStorage.getItem(key);
      if (!rawUser) continue;

      const user = JSON.parse(rawUser) as {
        uid?: unknown;
        email?: unknown;
      };

      const identity = String(
        user.uid ?? user.email ?? "",
      ).trim();

      if (identity) {
        return identity.replace(
          /[^a-zA-Z0-9@._-]/g,
          "_",
        );
      }
    }
  } catch (error) {
    console.warn(
      "Unable to resolve the analysis cache user key.",
      error,
    );
  }

  return "local-user";
}

function normalizeCollectionIDs(
  collectionIDs: readonly string[],
): string[] {
  return [
    ...new Set(
      collectionIDs
        .map((collectionID) => collectionID.trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function hashText(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function normalizeIdentity(
  identity: AnalysisCacheIdentity,
): AnalysisCacheIdentity {
  return {
    collectionIDs: normalizeCollectionIDs(
      identity.collectionIDs,
    ),
    grouping: identity.grouping,
    effortMethod: identity.effortMethod,
    appliedAt:
      typeof identity.appliedAt === "string"
        ? identity.appliedAt
        : "",
  };
}

export function buildAnalysisCacheKey(
  identity: AnalysisCacheIdentity,
): string {
  const normalized = normalizeIdentity(identity);

  const signature = JSON.stringify({
    collectionIDs: normalized.collectionIDs,
    grouping: normalized.grouping,
    effortMethod: normalized.effortMethod,
    appliedAt: normalized.appliedAt,
  });

  return `${ANALYSIS_CACHE_KEY_PREFIX}:${getCurrentUserStorageKey()}:${hashText(
    signature,
  )}`;
}

function isAnalysisResult(
  value: unknown,
): value is AnalysisResult {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<AnalysisResult>;

  return (
    typeof candidate.generatedAt === "string" &&
    Number.isFinite(candidate.collectionCount) &&
    Array.isArray(candidate.metrics)
  );
}

function isCacheExpired(createdAt: string): boolean {
  const createdTime = new Date(createdAt).getTime();

  if (Number.isNaN(createdTime)) return true;

  return (
    Date.now() - createdTime >
    ANALYSIS_CACHE_MAX_AGE_MS
  );
}

export function loadCachedAnalysis(
  identity: AnalysisCacheIdentity,
): CachedAnalysis | null {
  const key = buildAnalysisCacheKey(identity);

  try {
    const stored = window.localStorage.getItem(key);

    if (!stored) return null;

    const parsed = JSON.parse(
      stored,
    ) as Partial<CachedAnalysis>;

    if (
      parsed.key !== key ||
      typeof parsed.createdAt !== "string" ||
      !parsed.identity ||
      !isAnalysisResult(parsed.result)
    ) {
      window.localStorage.removeItem(key);
      return null;
    }

    if (isCacheExpired(parsed.createdAt)) {
      window.localStorage.removeItem(key);
      return null;
    }

    return {
      key,
      createdAt: parsed.createdAt,
      identity: normalizeIdentity(parsed.identity),
      result: parsed.result,
    };
  } catch (error) {
    console.warn(
      "Unable to load the cached analysis.",
      error,
    );

    window.localStorage.removeItem(key);
    return null;
  }
}

export function saveCachedAnalysis(
  identity: AnalysisCacheIdentity,
  result: AnalysisResult,
): CachedAnalysis {
  const normalizedIdentity =
    normalizeIdentity(identity);
  const key = buildAnalysisCacheKey(
    normalizedIdentity,
  );

  const cached: CachedAnalysis = {
    key,
    createdAt: new Date().toISOString(),
    identity: normalizedIdentity,
    result,
  };

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(cached),
    );
  } catch (error) {
    console.warn(
      "Unable to save the analysis cache.",
      error,
    );
  }

  return cached;
}

export function clearCachedAnalysis(
  identity: AnalysisCacheIdentity,
): void {
  try {
    window.localStorage.removeItem(
      buildAnalysisCacheKey(identity),
    );
  } catch (error) {
    console.warn(
      "Unable to clear the cached analysis.",
      error,
    );
  }
}

export function clearAllCachedAnalyses(): void {
  const userPrefix = `${ANALYSIS_CACHE_KEY_PREFIX}:${getCurrentUserStorageKey()}:`;

  try {
    const keysToRemove: string[] = [];

    for (
      let index = 0;
      index < window.localStorage.length;
      index += 1
    ) {
      const key = window.localStorage.key(index);

      if (key?.startsWith(userPrefix)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch (error) {
    console.warn(
      "Unable to clear cached analyses.",
      error,
    );
  }
}
