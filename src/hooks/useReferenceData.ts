import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getReferenceList,
  loadReferenceDataResilient,
} from "../services/referenceDataService";
import type {
  GeneralReferenceData,
  ReferenceDataSource,
  SpeciesRecord,
} from "../types/referenceData";

export type ReferenceDataState = {
  generalLists: GeneralReferenceData;
  species: SpeciesRecord[];
  source: ReferenceDataSource | null;
  loading: boolean;
  error: string | null;
};

const EMPTY_STATE: ReferenceDataState = {
  generalLists: {},
  species: [],
  source: null,
  loading: true,
  error: null,
};

export function useReferenceData() {
  const [state, setState] = useState<ReferenceDataState>(EMPTY_STATE);

  const refresh = useCallback(async (): Promise<void> => {
    setState((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    try {
      const result = await loadReferenceDataResilient();

      setState({
        generalLists: result.snapshot.generalLists,
        species: result.snapshot.species,
        source: result.source,
        loading: false,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Reference data could not be loaded.";

      setState({
        generalLists: {},
        species: [],
        source: null,
        loading: false,
        error: message,
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const getList = useCallback(
    (...aliases: string[]): string[] =>
      getReferenceList(state.generalLists, aliases),
    [state.generalLists],
  );

  const speciesByCommonName = useMemo(
    () =>
      [...state.species].sort((left, right) =>
        left.CommonName.localeCompare(right.CommonName, undefined, {
          sensitivity: "base",
          numeric: true,
        }),
      ),
    [state.species],
  );

  const speciesByScientificName = useMemo(
    () =>
      [...state.species].sort((left, right) =>
        left.ScientificName.localeCompare(
          right.ScientificName,
          undefined,
          {
            sensitivity: "base",
            numeric: true,
          },
        ),
      ),
    [state.species],
  );

  const findSpecies = useCallback(
    (value: string): SpeciesRecord | undefined => {
      const normalized = value.trim().toLowerCase();

      if (!normalized) {
        return undefined;
      }

      return state.species.find(
        (species) =>
          species.id.toLowerCase() === normalized ||
          species.BOVA.toLowerCase() === normalized ||
          species.CommonName.toLowerCase() === normalized ||
          species.ScientificName.toLowerCase() === normalized,
      );
    },
    [state.species],
  );

  return {
    ...state,
    refresh,
    getList,
    findSpecies,
    speciesByCommonName,
    speciesByScientificName,
  };
}
