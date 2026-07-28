import {
  GABELHOUSE_THRESHOLDS,
  type GabelhouseThreshold,
} from "../data/gabelhouseThresholds";
import { DatasetManager } from "./datasetManager";
import type { CurrentDatasetRow } from "./currentDatasetService";

export type GabelhouseDesignation =
  | "Substock"
  | "Stock"
  | "Quality"
  | "Preferred"
  | "Memorable"
  | "Trophy";

export type SizeStructureProgress = {
  completedCollections: number;
  totalCollections: number;
  percentComplete: number;
  currentCollectionID: string;
};

export type ClassifiedFish = {
  collectionID: string;
  commonName: string;
  lengthMm: number;
  lengthDisplay: string;
  quantity: number;
  designation: GabelhouseDesignation;
  weight: number | null;
  weightUnit: string;
  waterbody: string;
  siteName: string;
  surveyDate: string;
  surveyor: string;
};

export type SpeciesSizeStructure = {
  species: string;
  measuredFish: number;
  substock: number;
  stock: number;
  quality: number;
  preferred: number;
  memorable: number;
  trophy: number;
  stockAndLarger: number;
  qualityAndLarger: number;
  preferredAndLarger: number;
  memorableAndLarger: number;
  trophyAndLarger: number;
  psd: number | null;
  psdP: number | null;
  psdM: number | null;
  psdT: number | null;
  meanLengthMm: number | null;
  largestLengthMm: number | null;
  thresholds: GabelhouseThreshold;
  histogram: Array<{
    minimumMm: number;
    maximumMm: number;
    count: number;
  }>;
};

export type SizeStructureResult = {
  generatedAt: string;
  collectionCount: number;
  measuredFish: number;
  matchedSpeciesCount: number;
  unmatchedSpecies: string[];
  species: SpeciesSizeStructure[];
  fish: ClassifiedFish[];
};

export type AnalyzeSizeStructureOptions = {
  collectionIDs: string[];
  signal?: AbortSignal;
  onProgress?: (progress: SizeStructureProgress) => void;
};

const thresholdBySpecies = new Map(
  GABELHOUSE_THRESHOLDS.map((threshold) => [
    normalizeSpeciesName(threshold.species),
    threshold,
  ]),
);

