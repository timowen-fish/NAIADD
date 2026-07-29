import type { LocationRecord } from "./location";
import type { SurveyInfoRecord } from "./survey";

export type DataEntryStep =
  | "location"
  | "survey"
  | "specimens"
  | "review"
  | "submit";

export type SpecimenFormType =
  | "standard_mussel"
  | "quads"
  | "musselrama";

/**
 * Shared specimen row shape used by the survey session.
 *
 * The specimen entry components currently define their more specific row
 * structures locally. This flexible record type allows the survey session to
 * persist rows from Standard Mussel Processing, Quads, and Musselrama entry methods
 * without importing a nonexistent ./specimen module.
 */
export type SpecimenRecord = Record<string, unknown>;

export interface SurveySession {
  id: string;
  collectionId: string;
  ownerUid: string;
  currentStep: DataEntryStep;
  location: LocationRecord | null;
  survey: SurveyInfoRecord | null;
  specimenFormType: SpecimenFormType | null;
  specimens: SpecimenRecord[];
  createdAt: string;
  updatedAt: string;
  version: 1;
}
