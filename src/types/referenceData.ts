export type GeneralReferenceData = Record<string, string[]>;

export type FishSpecies = {
  id: string;
  BOVA: string;
  CommonName: string;
  ScientificName: string;
};

export type FishSpeciesInput = Omit<FishSpecies, "id">;

export type ReferenceDataSnapshot = {
  generalLists: GeneralReferenceData;
  species: FishSpecies[];
};

export type ReferenceDataChangeSummary = {
  added: number;
  modified: number;
  deleted: number;
};
