import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import "../../styles/MusselModal_Standard.css";

export type MusselStandardRow = {
  BOVA: string;
  ScientificName: string;
  Quantity: number | null;
  Size: string;
  SexMaturity: string;
  Condition: string;
  QualAbundance: string;
  SpecimenNotes: string;
};

type SpeciesRecord = {
  BOVA?: string | number | null;
  CommonName?: string | null;
  ScientificName: string;
};

type DataEntryLists = {
  Condition?: string[];
  SexMaturity?: string[];
  QualAbundance?: string[];
};

type MusselModalStandardProps = {
  activeRun: number;
  activePass: number;
  rows: MusselStandardRow[];
  onRowsChange: (rows: MusselStandardRow[]) => void;
  onSave: () => void;
  onClose: () => void;
};

type MusselField = keyof MusselStandardRow;

const FIELD_ORDER_STORAGE_KEY =
  "naiadd_mussel_standard_field_order_v1";
const DESKTOP_ENTRY_STORAGE_KEY =
  "naiadd_mussel_standard_not_mobile_v1";

const defaultFieldOrder: MusselField[] = [
  "ScientificName",
  "Quantity",
  "Size",
  "SexMaturity",
  "Condition",
  "QualAbundance",
  "SpecimenNotes",
];

const fieldLabels: Record<MusselField, string> = {
  ScientificName: "Scientific Name",
  BOVA: "BOVA",
  Quantity: "Quantity",
  Size: "Size",
  SexMaturity: "Sex / Maturity",
  Condition: "Condition",
  QualAbundance: "Qualitative Abundance",
  SpecimenNotes: "Specimen Notes",
};

function fieldClassName(field: MusselField) {
  if (field === "ScientificName") return "musselScientificNameCol";
  if (field === "Quantity") return "musselQuantityCol";
  if (field === "Size") return "musselSizeCol";
  if (field === "SexMaturity") return "musselSexMaturityCol";
  if (field === "Condition") return "musselConditionCol";
  if (field === "QualAbundance") return "musselQualAbundanceCol";
  if (field === "SpecimenNotes") return "musselNotesCol";
  return undefined;
}

const fallbackCondition = [
  "",
  "Live",
  "Fresh Dead",
  "Decomposing",
  "Shell Only",
];

const fallbackSexMaturity = [
  "",
  "Unknown",
  "Male",
  "Female",
  "Juvenile",
  "Gravid Female",
];

const fallbackQualAbundance = [
  "",
  "Rare",
  "Uncommon",
  "Common",
  "Abundant",
];

function emptyRow(): MusselStandardRow {
  return {
    BOVA: "",
    ScientificName: "",
    Quantity: null,
    Size: "",
    SexMaturity: "",
    Condition: "",
    QualAbundance: "",
    SpecimenNotes: "",
  };
}