const SPECIES_ALIASES: Readonly<Record<string, string>> = {
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

function normalizeSpeciesName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function textValue(row: CurrentDatasetRow, keys: string[]): string {
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

function numericValue(row: CurrentDatasetRow, keys: string[]): number | null {
  for (const key of keys) {
    const raw = row[key];

    if (raw === null || raw === undefined || raw === "") {
      continue;
    }

    const value =
      typeof raw === "number"
        ? raw
        : Number(String(raw).replace(/,/g, "").trim());

    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function normalizeLengthToMm(
  length: number,
  unit: string,
): number | null {
  if (!Number.isFinite(length) || length <= 0) {
    return null;
  }

  const normalizedUnit = unit.trim().toLowerCase();

  if (
    normalizedUnit.includes("centimeter") ||
    normalizedUnit === "cm"
  ) {
    return length * 10;
  }

  if (
    normalizedUnit.includes("inch") ||
    normalizedUnit === "in"
  ) {
    return length * 25.4;
  }

  // VADMA specimen lengths are normally stored in millimeters.
  return length;
}

export function getGabelhouseThreshold(commonName: string): GabelhouseThreshold | null {
  const normalized = normalizeSpeciesName(commonName);
  const alias = SPECIES_ALIASES[normalized] ?? normalized;
  return thresholdBySpecies.get(alias) ?? null;
}

export function classifyGabelhouseLength(
  threshold: GabelhouseThreshold,
  lengthMm: number,
): GabelhouseDesignation {
  if (
    threshold.trophyMm !== null &&
    lengthMm >= threshold.trophyMm
  ) {
    return "Trophy";
  }

  if (
    threshold.memorableMm !== null &&
    lengthMm >= threshold.memorableMm
  ) {
    return "Memorable";
  }

  if (
    threshold.preferredMm !== null &&
    lengthMm >= threshold.preferredMm
  ) {
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

function buildHistogram(
  lengths: Array<{ lengthMm: number; quantity: number }>,
): SpeciesSizeStructure["histogram"] {
  if (lengths.length === 0) {
    return [];
  }

  const maximum = Math.max(...lengths.map((item) => item.lengthMm));
  const binWidth = maximum <= 300 ? 10 : maximum <= 700 ? 25 : 50;
  const upperBound = Math.ceil(maximum / binWidth) * binWidth;
  const histogram: SpeciesSizeStructure["histogram"] = [];

  for (let minimumMm = 0; minimumMm < upperBound; minimumMm += binWidth) {
    const maximumMm = minimumMm + binWidth;
    const count = lengths.reduce(
      (total, item) =>
        item.lengthMm >= minimumMm && item.lengthMm < maximumMm
          ? total + item.quantity
          : total,
      0,
    );

    histogram.push({
      minimumMm,
      maximumMm,
      count,
    });
  }

  return histogram;
}

function percentage(
  numerator: number,
  denominator: number,
): number | null {
  if (denominator <= 0) {
    return null;
  }

  return (numerator / denominator) * 100;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Analysis cancelled.", "AbortError");
  }
}

export async function analyzeSizeStructure({
  collectionIDs,
  signal,
  onProgress,
}: AnalyzeSizeStructureOptions): Promise<SizeStructureResult> {
  await DatasetManager.initialize();

  const ids = [
    ...new Set(
      collectionIDs
        .map((collectionID) => collectionID.trim())
        .filter(Boolean),
    ),
  ];

  const fish: ClassifiedFish[] = [];
  const unmatchedSpecies = new Set<string>();

  for (let index = 0; index < ids.length; index += 1) {
    throwIfAborted(signal);

    const collectionID = ids[index];
    const collection = await DatasetManager.getCollection(collectionID);

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
      const quantity =
        rawQuantity !== null && rawQuantity > 0
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
        designation: classifyGabelhouseLength(
          threshold,
          lengthMm,
        ),
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
      percentComplete:
        ids.length > 0
          ? Math.round(
              (completedCollections / ids.length) * 100,
            )
          : 100,
      currentCollectionID: collectionID,
    });

    await Promise.resolve();
  }

  const bySpecies = new Map<
    string,
    {
      threshold: GabelhouseThreshold;
      fish: ClassifiedFish[];
    }
  >();

  for (const item of fish) {
    const threshold = getGabelhouseThreshold(item.commonName);

    if (!threshold) {
      continue;
    }

    const existing = bySpecies.get(threshold.species);

    if (existing) {
      existing.fish.push(item);
    } else {
      bySpecies.set(threshold.species, {
        threshold,
        fish: [item],
      });
    }
  }

  const species = [...bySpecies.entries()]
    .map(([speciesName, entry]): SpeciesSizeStructure => {
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
      const lengths: Array<{
        lengthMm: number;
        quantity: number;
      }> = [];

      for (const item of entry.fish) {
        exclusive[item.designation] += item.quantity;
        measuredFish += item.quantity;
        totalLength += item.lengthMm * item.quantity;
        largestLengthMm = Math.max(
          largestLengthMm,
          item.lengthMm,
        );
        lengths.push({
          lengthMm: item.lengthMm,
          quantity: item.quantity,
        });
      }

      const stockAndLarger =
        exclusive.Stock +
        exclusive.Quality +
        exclusive.Preferred +
        exclusive.Memorable +
        exclusive.Trophy;
      const qualityAndLarger =
        exclusive.Quality +
        exclusive.Preferred +
        exclusive.Memorable +
        exclusive.Trophy;
      const preferredAndLarger =
        exclusive.Preferred +
        exclusive.Memorable +
        exclusive.Trophy;
      const memorableAndLarger =
        exclusive.Memorable + exclusive.Trophy;
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
        meanLengthMm:
          measuredFish > 0
            ? totalLength / measuredFish
            : null,
        largestLengthMm:
          measuredFish > 0 ? largestLengthMm : null,
        thresholds: entry.threshold,
        histogram: buildHistogram(lengths),
      };
    })
    .sort(
      (left, right) =>
        right.measuredFish - left.measuredFish ||
        left.species.localeCompare(right.species),
    );

  return {
    generatedAt: new Date().toISOString(),
    collectionCount: ids.length,
    measuredFish: fish.reduce(
      (total, item) => total + item.quantity,
      0,
    ),
    matchedSpeciesCount: species.length,
    unmatchedSpecies: [...unmatchedSpecies].sort((a, b) =>
      a.localeCompare(b),
    ),
    species,
    fish,
  };
}
