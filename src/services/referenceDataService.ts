import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import type {
  CachedReferenceDataSnapshot,
  GeneralReferenceData,
  ReferenceDataLoadResult,
  ReferenceDataSnapshot,
  ReferenceDataSource,
  SpeciesRecord,
  SpeciesRecordInput,
} from "../types/referenceData";

const GENERAL_COLLECTION = "referenceData";
const SPECIES_COLLECTION = "species";
const FIRESTORE_BATCH_LIMIT = 450;

const REFERENCE_CACHE_KEY = "naiadd.referenceData.v1";
const REFERENCE_CACHE_VERSION = 1;

const BUNDLED_GENERAL_PATH = "/data/data_entry_lists.json";
const BUNDLED_SPECIES_PATH = "/data/species_list.json";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeReferenceKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.map(normalizeText).filter(Boolean)),
  ).sort((left, right) =>
    left.localeCompare(right, undefined, {
      sensitivity: "base",
      numeric: true,
    }),
  );
}

export function getReferenceList(
  generalLists: GeneralReferenceData,
  aliases: readonly string[],
): string[] {
  const entries = Object.entries(generalLists);
  const normalizedAliases = aliases.map(normalizeReferenceKey);

  const exact = entries.find(([key]) =>
    normalizedAliases.includes(normalizeReferenceKey(key)),
  );

  if (exact) {
    return exact[1];
  }

  const partial = entries.find(([key]) => {
    const normalizedKey = normalizeReferenceKey(key);

    return normalizedAliases.some(
      (alias) =>
        normalizedKey.includes(alias) ||
        alias.includes(normalizedKey),
    );
  });

  return partial?.[1] ?? [];
}

export function normalizeGeneralLists(
  input: Record<string, unknown>,
): GeneralReferenceData {
  const normalized: GeneralReferenceData = {};

  Object.entries(input).forEach(([key, value]) => {
    if (!Array.isArray(value)) {
      return;
    }

    normalized[key] = normalizeStringArray(value);
  });

  return normalized;
}

export function makeSpeciesId(species: SpeciesRecordInput): string {
  const source = `${species.BOVA}-${species.CommonName}-${species.ScientificName}`
    .toLowerCase()
    .trim();

  const slug = source
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);

  return slug || crypto.randomUUID();
}