function uniqueClean(values?: string[]) {
  return Array.from(
    new Set(
      (values || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function cleanNonNegativeInteger(value: string) {
  if (value === "") return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, parsed);
}

function rowHasData(row: MusselStandardRow) {
  return row.ScientificName.trim() !== "";
}

function makeNextRow(source?: MusselStandardRow): MusselStandardRow {
  if (!source) return emptyRow();

  return {
    BOVA: source.BOVA,
    ScientificName: source.ScientificName,
    Quantity: 1,
    Size: "",
    SexMaturity: source.SexMaturity,
    Condition: source.Condition,
    QualAbundance: source.QualAbundance,
    SpecimenNotes: "",
  };
}

function readSavedFieldOrder(): MusselField[] {
  try {
    const raw = localStorage.getItem(FIELD_ORDER_STORAGE_KEY);
    if (!raw) return defaultFieldOrder;

    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return defaultFieldOrder;

    const valid = parsed.filter((field): field is MusselField =>
      defaultFieldOrder.includes(field as MusselField),
    );

    return [
      ...valid,
      ...defaultFieldOrder.filter((field) => !valid.includes(field)),
    ];
  } catch {
    return defaultFieldOrder;
  }
}

function readSavedDesktopMode() {
  try {
    return localStorage.getItem(DESKTOP_ENTRY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export default function MusselModalStandard({
  activeRun,
  activePass,
  rows,
  onRowsChange,
  onSave,
  onClose,
}: MusselModalStandardProps) {
  const [species, setSpecies] = useState<SpeciesRecord[]>([]);
  const [lists, setLists] = useState<DataEntryLists>({});
  const [desktopEntryMode, setDesktopEntryMode] = useState(
    readSavedDesktopMode,
  );
  const [showReorderFields, setShowReorderFields] = useState(false);
  const [fieldOrder, setFieldOrder] = useState<MusselField[]>(
    readSavedFieldOrder,
  );
  const [pendingFocus, setPendingFocus] = useState<{
    rowIndex: number;
    field: MusselField;
  } | null>(null);

  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    try {
      localStorage.setItem(
        DESKTOP_ENTRY_STORAGE_KEY,
        String(desktopEntryMode),
      );
    } catch {
      // Ignore restricted storage.
    }
  }, [desktopEntryMode]);

  useEffect(() => {
    try {
      localStorage.setItem(
        FIELD_ORDER_STORAGE_KEY,
        JSON.stringify(fieldOrder),
      );
    } catch {
      // Ignore restricted storage.
    }
  }, [fieldOrder]);

  useEffect(() => {
    let cancelled = false;

    async function loadReferenceData() {
      try {
        const speciesResponse = await fetch("/data/species_list.json");
        if (!speciesResponse.ok) {
          throw new Error("Unable to load species_list.json");
        }

        const speciesData = (await speciesResponse.json()) as SpeciesRecord[];
        if (!Array.isArray(speciesData)) {
          throw new Error("Species data is not an array.");
        }

        const validSpecies = speciesData
          .map((record) => ({
            BOVA: record.BOVA ?? "",
            CommonName: record.CommonName ?? "",
            ScientificName: String(record.ScientificName || "").trim(),
          }))
          .filter((record) => record.ScientificName);

        if (!cancelled) setSpecies(validSpecies);

        try {
          localStorage.setItem(
            "naiadd_mollusk_species_v1",
            JSON.stringify(validSpecies),
          );
        } catch {
          // Ignore restricted storage.
        }
      } catch {
        try {
          const cached = localStorage.getItem(
            "naiadd_mollusk_species_v1",
          );
          if (cached && !cancelled) {
            setSpecies(JSON.parse(cached));
          }
        } catch {
          // Custom scientific-name text remains available.
        }
      }

      try {
        const listResponse = await fetch("/data/data_entry_lists.json");
        if (!listResponse.ok) return;

        const listData = (await listResponse.json()) as DataEntryLists;
        if (!cancelled) setLists(listData || {});
      } catch {
        // Fixed fallback options remain available.
      }
    }

    void loadReferenceData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pendingFocus) return;

    const key = `${pendingFocus.rowIndex}:${pendingFocus.field}`;
    const element = fieldRefs.current[key];
    element?.focus({ preventScroll: true });
    setPendingFocus(null);
  }, [pendingFocus, rows.length]);

  const speciesByScientificName = useMemo(() => {
    const lookup = new Map<string, SpeciesRecord>();

    species.forEach((record) => {
      lookup.set(record.ScientificName.toLowerCase(), record);
    });

    return lookup;
  }, [species]);

  const scientificNames = useMemo(
    () =>
      uniqueClean(
        species.map((record) => record.ScientificName),
      ),
    [species],
  );

  function setFieldRef(rowIndex: number, field: MusselField) {
    return (element: HTMLElement | null) => {
      fieldRefs.current[`${rowIndex}:${field}`] = element;
    };
  }

  function updateRow(
    rowIndex: number,
    field: MusselField,
    value: string | number | null,
  ) {
    onRowsChange(
      rows.map((row, index) => {
        if (index !== rowIndex) return row;

        const updated = {
          ...row,
          [field]: value,
        } as MusselStandardRow;

        if (field === "ScientificName" && typeof value === "string") {
          const match = speciesByScientificName.get(
            value.trim().toLowerCase(),
          );

          updated.BOVA =
            match?.BOVA === undefined || match?.BOVA === null
              ? ""
              : String(match.BOVA);

          if (
            value.trim() &&
            (updated.Quantity === null ||
              updated.Quantity === undefined)
          ) {
            updated.Quantity = 1;
          }
        }

        return updated;
      }),
    );
  }

  function commitScientificName(rowIndex: number, value: string) {
    const cleaned = value.trim();
    const exact = scientificNames.find(
      (name) => name.toLowerCase() === cleaned.toLowerCase(),
    );

    if (exact) {
      updateRow(rowIndex, "ScientificName", exact);
      return;
    }

    const startsWith = scientificNames.filter((name) =>
      name.toLowerCase().startsWith(cleaned.toLowerCase()),
    );

    updateRow(
      rowIndex,
      "ScientificName",
      startsWith.length === 1 ? startsWith[0] : value,
    );
  }

  function handleFieldKeyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIndex: number,
    field: MusselField,
  ) {
    if (!desktopEntryMode) return;
    if (event.key !== "Enter" && event.key !== "Tab") return;

    event.preventDefault();

    const currentIndex = fieldOrder.indexOf(field);
    if (currentIndex < 0) return;

    let nextRowIndex = rowIndex;
    let nextFieldIndex =
      currentIndex + (event.shiftKey && event.key === "Tab" ? -1 : 1);

    if (nextFieldIndex >= fieldOrder.length) {
      nextRowIndex += 1;
      nextFieldIndex = 0;
    }

    if (nextFieldIndex < 0) {
      nextRowIndex -= 1;
      nextFieldIndex = fieldOrder.length - 1;
    }

    if (nextRowIndex < 0) return;

    const nextField = fieldOrder[nextFieldIndex];

    if (nextRowIndex >= rows.length) {
      onRowsChange([...rows, emptyRow()]);
      setPendingFocus({ rowIndex: nextRowIndex, field: nextField });
      return;
    }

    fieldRefs.current[`${nextRowIndex}:${nextField}`]?.focus({
      preventScroll: true,
    });
  }

  function addNewMussel() {
    onRowsChange([...rows, emptyRow()]);
  }

  function addNextMussel() {
    const source = [...rows].reverse().find(rowHasData);
    const nextIndex = rows.length;
    onRowsChange([...rows, makeNextRow(source)]);
    setPendingFocus({
      rowIndex: nextIndex,
      field: source ? "Quantity" : "ScientificName",
    });
  }

  function addRows(count: number) {
    onRowsChange([
      ...rows,
      ...Array.from({ length: count }, () => emptyRow()),
    ]);
  }

  function clearTable() {
    if (
      !window.confirm(
        "Are you sure you want to clear this mussel table? This cannot be undone.",
      )
    ) {
      return;
    }

    onRowsChange([emptyRow()]);
  }

  function moveField(field: MusselField, direction: -1 | 1) {
    setFieldOrder((current) => {
      const currentIndex = current.indexOf(field);
      const nextIndex = currentIndex + direction;

      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= current.length
      ) {
        return current;
      }

      const updated = [...current];
      const [moved] = updated.splice(currentIndex, 1);
      updated.splice(nextIndex, 0, moved);
      return updated;
    });
  }

  function renderCell(
    row: MusselStandardRow,
    rowIndex: number,
    field: MusselField,
  ) {
    if (field === "ScientificName") {
      return (
        <ScientificNameCell
          inputRef={setFieldRef(rowIndex, field)}
          value={row.ScientificName}
          scientificNames={scientificNames}
          onChange={(value) =>
            updateRow(rowIndex, "ScientificName", value)
          }
          onCommit={(value) =>
            commitScientificName(rowIndex, value)
          }
          onKeyDown={(event) =>
            handleFieldKeyDown(
              event,
              rowIndex,
              "ScientificName",
            )
          }
        />
      );
    }

    if (field === "Quantity") {
      return (
        <input
          ref={setFieldRef(rowIndex, field)}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={row.Quantity ?? ""}
          onKeyDown={(event) =>
            handleFieldKeyDown(event, rowIndex, field)
          }
          onChange={(event) =>
            updateRow(
              rowIndex,
              field,
              cleanNonNegativeInteger(event.target.value),
            )
          }
        />
      );
    }

    if (field === "Condition") {
      return (
        <SelectCell
          inputRef={setFieldRef(rowIndex, field)}
          value={row.Condition}
          options={[
            "",
            ...uniqueClean(
              lists.Condition?.length
                ? lists.Condition
                : fallbackCondition,
            ),
          ]}
          onChange={(value) =>
            updateRow(rowIndex, field, value)
          }
          onKeyDown={(event) =>
            handleFieldKeyDown(event, rowIndex, field)
          }
        />
      );
    }

    if (field === "SexMaturity") {
      return (
        <SelectCell
          inputRef={setFieldRef(rowIndex, field)}
          value={row.SexMaturity}
          options={[
            "",
            ...uniqueClean(
              lists.SexMaturity?.length
                ? lists.SexMaturity
                : fallbackSexMaturity,
            ),
          ]}
          onChange={(value) =>
            updateRow(rowIndex, field, value)
          }
          onKeyDown={(event) =>
            handleFieldKeyDown(event, rowIndex, field)
          }
        />
      );
    }

    if (field === "QualAbundance") {
      return (
        <SelectCell
          inputRef={setFieldRef(rowIndex, field)}
          value={row.QualAbundance}
          options={[
            "",
            ...uniqueClean(
              lists.QualAbundance?.length
                ? lists.QualAbundance
                : fallbackQualAbundance,
            ),
          ]}
          onChange={(value) =>
            updateRow(rowIndex, field, value)
          }
          onKeyDown={(event) =>
            handleFieldKeyDown(event, rowIndex, field)
          }
        />
      );
    }

    return (
      <input
        ref={setFieldRef(rowIndex, field)}
        value={String(row[field] ?? "")}
        readOnly={field === "BOVA"}
        className={field === "BOVA" ? "locked" : undefined}
        onKeyDown={(event) =>
          handleFieldKeyDown(event, rowIndex, field)
        }
        onChange={(event) =>
          updateRow(rowIndex, field, event.target.value)
        }
      />
    );
  }

  return (
    <div className="musselModalOverlay">
      <section className="musselModal">
        <style>{`
          .musselTableShell {
            overflow-x: auto;
          }

          .musselModalTable {
            width: max-content !important;
            min-width: 1320px !important;
            table-layout: auto !important;
          }

          .musselModalTable th.musselScientificNameCol,
          .musselModalTable td.musselScientificNameCol {
            min-width: 360px !important;
            width: 360px !important;
            max-width: 360px !important;
          }

          .musselModalTable th.musselQuantityCol,
          .musselModalTable td.musselQuantityCol {
            min-width: 78px;
            width: 78px;
          }

          .musselModalTable th.musselSizeCol,
          .musselModalTable td.musselSizeCol {
            min-width: 100px;
            width: 100px;
          }

          .musselModalTable th.musselSexMaturityCol,
          .musselModalTable td.musselSexMaturityCol {
            min-width: 145px;
            width: 145px;
          }

          .musselModalTable th.musselConditionCol,
          .musselModalTable td.musselConditionCol {
            min-width: 140px;
            width: 140px;
          }

          .musselModalTable th.musselQualAbundanceCol,
          .musselModalTable td.musselQualAbundanceCol {
            min-width: 165px;
            width: 165px;
          }

          .musselModalTable th.musselNotesCol,
          .musselModalTable td.musselNotesCol {
            min-width: 240px;
          }

          .musselScientificNameInput {
            display: block;
            width: 100% !important;
            min-width: 320px !important;
            max-width: none !important;
            box-sizing: border-box;
            font-style: italic;
          }

          .musselSpeciesPickListCell {
            position: relative;
            width: 100%;
            min-width: 320px;
          }

          .musselSpeciesPickListDropdown {
            left: 0 !important;
            right: auto !important;
            width: 360px !important;
            min-width: 360px !important;
            max-width: 360px !important;
          }

          .musselSpeciesPickListOption {
            width: 100%;
          }

          .musselSpeciesPickListOption span {
            display: block;
            min-width: 0;
            overflow: visible;
            white-space: normal;
            text-overflow: clip;
            word-break: normal;
          }

          .musselSpeciesPickListHeader {
            white-space: normal;
          }
        `}</style>

        <header className="musselModalHeader">
          <div>
            <p className="musselModalKicker">
              Biological Observations
            </p>
            <h2>
              Mussels for Sample Group {activeRun + 1} · Subsample{" "}
              {activePass + 1}
            </h2>
            <p>
              Select the scientific name and enter the NAIADD
              specimen fields for each mussel observation.
            </p>
          </div>

          <button
            type="button"
            className="musselModalClose"
            onClick={onClose}
            aria-label="Close mussel entry modal"
          >
            ×
          </button>
        </header>

        <div className="musselModalToolbar">
          <label
            className={
              desktopEntryMode
                ? "toggleTile active"
                : "toggleTile"
            }
          >
            <input
              type="checkbox"
              checked={desktopEntryMode}
              onChange={(event) =>
                setDesktopEntryMode(event.target.checked)
              }
            />
            <span className="toggleTileIcon">↵</span>
            <span>
              <strong>Not Mobile</strong>
              <small>Enter/Tab cycles fields</small>
            </span>
          </label>

          <button
            type="button"
            className={
              showReorderFields
                ? "toggleTile active"
                : "toggleTile"
            }
            onClick={() =>
              setShowReorderFields((current) => !current)
            }
          >
            <span className="toggleTileIcon">↕</span>
            <span>
              <strong>Reorder Fields</strong>
              <small>Saved preference</small>
            </span>
          </button>
        </div>

        {showReorderFields && (
          <section className="musselReorderPanel">
            <div className="musselReorderHeader">
              <div>
                <strong>Field Order Preference</strong>
                <p>
                  Move fields into the order used during data
                  entry.
                </p>
              </div>

              <button
                type="button"
                className="musselSecondaryButton"
                onClick={() =>
                  setFieldOrder(defaultFieldOrder)
                }
              >
                Reset Order
              </button>
            </div>

            <div className="musselReorderList">
              {fieldOrder.map((field, index) => (
                <div
                  key={field}
                  className="musselReorderItem active"
                >
                  <span>{fieldLabels[field]}</span>

                  <div className="musselReorderButtons">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveField(field, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={
                        index === fieldOrder.length - 1
                      }
                      onClick={() => moveField(field, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="musselTableShell">
          <table className="musselModalTable">
            <thead>
              <tr>
                <th className="rowNumberCol">#</th>
                {fieldOrder.map((field) => (
                  <th key={field} className={fieldClassName(field)}>
                    {fieldLabels[field]}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <td className="rowNumberCol">
                    {rowIndex + 1}
                  </td>
                  {fieldOrder.map((field) => (
                    <td key={field} className={fieldClassName(field)}>
                      {renderCell(row, rowIndex, field)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="musselModalActions">
          <div className="musselRowToolsLeft">
            <button
              type="button"
              className="musselSecondaryButton"
              onClick={addNewMussel}
            >
              + New Mussel
            </button>
            <button
              type="button"
              className="musselSecondaryButton nextFishButton"
              onClick={addNextMussel}
            >
              + Next Mussel
            </button>
          </div>

          <div className="musselRowToolsCenter">
            <button
              type="button"
              className="musselSecondaryButton"
              onClick={() => addRows(50)}
            >
              + Add Rows
            </button>
          </div>

          <div className="musselActionRight">
            <button
              type="button"
              className="musselDangerButton"
              onClick={clearTable}
            >
              Clear Table
            </button>
            <button
              type="button"
              className="musselSaveButton"
              onClick={onSave}
            >
              Save
            </button>
            <button
              type="button"
              className="musselCloseButton"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ScientificNameCell({
  value,
  scientificNames,
  onChange,
  onCommit,
  onKeyDown,
  inputRef,
}: {
  value: string;
  scientificNames: string[];
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  inputRef?: (element: HTMLInputElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] =
    useState(0);
  const search = value.trim().toLowerCase();

  const matches = useMemo(() => {
    if (search.length < 2) return [];

    const startsWith = scientificNames.filter((name) =>
      name.toLowerCase().startsWith(search),
    );
    const contains = scientificNames.filter((name) => {
      const normalized = name.toLowerCase();
      return (
        normalized.includes(search) &&
        !normalized.startsWith(search)
      );
    });

    return [...startsWith, ...contains].slice(0, 12);
  }, [search, scientificNames]);

  function selectName(name: string) {
    onChange(name);
    onCommit(name);
    setOpen(false);
    setHighlightedIndex(0);
  }

  return (
    <div className="musselSpeciesPickListCell">
      <input
        ref={inputRef}
        className="musselScientificNameInput"
        value={value}
        placeholder="Type scientific name..."
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setOpen(true);
          setHighlightedIndex(0);
          onChange(event.target.value);
        }}
        onBlur={(event) => {
          window.setTimeout(() => setOpen(false), 120);
          onCommit(event.target.value);
        }}
        onKeyDown={(event) => {
          if (
            open &&
            matches.length > 0 &&
            event.key === "ArrowDown"
          ) {
            event.preventDefault();
            setHighlightedIndex((current) =>
              Math.min(current + 1, matches.length - 1),
            );
            return;
          }

          if (
            open &&
            matches.length > 0 &&
            event.key === "ArrowUp"
          ) {
            event.preventDefault();
            setHighlightedIndex((current) =>
              Math.max(current - 1, 0),
            );
            return;
          }

          if (
            open &&
            matches.length > 0 &&
            event.key === "Enter"
          ) {
            event.preventDefault();
            selectName(
              matches[highlightedIndex] || matches[0],
            );
            return;
          }

          onKeyDown?.(event);
        }}
      />

      {open && search.length >= 2 && (
        <div className="musselSpeciesPickListDropdown">
          {matches.length > 0 ? (
            <>
              <div className="musselSpeciesPickListHeader">
                Matching mollusk scientific names
              </div>
              {matches.map((name, index) => (
                <button
                  key={name}
                  type="button"
                  className={
                    index === highlightedIndex
                      ? "musselSpeciesPickListOption active"
                      : "musselSpeciesPickListOption"
                  }
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectName(name);
                  }}
                >
                  <span>
                    <em>{name}</em>
                  </span>
                  <small>Select</small>
                </button>
              ))}
            </>
          ) : (
            <div className="musselSpeciesPickListEmpty">
              No matching scientific name. Custom text is
              still allowed.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SelectCell({
  value,
  options,
  onChange,
  onKeyDown,
  inputRef,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLSelectElement>;
  inputRef?: (element: HTMLSelectElement | null) => void;
}) {
  return (
    <select
      ref={inputRef}
      value={value}
      onKeyDown={onKeyDown}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option
          key={option || "blank-option"}
          value={option}
        >
          {option}
        </option>
      ))}
    </select>
  );
}
