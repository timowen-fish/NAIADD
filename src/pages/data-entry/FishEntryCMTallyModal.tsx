import { useEffect, useMemo, useState } from "react";
import "../../styles/FishEntryCMTallyModal.css";

export type FishRow = {
  CommonName: string;
  ScientificName?: string;
  Quantity: number | null;
  Length: number | null;
  LengthType?: string;
  LengthUnit?: string;
  Weight: number | null;
  Sex?: string;
  Anomaly?: string;
  Condition?: string;
  Maturity?: string;
  WildPropagated?: string;
  Disposition?: string;
  MinLength?: number | null;
  MaxLength?: number | null;
  MinWeight?: number | null;
  MaxWeight?: number | null;
  TotalWeight?: number | null;
  PrimaryTagType?: string;
  PrimaryTagNumber?: string;
  Tag1MarkRecap?: string;
  SecondaryTagType?: string;
  SecondaryTagNumber?: string;
  Tag2MarkRecap?: string;
  TissueSampleID?: string;
  TissueResults?: string;
  OtolithID?: string;
  OtolithAgeResults?: number | null;
  Comments?: string;
};

type SpeciesRecord = {
  BOVA?: string | number | null;
  CommonName: string;
  ScientificName?: string | null;
};

type FishEntryCMTallyModalProps = {
  activeRun: number;
  activePass: number;
  rows: FishRow[];
  onRowsChange: (rows: FishRow[]) => void;
  onSave: () => void;
  onClose: () => void;
};

type SortMode = "az" | "quantity" | null;
type TallyGrid = Record<string, Record<number, number>>;

function uniqueClean(values?: string[]) {
  return Array.from(
    new Set((values || []).map((x) => String(x || "").trim()).filter(Boolean)),
  ).sort();
}

