export type GeneralReferenceData = Record<string, string[]>;

export type SpeciesRecord = {
  id: string;
  BOVA: string;
  CommonName: string;
  ScientificName: string;
};

export type SpeciesRecordInput = Omit<SpeciesRecord, "id">;

export type ReferenceDataSource =
  | "firestore"
  | "cache"
  | "bundled";

export type ReferenceDataSnapshot = {
  generalLists: GeneralReferenceData;
  species: SpeciesRecord[];
};

export type CachedReferenceDataSnapshot = {
  version: 1;
  savedAt: string;
  source: ReferenceDataSource;
  snapshot: ReferenceDataSnapshot;
};

export type ReferenceDataLoadResult = {
  source: ReferenceDataSource;
  snapshot: ReferenceDataSnapshot;
};

export type ReferenceDataChangeSummary = {
  added: number;
  modified: number;
  deleted: number;
};