export function normalizeSpecies(
  input: Array<Record<string, unknown>>,
): SpeciesRecord[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  return input
    .map((record) => {
      const speciesInput: SpeciesRecordInput = {
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

      const normalizedNameKey =
        `${species.CommonName}|${species.ScientificName}`.toLowerCase();

      if (
        seenIds.has(species.id) ||
        seenNames.has(normalizedNameKey)
      ) {
        return false;
      }

      seenIds.add(species.id);
      seenNames.add(normalizedNameKey);
      return true;
    })
    .sort((left, right) =>
      left.CommonName.localeCompare(
        right.CommonName,
        undefined,
        {
          sensitivity: "base",
          numeric: true,
        },
      ),
    );
}

function normalizeSnapshot(
  snapshot: ReferenceDataSnapshot,
): ReferenceDataSnapshot {
  return {
    generalLists: normalizeGeneralLists(snapshot.generalLists),
    species: normalizeSpecies(
      snapshot.species as unknown as Array<Record<string, unknown>>,
    ),
  };
}

function saveReferenceDataCache(
  snapshot: ReferenceDataSnapshot,
  source: ReferenceDataSource,
): void {
  try {
    const cached: CachedReferenceDataSnapshot = {
      version: REFERENCE_CACHE_VERSION,
      savedAt: new Date().toISOString(),
      source,
      snapshot: normalizeSnapshot(snapshot),
    };

    window.localStorage.setItem(
      REFERENCE_CACHE_KEY,
      JSON.stringify(cached),
    );
  } catch (error) {
    console.warn(
      "Reference data loaded, but the local cache could not be updated.",
      error,
    );
  }
}

export function loadCachedReferenceData(): ReferenceDataSnapshot | null {
  try {
    const raw = window.localStorage.getItem(REFERENCE_CACHE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CachedReferenceDataSnapshot;

    if (
      parsed.version !== REFERENCE_CACHE_VERSION ||
      !parsed.snapshot ||
      typeof parsed.snapshot !== "object"
    ) {
      return null;
    }

    return normalizeSnapshot(parsed.snapshot);
  } catch (error) {
    console.warn(
      "The cached reference data could not be read.",
      error,
    );
    return null;
  }
}

export function clearReferenceDataCache(): void {
  try {
    window.localStorage.removeItem(REFERENCE_CACHE_KEY);
  } catch (error) {
    console.warn(
      "The cached reference data could not be cleared.",
      error,
    );
  }
}

export async function loadReferenceData(): Promise<ReferenceDataSnapshot> {
  const [generalSnapshot, speciesSnapshot] = await Promise.all([
    getDocs(collection(db, GENERAL_COLLECTION)),
    getDocs(collection(db, SPECIES_COLLECTION)),
  ]);

  const generalLists: GeneralReferenceData = {};

  generalSnapshot.docs.forEach((document) => {
    const data = document.data() as Record<string, unknown>;

    const documentValues =
      normalizeStringArray(data.values).length > 0
        ? normalizeStringArray(data.values)
        : normalizeStringArray(data.items).length > 0
          ? normalizeStringArray(data.items)
          : normalizeStringArray(data.options);

    if (documentValues.length > 0) {
      generalLists[document.id] = documentValues;
    }

    Object.entries(data).forEach(([fieldName, fieldValue]) => {
      if (
        fieldName === "values" ||
        fieldName === "items" ||
        fieldName === "options" ||
        fieldName === "updatedAt"
      ) {
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
      const data = document.data() as Record<string, unknown>;

      return {
        id: document.id,
        BOVA: normalizeText(data.BOVA),
        CommonName: normalizeText(data.CommonName),
        ScientificName: normalizeText(data.ScientificName),
      };
    })
    .filter(
      (record) =>
        record.CommonName.length > 0 &&
        record.ScientificName.length > 0,
    );

  const snapshot = normalizeSnapshot({
    generalLists,
    species,
  });

  if (
    Object.keys(snapshot.generalLists).length === 0 &&
    snapshot.species.length === 0
  ) {
    throw new Error(
      "Firestore reference data is empty. Load bundled defaults from the administration page.",
    );
  }

  saveReferenceDataCache(snapshot, "firestore");

  return snapshot;
}

export async function loadReferenceDataResilient(): Promise<ReferenceDataLoadResult> {
  try {
    const firestoreSnapshot = await loadReferenceData();

    return {
      source: "firestore",
      snapshot: firestoreSnapshot,
    };
  } catch (firestoreError) {
    console.warn(
      "Firestore reference data could not be loaded.",
      firestoreError,
    );

    const cachedSnapshot = loadCachedReferenceData();

    if (cachedSnapshot) {
      return {
        source: "cache",
        snapshot: cachedSnapshot,
      };
    }

    const bundledSnapshot = await loadBundledReferenceData();

    return {
      source: "bundled",
      snapshot: bundledSnapshot,
    };
  }
}

async function commitOperations(
  operations: Array<(batch: ReturnType<typeof writeBatch>) => void>,
): Promise<void> {
  for (
    let index = 0;
    index < operations.length;
    index += FIRESTORE_BATCH_LIMIT
  ) {
    const batch = writeBatch(db);

    operations
      .slice(index, index + FIRESTORE_BATCH_LIMIT)
      .forEach((operation) => operation(batch));

    await batch.commit();
  }
}

export async function replaceReferenceData(
  snapshot: ReferenceDataSnapshot,
): Promise<void> {
  const normalized = normalizeSnapshot(snapshot);

  const [existingGeneral, existingSpecies] = await Promise.all([
    getDocs(collection(db, GENERAL_COLLECTION)),
    getDocs(collection(db, SPECIES_COLLECTION)),
  ]);

  const operations: Array<
    (batch: ReturnType<typeof writeBatch>) => void
  > = [];

  existingGeneral.docs.forEach((document) => {
    operations.push((batch) => batch.delete(document.ref));
  });

  existingSpecies.docs.forEach((document) => {
    operations.push((batch) => batch.delete(document.ref));
  });

  Object.entries(normalized.generalLists).forEach(
    ([listName, values]) => {
      const reference = doc(db, GENERAL_COLLECTION, listName);

      operations.push((batch) =>
        batch.set(reference, {
          values,
          updatedAt: serverTimestamp(),
        }),
      );
    },
  );

  normalized.species.forEach((species) => {
    const reference = doc(
      db,
      SPECIES_COLLECTION,
      species.id,
    );

    operations.push((batch) =>
      batch.set(reference, {
        BOVA: species.BOVA,
        CommonName: species.CommonName,
        ScientificName: species.ScientificName,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  await commitOperations(operations);
  saveReferenceDataCache(normalized, "firestore");
}

export async function loadBundledReferenceData(): Promise<ReferenceDataSnapshot> {
  const [generalResponse, speciesResponse] = await Promise.all([
    fetch(BUNDLED_GENERAL_PATH, { cache: "no-store" }),
    fetch(BUNDLED_SPECIES_PATH, { cache: "no-store" }),
  ]);

  if (!generalResponse.ok || !speciesResponse.ok) {
    throw new Error(
      "The bundled reference-data files could not be loaded. Confirm data_entry_lists.json and species_list.json are in public/data.",
    );
  }

  const generalJson =
    (await generalResponse.json()) as Record<string, unknown>;
  const speciesJson =
    (await speciesResponse.json()) as Array<Record<string, unknown>>;

  const snapshot = normalizeSnapshot({
    generalLists: normalizeGeneralLists(generalJson),
    species: normalizeSpecies(speciesJson),
  });

  saveReferenceDataCache(snapshot, "bundled");

  return snapshot;
}