function uniqueSortedNumbers(values: number[]) {
  return Array.from(new Set(values))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

function buildGridFromRows(rows: FishRow[]) {
  const species = Array.from(
    new Set(
      rows
        .map((row) => row.CommonName?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const cmBins = uniqueSortedNumbers(
    rows
      .map((row) => Number(row.Length))
      .filter((value) => Number.isFinite(value)),
  );

  const grid: TallyGrid = {};

  species.forEach((name) => {
    grid[name] = {};
  });

  rows.forEach((row) => {
    const speciesName = row.CommonName?.trim();
    const cm = Number(row.Length);

    if (!speciesName || !Number.isFinite(cm)) return;

    if (!grid[speciesName]) {
      grid[speciesName] = {};
    }

    grid[speciesName][cm] =
      (grid[speciesName][cm] || 0) + Number(row.Quantity || 0);
  });

  return {
    species,
    cmBins,
    grid,
  };
}

function getSpeciesQuantityTotal(speciesName: string, grid: TallyGrid) {
  return Object.values(grid[speciesName] || {}).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );
}

function rowsFromGrid(
  species: string[],
  cmBins: number[],
  grid: TallyGrid,
  scientificLookup: Record<string, string>,
) {
  const rows: FishRow[] = [];

  species.forEach((speciesName) => {
    cmBins.forEach((cm) => {
      const quantity = Number(grid[speciesName]?.[cm] || 0);

      if (quantity > 0) {
        rows.push({
          CommonName: speciesName,
          ScientificName: scientificLookup[speciesName] || "",
          Quantity: quantity,
          Length: cm,
          LengthType: "Total Length",
          LengthUnit: "Centimeter Class",
          Weight: null,
        });
      }
    });
  });

  return rows;
}


function getActiveVadmaThemeName(): string | undefined {
  if (typeof document === "undefined") return undefined;

  const themedElements = Array.from(
    document.querySelectorAll<HTMLElement>("[data-vadma-theme]"),
  );

  for (let i = themedElements.length - 1; i >= 0; i -= 1) {
    const value = themedElements[i].getAttribute("data-vadma-theme")?.trim();
    if (value) return value;
  }

  return undefined;
}

function FishEntryCMTallyModal({
  activeRun,
  activePass,
  rows,
  onRowsChange,
  onSave,
  onClose,
}: FishEntryCMTallyModalProps) {
  const [activeVadmaTheme, setActiveVadmaTheme] = useState<string | undefined>(
    getActiveVadmaThemeName,
  );

  const initial = useMemo(() => buildGridFromRows(rows), [rows]);

  const [speciesRecords, setSpeciesRecords] = useState<SpeciesRecord[]>([]);
  const [species, setSpecies] = useState<string[]>(initial.species);
  const [cmBins, setCmBins] = useState<number[]>(initial.cmBins);
  const [grid, setGrid] = useState<TallyGrid>(initial.grid);

  const [newSpecies, setNewSpecies] = useState("");
  const [isSpeciesPickListOpen, setIsSpeciesPickListOpen] = useState(false);
  const [highlightedSpeciesIndex, setHighlightedSpeciesIndex] = useState(0);
  const [newCmBin, setNewCmBin] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>(null);

  useEffect(() => {
    function refreshTheme() {
      setActiveVadmaTheme(getActiveVadmaThemeName());
    }

    refreshTheme();

    const observer = new MutationObserver(refreshTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-vadma-theme", "class"],
    });

    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["data-vadma-theme", "class"],
      });
    }

    window.addEventListener("storage", refreshTheme);
    window.addEventListener("vadma-theme-change", refreshTheme as EventListener);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", refreshTheme);
      window.removeEventListener("vadma-theme-change", refreshTheme as EventListener);
    };
  }, []);

  useEffect(() => {
    fetch("/data/fish_species.json")
      .then((response) => response.json())
      .then((data: SpeciesRecord[]) => {
        setSpeciesRecords(data || []);
        localStorage.setItem("vadma_fish_species", JSON.stringify(data || []));
      })
      .catch(() => {
        const cached = localStorage.getItem("vadma_fish_species");

        if (cached) {
          setSpeciesRecords(JSON.parse(cached));
        }
      });
  }, []);

  const speciesNames = useMemo(
    () => uniqueClean(speciesRecords.map((x) => x.CommonName)),
    [speciesRecords],
  );

  const newSpeciesMatches = useMemo(() => {
    const searchText = newSpecies.trim().toLowerCase();

    if (searchText.length < 2) return [];

    const startsWith = speciesNames.filter((name) =>
      name.trim().toLowerCase().startsWith(searchText),
    );

    const contains = speciesNames.filter((name) => {
      const cleanName = name.trim().toLowerCase();

      return cleanName.includes(searchText) && !cleanName.startsWith(searchText);
    });

    return [...startsWith, ...contains].slice(0, 12);
  }, [newSpecies, speciesNames]);

  function selectNewSpecies(name: string) {
    setNewSpecies(name);
    setIsSpeciesPickListOpen(false);
    setHighlightedSpeciesIndex(0);
  }

  const scientificLookup = useMemo(() => {
    const out: Record<string, string> = {};

    speciesRecords.forEach((sp) => {
      if (sp.CommonName) {
        out[sp.CommonName] = sp.ScientificName || "";
      }
    });

    return out;
  }, [speciesRecords]);

  const displayedSpecies = useMemo(() => {
    const copied = [...species];

    if (sortMode === "az") {
      return copied.sort((a, b) => a.localeCompare(b));
    }

    if (sortMode === "quantity") {
      return copied.sort((a, b) => {
        const quantityDifference =
          getSpeciesQuantityTotal(b, grid) - getSpeciesQuantityTotal(a, grid);

        if (quantityDifference !== 0) return quantityDifference;

        return a.localeCompare(b);
      });
    }

    return copied;
  }, [species, grid, sortMode]);

  function findValidSpecies(value: string) {
    const cleanValue = value.trim().toLowerCase();

    const exact = speciesNames.find(
      (name) => name.trim().toLowerCase() === cleanValue,
    );

    if (exact) return exact;

    const startsWithMatches = speciesNames.filter((name) =>
      name.trim().toLowerCase().startsWith(cleanValue),
    );

    if (startsWithMatches.length === 1) return startsWithMatches[0];

    return "";
  }

  function syncRows(
    nextSpecies: string[],
    nextCmBins: number[],
    nextGrid: TallyGrid,
  ) {
    onRowsChange(
      rowsFromGrid(nextSpecies, nextCmBins, nextGrid, scientificLookup),
    );
  }

  function addSpecies() {
    const validSpecies = findValidSpecies(newSpecies);

    if (!validSpecies) return;

    if (species.includes(validSpecies)) {
      setNewSpecies("");
      return;
    }

    const nextSpecies = [...species, validSpecies];

    const nextGrid = {
      ...grid,
      [validSpecies]: {},
    };

    setSpecies(nextSpecies);
    setGrid(nextGrid);
    setNewSpecies("");

    syncRows(nextSpecies, cmBins, nextGrid);
  }

  function addCmBin() {
    const cm = Number(newCmBin);

    if (!Number.isFinite(cm)) return;

    const rounded = Math.round(cm);

    if (rounded <= 0) return;

    const nextCmBins = uniqueSortedNumbers([...cmBins, rounded]);

    setCmBins(nextCmBins);
    setNewCmBin("");

    syncRows(species, nextCmBins, grid);
  }

  function updateQuantity(speciesName: string, cm: number, value: string) {
    const numericValue = value === "" ? 0 : Number(value);

    if (!Number.isFinite(numericValue) || numericValue < 0) return;

    const nextGrid = {
      ...grid,
      [speciesName]: {
        ...(grid[speciesName] || {}),
        [cm]: Math.floor(numericValue),
      },
    };

    setGrid(nextGrid);
    syncRows(species, cmBins, nextGrid);
  }

  function adjustQuantity(speciesName: string, cm: number, delta: number) {
    const currentValue = Number(grid[speciesName]?.[cm] || 0);
    const nextValue = Math.max(0, currentValue + delta);

    const nextGrid = {
      ...grid,
      [speciesName]: {
        ...(grid[speciesName] || {}),
        [cm]: nextValue,
      },
    };

    setGrid(nextGrid);
    syncRows(species, cmBins, nextGrid);
  }

  function removeSpecies(speciesName: string) {
    const nextSpecies = species.filter((value) => value !== speciesName);
    const nextGrid = { ...grid };

    delete nextGrid[speciesName];

    setSpecies(nextSpecies);
    setGrid(nextGrid);

    syncRows(nextSpecies, cmBins, nextGrid);
  }

  function removeCmBin(cm: number) {
    const nextCmBins = cmBins.filter((value) => value !== cm);

    const nextGrid: TallyGrid = {};

    species.forEach((speciesName) => {
      nextGrid[speciesName] = { ...(grid[speciesName] || {}) };
      delete nextGrid[speciesName][cm];
    });

    setCmBins(nextCmBins);
    setGrid(nextGrid);

    syncRows(species, nextCmBins, nextGrid);
  }

  return (
    <div className="cmTallyOverlay" data-vadma-theme={activeVadmaTheme}>
      <section className="cmTallyModal">
        <header className="cmTallyHeader">
          <div>
            <p className="cmTallyKicker">
              Run {activeRun + 1} · Pass {activePass + 1}
            </p>

            <h2>Centimeter Tally Entry</h2>

            <p>
              Add species as columns, add centimeter bins as rows, then use the
              minus and plus buttons or type values directly into the tally
              grid.
            </p>
          </div>

          <button type="button" className="cmTallyClose" onClick={onClose}>
            ×
          </button>
        </header>

        <section className="cmTallyTools">
          <label className="cmTallyTool">
            <span>Add Species</span>

            <div className="cmTallyInputRow">
              <div className="cmTallySpeciesPickList">
                <input
                  value={newSpecies}
                  placeholder="Type common name..."
                  autoComplete="off"
                  onFocus={() => setIsSpeciesPickListOpen(true)}
                  onChange={(event) => {
                    setIsSpeciesPickListOpen(true);
                    setHighlightedSpeciesIndex(0);
                    setNewSpecies(event.target.value);
                  }}
                  onBlur={(event) => {
                    window.setTimeout(() => setIsSpeciesPickListOpen(false), 120);

                    const validSpecies = findValidSpecies(event.target.value);

                    if (validSpecies) {
                      setNewSpecies(validSpecies);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (
                      isSpeciesPickListOpen &&
                      newSpeciesMatches.length > 0 &&
                      event.key === "ArrowDown"
                    ) {
                      event.preventDefault();
                      setHighlightedSpeciesIndex((current) =>
                        Math.min(current + 1, newSpeciesMatches.length - 1),
                      );
                      return;
                    }

                    if (
                      isSpeciesPickListOpen &&
                      newSpeciesMatches.length > 0 &&
                      event.key === "ArrowUp"
                    ) {
                      event.preventDefault();
                      setHighlightedSpeciesIndex((current) =>
                        Math.max(current - 1, 0),
                      );
                      return;
                    }

                    if (
                      isSpeciesPickListOpen &&
                      newSpeciesMatches.length > 0 &&
                      event.key === "Enter"
                    ) {
                      event.preventDefault();
                      selectNewSpecies(
                        newSpeciesMatches[highlightedSpeciesIndex] ||
                          newSpeciesMatches[0],
                      );
                      return;
                    }

                    if (event.key === "Enter") {
                      event.preventDefault();
                      addSpecies();
                    }
                  }}
                />

                {isSpeciesPickListOpen && newSpecies.trim().length >= 2 && (
                  <div className="cmTallySpeciesPickListDropdown">
                    {newSpeciesMatches.length > 0 ? (
                      <>
                        <div className="cmTallySpeciesPickListHeader">
                          Matching cached species
                        </div>

                        {newSpeciesMatches.map((name, index) => (
                          <button
                            key={name}
                            type="button"
                            className={
                              index === highlightedSpeciesIndex
                                ? "cmTallySpeciesPickListOption active"
                                : "cmTallySpeciesPickListOption"
                            }
                            onMouseDown={(event) => {
                              event.preventDefault();
                              selectNewSpecies(name);
                            }}
                          >
                            <span>{name}</span>
                            <small>Select</small>
                          </button>
                        ))}
                      </>
                    ) : (
                      <div className="cmTallySpeciesPickListEmpty">
                        No cached species match. Keep typing to enter a custom value.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button type="button" onClick={addSpecies}>
                Add
              </button>
            </div>
          </label>

          <label className="cmTallyTool">
            <span>Add CM Bin</span>

            <div className="cmTallyInputRow">
              <input
                value={newCmBin}
                type="number"
                inputMode="numeric"
                placeholder="Example: 13"
                onChange={(event) => setNewCmBin(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCmBin();
                  }
                }}
              />

              <button type="button" onClick={addCmBin}>
                Add
              </button>
            </div>
          </label>
        </section>

        <section className="cmTallyTableShell">
          <table className="cmTallyTable">
            <colgroup>
              <col className="cmTallyBinCol" />

              {displayedSpecies.map((speciesName) => (
                <col key={speciesName} className="cmTallySpeciesCol" />
              ))}
            </colgroup>

            <thead>
              <tr>
                <th className="cmBinHeader">CM Bin</th>

                {displayedSpecies.map((speciesName) => (
                  <th key={speciesName}>
                    <div className="speciesHeaderCell">
                      <span title={speciesName}>{speciesName}</span>

                      <button
                        type="button"
                        title={`Remove ${speciesName}`}
                        onClick={() => removeSpecies(speciesName)}
                      >
                        ×
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {cmBins.map((cm) => (
                <tr key={cm}>
                  <th className="cmBinCell">
                    <div className="cmBinCellInner">
                      <span>{cm} cm</span>

                      <button
                        type="button"
                        title={`Remove ${cm} cm bin`}
                        onClick={() => removeCmBin(cm)}
                      >
                        ×
                      </button>
                    </div>
                  </th>

                  {displayedSpecies.map((speciesName) => (
                    <td key={`${speciesName}-${cm}`}>
                      <div className="cmTallyQuantityBox">
                        <button
                          type="button"
                          className="cmTallyMinus"
                          onClick={() => adjustQuantity(speciesName, cm, -1)}
                          aria-label={`Decrease ${speciesName} ${cm} cm tally`}
                        >
                          −
                        </button>

                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={grid[speciesName]?.[cm] || ""}
                          onChange={(event) =>
                            updateQuantity(speciesName, cm, event.target.value)
                          }
                        />

                        <button
                          type="button"
                          className="cmTallyPlus"
                          onClick={() => adjustQuantity(speciesName, cm, 1)}
                          aria-label={`Increase ${speciesName} ${cm} cm tally`}
                        >
                          +
                        </button>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {species.length === 0 || cmBins.length === 0 ? (
            <div className="cmTallyEmpty">
              Add at least one species and one centimeter bin to begin.
            </div>
          ) : null}
        </section>

        <footer className="cmTallyActions">
          <div
            className="cmTallySortControls"
            aria-label="Sort species columns"
          >
            <span>Sort By:</span>

            <button
              type="button"
              className={sortMode === "az" ? "active" : ""}
              onClick={() => setSortMode(sortMode === "az" ? null : "az")}
            >
              A-Z
            </button>

            <button
              type="button"
              className={sortMode === "quantity" ? "active" : ""}
              onClick={() =>
                setSortMode(sortMode === "quantity" ? null : "quantity")
              }
            >
              Quantity
            </button>
          </div>

          <div className="cmTallyActionButtons">
            <button
              type="button"
              className="cmTallySecondary"
              onClick={onClose}
            >
              Cancel
            </button>

            <button type="button" className="cmTallySave" onClick={onSave}>
              Save Tally
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export default FishEntryCMTallyModal;
