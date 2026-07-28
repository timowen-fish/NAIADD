import type { ChangeEvent } from "react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Card,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from "../../components/ui";
import {
  loadBundledReferenceData,
  loadReferenceData,
  makeSpeciesId,
  normalizeSpecies,
  replaceReferenceData,
} from "../../services/referenceDataService";
import type {
  FishSpecies,
  GeneralReferenceData,
  ReferenceDataChangeSummary,
  ReferenceDataSnapshot,
} from "../../types/referenceData";
import "./ReferenceDataManager.css";

type ReferenceDataManagerProps = {
  onBack: () => void;
};

type SelectedSection =
  | { type: "general"; key: string }
  | { type: "species" };

type Toast = {
  tone: "success" | "danger" | "info";
  message: string;
};

const EMPTY_SNAPSHOT: ReferenceDataSnapshot = {
  generalLists: {},
  species: [],
};

function cloneSnapshot(
  snapshot: ReferenceDataSnapshot,
): ReferenceDataSnapshot {
  return {
    generalLists: Object.fromEntries(
      Object.entries(snapshot.generalLists).map(([key, values]) => [
        key,
        [...values],
      ]),
    ),
    species: snapshot.species.map((species) => ({ ...species })),
  };
}

function stableSnapshot(snapshot: ReferenceDataSnapshot): string {
  const normalizedLists = Object.fromEntries(
    Object.entries(snapshot.generalLists)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => [
        key,
        [...values].sort((left, right) => left.localeCompare(right)),
      ]),
  );

  const normalizedSpecies = [...snapshot.species]
    .map(({ id, BOVA, CommonName, ScientificName }) => ({
      id,
      BOVA,
      CommonName,
      ScientificName,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return JSON.stringify({
    generalLists: normalizedLists,
    species: normalizedSpecies,
  });
}

function calculateChanges(
  baseline: ReferenceDataSnapshot,
  current: ReferenceDataSnapshot,
): ReferenceDataChangeSummary {
  let added = 0;
  let modified = 0;
  let deleted = 0;

  const baselineLists = baseline.generalLists;
  const currentLists = current.generalLists;
  const listKeys = new Set([
    ...Object.keys(baselineLists),
    ...Object.keys(currentLists),
  ]);

  listKeys.forEach((key) => {
    const oldValues = new Set(baselineLists[key] ?? []);
    const newValues = new Set(currentLists[key] ?? []);

    newValues.forEach((value) => {
      if (!oldValues.has(value)) {
        added += 1;
      }
    });

    oldValues.forEach((value) => {
      if (!newValues.has(value)) {
        deleted += 1;
      }
    });
  });

  const baselineSpecies = new Map(
    baseline.species.map((species) => [species.id, species]),
  );
  const currentSpecies = new Map(
    current.species.map((species) => [species.id, species]),
  );

  currentSpecies.forEach((species, id) => {
    const original = baselineSpecies.get(id);

    if (!original) {
      added += 1;
      return;
    }

    if (
      original.BOVA !== species.BOVA ||
      original.CommonName !== species.CommonName ||
      original.ScientificName !== species.ScientificName
    ) {
      modified += 1;
    }
  });

  baselineSpecies.forEach((_species, id) => {
    if (!currentSpecies.has(id)) {
      deleted += 1;
    }
  });

  return { added, modified, deleted };
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

export default function ReferenceDataManager({
  onBack,
}: ReferenceDataManagerProps) {
  const [baseline, setBaseline] =
    useState<ReferenceDataSnapshot>(EMPTY_SNAPSHOT);
  const [draft, setDraft] =
    useState<ReferenceDataSnapshot>(EMPTY_SNAPSHOT);
  const [selected, setSelected] =
    useState<SelectedSection>({ type: "species" });
  const [search, setSearch] = useState("");
  const [newValue, setNewValue] = useState("");
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [editingReplacement, setEditingReplacement] = useState("");
  const [speciesEditor, setSpeciesEditor] = useState<FishSpecies | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const generalKeys = useMemo(
    () =>
      Object.keys(draft.generalLists).sort((left, right) =>
        left.localeCompare(right),
      ),
    [draft.generalLists],
  );

  const dirty = useMemo(
    () => stableSnapshot(baseline) !== stableSnapshot(draft),
    [baseline, draft],
  );

  const changes = useMemo(
    () => calculateChanges(baseline, draft),
    [baseline, draft],
  );

  const selectedListValues = useMemo(() => {
    if (selected.type !== "general") {
      return [];
    }

    return draft.generalLists[selected.key] ?? [];
  }, [draft.generalLists, selected]);

  const filteredValues = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return selectedListValues;
    }

    return selectedListValues.filter((value) =>
      value.toLowerCase().includes(query),
    );
  }, [search, selectedListValues]);

  const filteredSpecies = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return draft.species;
    }

    return draft.species.filter((species) =>
      [species.BOVA, species.CommonName, species.ScientificName].some(
        (value) => value.toLowerCase().includes(query),
      ),
    );
  }, [draft.species, search]);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () =>
      window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  async function refresh(): Promise<void> {
    setLoading(true);

    try {
      const loaded = await loadReferenceData();
      setBaseline(cloneSnapshot(loaded));
      setDraft(cloneSnapshot(loaded));

      if (
        selected.type === "general" &&
        !loaded.generalLists[selected.key]
      ) {
        setSelected({ type: "species" });
      }
    } catch (error) {
      setToast({
        tone: "danger",
        message:
          error instanceof Error
            ? error.message
            : "Reference data could not be loaded.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function initializeBundled(): Promise<void> {
    if (
      dirty &&
      !window.confirm(
        "This will replace your current unsaved edits with the bundled JSON data. Continue?",
      )
    ) {
      return;
    }

    setLoading(true);

    try {
      const loaded = await loadBundledReferenceData();
      setDraft(cloneSnapshot(loaded));
      setSearch("");
      setSelected({ type: "species" });
      setToast({
        tone: "info",
        message:
          "Bundled JSON loaded locally. Review it, then press Save All Changes to publish it.",
      });
    } catch (error) {
      setToast({
        tone: "danger",
        message:
          error instanceof Error
            ? error.message
            : "Bundled reference data could not be loaded.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function saveAll(): Promise<void> {
    if (!dirty) {
      return;
    }

    setSaving(true);

    try {
      await replaceReferenceData(draft);
      const saved = cloneSnapshot(draft);
      setBaseline(saved);
      setDraft(cloneSnapshot(saved));
      setToast({
        tone: "success",
        message: "Reference data was saved successfully.",
      });
    } catch (error) {
      setToast({
        tone: "danger",
        message:
          error instanceof Error
            ? error.message
            : "Reference data could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  function discardChanges(): void {
    if (
      dirty &&
      !window.confirm("Discard all unsaved reference-data changes?")
    ) {
      return;
    }

    setDraft(cloneSnapshot(baseline));
    setSearch("");
    setEditingValue(null);
    setSpeciesEditor(null);
  }

  function handleBack(): void {
    if (
      dirty &&
      !window.confirm(
        "You have unsaved reference-data changes. Leave without saving?",
      )
    ) {
      return;
    }

    onBack();
  }

  function addGeneralValue(): void {
    if (selected.type !== "general") {
      return;
    }

    const value = newValue.trim();

    if (!value) {
      return;
    }

    const existing = draft.generalLists[selected.key] ?? [];

    if (
      existing.some(
        (entry) => entry.toLowerCase() === value.toLowerCase(),
      )
    ) {
      setToast({
        tone: "danger",
        message: `"${value}" already exists in ${selected.key}.`,
      });
      return;
    }

    setDraft((current) => ({
      ...current,
      generalLists: {
        ...current.generalLists,
        [selected.key]: [...existing, value].sort((left, right) =>
          left.localeCompare(right),
        ),
      },
    }));
    setNewValue("");
  }

  function updateGeneralValue(original: string): void {
    if (selected.type !== "general") {
      return;
    }

    const replacement = editingReplacement.trim();

    if (!replacement) {
      return;
    }

    const existing = draft.generalLists[selected.key] ?? [];

    if (
      existing.some(
        (entry) =>
          entry !== original &&
          entry.toLowerCase() === replacement.toLowerCase(),
      )
    ) {
      setToast({
        tone: "danger",
        message: `"${replacement}" already exists in ${selected.key}.`,
      });
      return;
    }

    setDraft((current) => ({
      ...current,
      generalLists: {
        ...current.generalLists,
        [selected.key]: existing
          .map((entry) => (entry === original ? replacement : entry))
          .sort((left, right) => left.localeCompare(right)),
      },
    }));
    setEditingValue(null);
    setEditingReplacement("");
  }

  function deleteGeneralValue(value: string): void {
    if (
      selected.type !== "general" ||
      !window.confirm(`Delete "${value}" from ${selected.key}?`)
    ) {
      return;
    }

    setDraft((current) => ({
      ...current,
      generalLists: {
        ...current.generalLists,
        [selected.key]: (
          current.generalLists[selected.key] ?? []
        ).filter((entry) => entry !== value),
      },
    }));
  }

  function saveSpeciesEditor(): void {
    if (!speciesEditor) {
      return;
    }

    const cleaned: FishSpecies = {
      ...speciesEditor,
      BOVA: speciesEditor.BOVA.trim(),
      CommonName: speciesEditor.CommonName.trim(),
      ScientificName: speciesEditor.ScientificName.trim(),
    };

    if (!cleaned.CommonName || !cleaned.ScientificName) {
      setToast({
        tone: "danger",
        message: "Common name and scientific name are required.",
      });
      return;
    }

    if (!cleaned.id) {
      cleaned.id = makeSpeciesId(cleaned);
    }

    setDraft((current) => {
      const exists = current.species.some(
        (species) => species.id === cleaned.id,
      );

      const nextSpecies = exists
        ? current.species.map((species) =>
            species.id === cleaned.id ? cleaned : species,
          )
        : [...current.species, cleaned];

      return {
        ...current,
        species: nextSpecies.sort((left, right) =>
          left.CommonName.localeCompare(right.CommonName),
        ),
      };
    });

    setSpeciesEditor(null);
  }

  function deleteSpecies(species: FishSpecies): void {
    if (!window.confirm(`Delete ${species.CommonName}?`)) {
      return;
    }

    setDraft((current) => ({
      ...current,
      species: current.species.filter(
        (entry) => entry.id !== species.id,
      ),
    }));
  }

  async function importJson(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;

      if (Array.isArray(parsed)) {
        const importedSpecies = normalizeSpecies(
          parsed as Array<Record<string, unknown>>,
        );

        setDraft((current) => ({
          ...current,
          species: importedSpecies,
        }));
        setSelected({ type: "species" });
      } else if (parsed && typeof parsed === "object") {
        const object = parsed as Record<string, unknown>;

        if (
          "generalLists" in object &&
          "species" in object
        ) {
          const snapshot = object as unknown as ReferenceDataSnapshot;

          setDraft({
            generalLists: snapshot.generalLists ?? {},
            species: normalizeSpecies(
              (snapshot.species ?? []) as unknown as Array<
                Record<string, unknown>
              >,
            ),
          });
        } else {
          const generalLists: GeneralReferenceData = {};

          Object.entries(object).forEach(([key, value]) => {
            if (Array.isArray(value)) {
              generalLists[key] = Array.from(
                new Set(
                  value
                    .filter(
                      (entry): entry is string =>
                        typeof entry === "string",
                    )
                    .map((entry) => entry.trim())
                    .filter(Boolean),
                ),
              ).sort((left, right) => left.localeCompare(right));
            }
          });

          setDraft((current) => ({
            ...current,
            generalLists,
          }));

          const firstKey = Object.keys(generalLists)[0];
          if (firstKey) {
            setSelected({ type: "general", key: firstKey });
          }
        }
      } else {
        throw new Error("The selected file is not a supported JSON format.");
      }

      setToast({
        tone: "info",
        message:
          "JSON imported locally. Press Save All Changes to publish it.",
      });
    } catch (error) {
      setToast({
        tone: "danger",
        message:
          error instanceof Error
            ? error.message
            : "The JSON file could not be imported.",
      });
    }
  }

  if (loading) {
    return (
      <div className="reference-data-page">
        <Card className="reference-loading-card">
          Loading reference data…
        </Card>
      </div>
    );
  }

  const selectedTitle =
    selected.type === "species" ? "Species Catalog" : selected.key;

  return (
    <div className="reference-data-page">
      <PageHeader
        eyebrow="VADMA Administration"
        title="Reference Data"
        description="Maintain controlled lists and the fish species catalog used throughout the application."
        actions={
          <div className="reference-header-actions">
            <SecondaryButton onClick={handleBack}>
              ← Administration
            </SecondaryButton>
            <SecondaryButton onClick={discardChanges} disabled={!dirty}>
              Discard
            </SecondaryButton>
            <PrimaryButton
              onClick={() => void saveAll()}
              loading={saving}
              disabled={!dirty}
            >
              Save All Changes
            </PrimaryButton>
          </div>
        }
      />

      {toast && (
        <div className={`reference-toast ${toast.tone}`}>
          {toast.message}
        </div>
      )}

      <div className="reference-summary-row">
        <Card className="reference-summary-card">
          <span>General lists</span>
          <strong>{generalKeys.length}</strong>
        </Card>
        <Card className="reference-summary-card">
          <span>Species</span>
          <strong>{draft.species.length}</strong>
        </Card>
        <Card className="reference-summary-card change-card">
          <span>Unsaved changes</span>
          <div>
            <StatusBadge tone="success">+ {changes.added}</StatusBadge>
            <StatusBadge tone="info">✎ {changes.modified}</StatusBadge>
            <StatusBadge tone="danger">− {changes.deleted}</StatusBadge>
          </div>
        </Card>
      </div>

      <div className="reference-workspace">
        <Card className="reference-sidebar">
          <div className="reference-sidebar-heading">
            <div>
              <strong>Reference Data</strong>
              <span>Select a section</span>
            </div>
          </div>

          <button
            type="button"
            className={
              selected.type === "species"
                ? "reference-nav-item active"
                : "reference-nav-item"
            }
            onClick={() => {
              setSelected({ type: "species" });
              setSearch("");
            }}
          >
            <span>🐟</span>
            <span>
              <strong>Species Catalog</strong>
              <small>{draft.species.length} records</small>
            </span>
          </button>

          <div className="reference-nav-label">General lists</div>

          <div className="reference-nav-scroll">
            {generalKeys.map((key) => (
              <button
                key={key}
                type="button"
                className={
                  selected.type === "general" &&
                  selected.key === key
                    ? "reference-nav-item active"
                    : "reference-nav-item"
                }
                onClick={() => {
                  setSelected({ type: "general", key });
                  setSearch("");
                  setNewValue("");
                  setEditingValue(null);
                }}
              >
                <span>›</span>
                <span>
                  <strong>{key}</strong>
                  <small>
                    {draft.generalLists[key]?.length ?? 0} values
                  </small>
                </span>
              </button>
            ))}
          </div>

          <div className="reference-file-actions">
            <SecondaryButton onClick={() => void initializeBundled()}>
              Load Bundled Defaults
            </SecondaryButton>
            <SecondaryButton
              onClick={() => importInputRef.current?.click()}
            >
              Import JSON
            </SecondaryButton>
            <SecondaryButton
              onClick={() =>
                downloadJson("reference_data.json", draft)
              }
            >
              Export All
            </SecondaryButton>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => void importJson(event)}
            />
          </div>
        </Card>

        <Card className="reference-editor-card">
          <div className="reference-editor-header">
            <div>
              <p className="reference-editor-eyebrow">
                {selected.type === "species"
                  ? "Relational catalog"
                  : "Controlled list"}
              </p>
              <h2>{selectedTitle}</h2>
            </div>

            <div className="reference-editor-tools">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  selected.type === "species"
                    ? "Search BOVA, common, or scientific name…"
                    : `Search ${selectedTitle}…`
                }
                aria-label={`Search ${selectedTitle}`}
              />

              {selected.type === "species" && (
                <>
                  <SecondaryButton
                    onClick={() =>
                      downloadJson(
                        "fish_species.json",
                        draft.species.map(
                          ({
                            BOVA,
                            CommonName,
                            ScientificName,
                          }) => ({
                            BOVA,
                            CommonName,
                            ScientificName,
                          }),
                        ),
                      )
                    }
                  >
                    Export Species
                  </SecondaryButton>
                  <PrimaryButton
                    onClick={() =>
                      setSpeciesEditor({
                        id: "",
                        BOVA: "",
                        CommonName: "",
                        ScientificName: "",
                      })
                    }
                  >
                    + Add Species
                  </PrimaryButton>
                </>
              )}
            </div>
          </div>

          {selected.type === "general" ? (
            <>
              <div className="reference-add-row">
                <input
                  value={newValue}
                  onChange={(event) => setNewValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      addGeneralValue();
                    }
                  }}
                  placeholder={`Add a value to ${selected.key}`}
                />
                <PrimaryButton onClick={addGeneralValue}>
                  + Add Value
                </PrimaryButton>
              </div>

              <div className="reference-list">
                {filteredValues.map((value) => (
                  <div className="reference-list-row" key={value}>
                    {editingValue === value ? (
                      <>
                        <input
                          autoFocus
                          value={editingReplacement}
                          onChange={(event) =>
                            setEditingReplacement(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              updateGeneralValue(value);
                            }
                            if (event.key === "Escape") {
                              setEditingValue(null);
                            }
                          }}
                        />
                        <div className="reference-row-actions">
                          <button
                            type="button"
                            onClick={() => updateGeneralValue(value)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingValue(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span>{value}</span>
                        <div className="reference-row-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingValue(value);
                              setEditingReplacement(value);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => deleteGeneralValue(value)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {filteredValues.length === 0 && (
                  <div className="reference-empty">
                    No matching values found.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="reference-table-wrap">
              <table className="reference-species-table">
                <thead>
                  <tr>
                    <th>BOVA</th>
                    <th>Common Name</th>
                    <th>Scientific Name</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filteredSpecies.map((species) => (
                    <tr key={species.id}>
                      <td>{species.BOVA || "—"}</td>
                      <td>{species.CommonName}</td>
                      <td>
                        <em>{species.ScientificName}</em>
                      </td>
                      <td>
                        <div className="reference-row-actions">
                          <button
                            type="button"
                            onClick={() =>
                              setSpeciesEditor({ ...species })
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => deleteSpecies(species)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredSpecies.length === 0 && (
                <div className="reference-empty">
                  No matching species found.
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {speciesEditor && (
        <div
          className="reference-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSpeciesEditor(null);
            }
          }}
        >
          <div
            className="reference-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="species-editor-title"
          >
            <div className="reference-modal-header">
              <div>
                <p>Species Catalog</p>
                <h2 id="species-editor-title">
                  {speciesEditor.id ? "Edit Species" : "Add Species"}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSpeciesEditor(null)}
              >
                ×
              </button>
            </div>

            <label>
              <span>BOVA</span>
              <input
                value={speciesEditor.BOVA}
                onChange={(event) =>
                  setSpeciesEditor((current) =>
                    current
                      ? { ...current, BOVA: event.target.value }
                      : current,
                  )
                }
              />
            </label>

            <label>
              <span>Common Name</span>
              <input
                value={speciesEditor.CommonName}
                onChange={(event) =>
                  setSpeciesEditor((current) =>
                    current
                      ? {
                          ...current,
                          CommonName: event.target.value,
                        }
                      : current,
                  )
                }
              />
            </label>

            <label>
              <span>Scientific Name</span>
              <input
                value={speciesEditor.ScientificName}
                onChange={(event) =>
                  setSpeciesEditor((current) =>
                    current
                      ? {
                          ...current,
                          ScientificName: event.target.value,
                        }
                      : current,
                  )
                }
              />
            </label>

            <div className="reference-modal-actions">
              <SecondaryButton
                onClick={() => setSpeciesEditor(null)}
              >
                Cancel
              </SecondaryButton>
              <PrimaryButton onClick={saveSpeciesEditor}>
                Save Species
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
