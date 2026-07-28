import { useEffect, useMemo, useState } from "react";
import FishEntryCMTallyModal, { type FishRow } from "./FishEntryCMTallyModal";
import type { FishObservationTable } from "./SpecimenStandardStep";
import "../../styles/SpecimenCMTallyStep.css";

type LengthType = "Fork Length" | "Total Length";
type LengthUnit = "Centimeter Class";

type PassData = {
  effort: number | null;
  fish: FishRow[];
};

type RunData = {
  customRunName: string;
  passes: PassData[];
};

type Props = {
  siteID?: string;
  onBack: () => void;
  onContinueToSaveDraft?: (rows: FishObservationTable[]) => void;
  draftFishRows?: FishObservationTable[];
};

type FinalRow = FishRow & {
  CustomRunName: string;
  RunN: number;
  Run_Number: number;
  RunEffort: number | null;
  SamplePass: number;
  LengthType: LengthType;
  LengthUnit: LengthUnit;
};

type OptionalColumn = {
  key: keyof FishRow;
  label: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function passHasData(pass: PassData) {
  return pass.fish.some((fish) => fish.CommonName.trim() !== "");
}

function optionalValuePresent(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function fishHasOptionalData(row: FishRow, field: keyof FishRow) {
  return optionalValuePresent(row[field]);
}

function displayValue(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function normalizeLengthType(value: unknown): LengthType {
  if (value === "Fork Length") return "Fork Length";
  return "Total Length";
}

function draftRowToFishRow(row: FishObservationTable): FishRow {
  return {
    CommonName: row.CommonName || "",
    ScientificName: row.ScientificName || "",
    Quantity: row.Quantity ?? null,
    Length: row.Length ?? null,
    LengthType: normalizeLengthType((row as any).LengthType),
    LengthUnit: "Centimeter Class",
    Weight: row.Weight ?? null,
    Sex: row.Sex || "",
    Anomaly: row.Anomaly || "",
    Condition: row.Condition || "",
    Maturity: row.Maturity || "",
    WildPropagated: row.WildPropagated || "",
    Disposition: row.Disposition || "",
    MinLength: row.MinLength ?? null,
    MaxLength: row.MaxLength ?? null,
    MinWeight: row.MinWeight ?? null,
    MaxWeight: row.MaxWeight ?? null,
    TotalWeight: row.TotalWeight ?? null,
    PrimaryTagType: row.PrimaryTagType || "",
    PrimaryTagNumber: row.PrimaryTagNumber || "",
    Tag1MarkRecap: row.Tag1MarkRecap || "",
    SecondaryTagType: row.SecondaryTagType || "",
    SecondaryTagNumber: row.SecondaryTagNumber || "",
    Tag2MarkRecap: row.Tag2MarkRecap || "",
    TissueSampleID: row.TissueSampleID || "",
    TissueResults: row.TissueResults || "",
    OtolithID: row.OtolithID || "",
    OtolithAgeResults: row.OtolithAgeResults ?? null,
    Comments:
      typeof (row as any).SpecimenComments === "string"
        ? (row as any).SpecimenComments
        : typeof row.Comments === "string"
          ? row.Comments
          : "",
  };
}

function hydrateRunsFromDraftRows(rows: FishObservationTable[]): RunData[] {
  const usableRows = rows.filter(
    (row) => row.CommonName && row.CommonName !== "NoFish",
  );

  if (usableRows.length === 0) {
    return [
      {
        customRunName: "1",
        passes: [{ effort: null, fish: [] }],
      },
    ];
  }

  const runMap = new Map<string, Map<number, { effort: number | null; fish: FishRow[] }>>();

  usableRows.forEach((row) => {
    const runName = String(row.CustomRunName || "1");
    const passNumber = Number(row.SamplePass || 1);

    if (!runMap.has(runName)) {
      runMap.set(runName, new Map());
    }

    const passMap = runMap.get(runName)!;

    if (!passMap.has(passNumber)) {
      passMap.set(passNumber, {
        effort:
          typeof (row as any).RunEffort === "number" && Number.isFinite((row as any).RunEffort)
            ? (row as any).RunEffort
            : null,
        fish: [],
      });
    }

    passMap.get(passNumber)!.fish.push(draftRowToFishRow(row));
  });

  return Array.from(runMap.entries()).map(([customRunName, passMap]) => {
    const maxPass = Math.max(...Array.from(passMap.keys()), 1);

    return {
      customRunName,
      passes: Array.from({ length: maxPass }, (_, index) => ({
        effort: passMap.get(index + 1)?.effort ?? null,
        fish: passMap.get(index + 1)?.fish || [],
      })),
    };
  });
}

const allOptionalColumns: OptionalColumn[] = [
  { key: "Sex", label: "Sex" },
  { key: "Anomaly", label: "Anomaly" },
  { key: "Condition", label: "Condition" },
  { key: "Maturity", label: "Maturity" },
  { key: "WildPropagated", label: "WildPropagated" },
  { key: "Disposition", label: "Disposition" },
  { key: "MinLength", label: "MinLength" },
  { key: "MaxLength", label: "MaxLength" },
  { key: "MinWeight", label: "MinWeight" },
  { key: "MaxWeight", label: "MaxWeight" },
  { key: "TotalWeight", label: "TotalWeight" },
  { key: "PrimaryTagType", label: "PrimaryTagType" },
  { key: "PrimaryTagNumber", label: "PrimaryTagNumber" },
  { key: "Tag1MarkRecap", label: "Tag1MarkRecap" },
  { key: "SecondaryTagType", label: "SecondaryTagType" },
  { key: "SecondaryTagNumber", label: "SecondaryTagNumber" },
  { key: "Tag2MarkRecap", label: "Tag2MarkRecap" },
  { key: "TissueSampleID", label: "TissueSampleID" },
  { key: "TissueResults", label: "TissueResults" },
  { key: "OtolithID", label: "OtolithID" },
  { key: "OtolithAgeResults", label: "OtolithAgeResults" },
  { key: "Comments", label: "Comments" },
];

export default function SpecimenCMTallyStep({
  siteID,
  onBack,
  onContinueToSaveDraft,
  draftFishRows = [],
}: Props) {
  const [runsCount, setRunsCount] = useState(1);
  const [passesCount, setPassesCount] = useState(1);

  const [lengthType, setLengthType] = useState<LengthType>("Total Length");
  const [lengthUnit] = useState<LengthUnit>("Centimeter Class");

  const [runs, setRuns] = useState<RunData[]>([
    {
      customRunName: "1",
      passes: [{ effort: null, fish: [] }],
    },
  ]);

  const [modalOpen, setModalOpen] = useState(false);
  const [activeRun, setActiveRun] = useState(0);
  const [activePass, setActivePass] = useState(0);
  const [modalRows, setModalRows] = useState<FishRow[]>([]);

  useEffect(() => {
    if (!draftFishRows || draftFishRows.length === 0) return;

    const hydratedRuns = hydrateRunsFromDraftRows(draftFishRows);
    const firstRealDraftRow = draftFishRows.find(
      (row) => row.CommonName && row.CommonName !== "NoFish",
    );

    setRuns(hydratedRuns);
    setRunsCount(hydratedRuns.length);
    setPassesCount(Math.max(...hydratedRuns.map((run) => run.passes.length), 1));

    if (firstRealDraftRow) {
      setLengthType(normalizeLengthType((firstRealDraftRow as any).LengthType));
    }
  }, [draftFishRows]);

  function reductionWouldClearData(newRuns: number, newPasses: number) {
    return runs.some((run, runIndex) => {
      if (runIndex >= newRuns) {
        return run.passes.some(passHasData);
      }

      return run.passes.some((pass, passIndex) => {
        return passIndex >= newPasses && passHasData(pass);
      });
    });
  }

  function syncStructure(newRuns: number, newPasses: number) {
    const safeRuns = clamp(newRuns, 1, 20);
    const safePasses = clamp(newPasses, 1, 20);

    if (
      (safeRuns < runsCount || safePasses < passesCount) &&
      reductionWouldClearData(safeRuns, safePasses)
    ) {
      const confirmed = window.confirm(
        "Are you sure? Reducing the number of runs or passes will clear fish data from removed tables.",
      );

      if (!confirmed) return false;
    }

    setRuns((previousRuns) => {
      const updated = previousRuns.map((run) => ({
        ...run,
        passes: run.passes.map((pass) => ({
          ...pass,
          fish: pass.fish.map((fish) => ({ ...fish })),
        })),
      }));

      while (updated.length < safeRuns) {
        updated.push({
          customRunName: String(updated.length + 1),
          passes: Array.from({ length: safePasses }, () => ({
            effort: null,
            fish: [],
          })),
        });
      }

      updated.length = safeRuns;

      updated.forEach((run) => {
        while (run.passes.length < safePasses) {
          run.passes.push({ effort: null, fish: [] });
        }

        run.passes.length = safePasses;
      });

      return updated;
    });

    setRunsCount(safeRuns);
    setPassesCount(safePasses);

    return true;
  }

  function changeRuns(delta: number) {
    const next = clamp(runsCount + delta, 1, 20);
    syncStructure(next, passesCount);
  }

  function changePasses(delta: number) {
    const next = clamp(passesCount + delta, 1, 20);
    syncStructure(runsCount, next);
  }

  function openModal(runIndex: number, passIndex: number) {
    const existing = runs[runIndex]?.passes[passIndex]?.fish || [];

    setActiveRun(runIndex);
    setActivePass(passIndex);

    setModalRows(
      existing.length > 0
        ? existing.map((row) => ({
            ...row,
            LengthType: lengthType,
            LengthUnit: lengthUnit,
          }))
        : [],
    );

    setModalOpen(true);
  }

  function saveModal() {
    setRuns((previousRuns) => {
      const cleaned = modalRows.filter((row) => row.CommonName.trim() !== "");

      return previousRuns.map((run, runIndex) => {
        if (runIndex !== activeRun) return run;

        return {
          ...run,
          passes: run.passes.map((pass, passIndex) =>
            passIndex === activePass
              ? {
                  ...pass,
                  fish: cleaned.map((fish) => ({
                    ...fish,
                    LengthType: lengthType,
                    LengthUnit: lengthUnit,
                  })),
                }
              : pass,
          ),
        };
      });
    });

    setModalOpen(false);
  }

  const finalRows: FinalRow[] = useMemo(() => {
    const rows: FinalRow[] = [];

    runs.forEach((run, runIndex) => {
      run.passes.forEach((pass, passIndex) => {
        if (pass.fish.length === 0) {
          rows.push({
            CustomRunName: run.customRunName,
            RunN: runIndex + 1,
            Run_Number: runIndex + 1,
            RunEffort: pass.effort,
            SamplePass: passIndex + 1,
            CommonName: "NoFish",
            ScientificName: "",
            Quantity: 0,
            Length: null,
            Weight: null,
            LengthType: lengthType,
            LengthUnit: lengthUnit,
          });
        } else {
          pass.fish.forEach((fish) => {
            rows.push({
              CustomRunName: run.customRunName,
              RunN: runIndex + 1,
              Run_Number: runIndex + 1,
              RunEffort: pass.effort,
              SamplePass: passIndex + 1,
              ...fish,
              LengthType: lengthType,
              LengthUnit: lengthUnit,
            });
          });
        }
      });
    });

    return rows;
  }, [runs, lengthType, lengthUnit]);

  const fishObservationTable: FishObservationTable[] = useMemo(() => {
    return finalRows.map(
      (row) =>
        ({
          SiteID: siteID,
          CustomRunName: row.CustomRunName,
          RunN: row.RunN,
          Run_Number: row.Run_Number,
          RunEffort: row.RunEffort,
          SamplePass: row.SamplePass,
          CommonName: row.CommonName,
          ScientificName: row.ScientificName || "",
          Quantity: row.Quantity ?? null,
          Length: row.Length ?? null,
          LengthType: row.LengthType,
          LengthUnit: row.LengthUnit,
          Weight: row.Weight ?? null,
          Sex: row.Sex || "",
          Anomaly: row.Anomaly || "",
          Condition: row.Condition || "",
          Maturity: row.Maturity || "",
          WildPropagated: row.WildPropagated || "",
          Disposition: row.Disposition || "",
          MinLength: row.MinLength ?? null,
          MaxLength: row.MaxLength ?? null,
          MinWeight: row.MinWeight ?? null,
          MaxWeight: row.MaxWeight ?? null,
          TotalWeight: row.TotalWeight ?? null,
          PrimaryTagType: row.PrimaryTagType || "",
          PrimaryTagNumber: row.PrimaryTagNumber || "",
          Tag1MarkRecap: row.Tag1MarkRecap || "",
          SecondaryTagType: row.SecondaryTagType || "",
          SecondaryTagNumber: row.SecondaryTagNumber || "",
          Tag2MarkRecap: row.Tag2MarkRecap || "",
          TissueSampleID: row.TissueSampleID || "",
          TissueResults: row.TissueResults || "",
          OtolithID: row.OtolithID || "",
          OtolithAgeResults: row.OtolithAgeResults ?? null,
          SpecimenComments: row.Comments || "",
        }) as FishObservationTable & {
          LengthType: LengthType;
          LengthUnit: LengthUnit;
        },
    );
  }, [finalRows, siteID]);

  const realFishRows = finalRows.filter(
    (row) => row.CommonName && row.CommonName !== "NoFish",
  );

  const speciesSummary = useMemo(() => {
    const summary: Record<string, number> = {};

    realFishRows.forEach((row) => {
      const name = row.CommonName;
      const quantity = Number(row.Quantity ?? 0);

      summary[name] = (summary[name] || 0) + quantity;
    });

    return Object.entries(summary)
      .map(([CommonName, Quantity]) => ({
        CommonName,
        Quantity,
      }))
      .sort((a, b) => b.Quantity - a.Quantity);
  }, [realFishRows]);

  const largestSpecimen = useMemo(() => {
    const withLengths = realFishRows.filter(
      (row) => typeof row.Length === "number",
    );

    if (withLengths.length === 0) return null;

    return withLengths.reduce((largest, row) =>
      Number(row.Length) > Number(largest.Length) ? row : largest,
    );
  }, [realFishRows]);

  const smallestSpecimen = useMemo(() => {
    const withLengths = realFishRows.filter(
      (row) => typeof row.Length === "number",
    );

    if (withLengths.length === 0) return null;

    return withLengths.reduce((smallest, row) =>
      Number(row.Length) < Number(smallest.Length) ? row : smallest,
    );
  }, [realFishRows]);

  const optionalColumns = useMemo(() => {
    return allOptionalColumns.filter((column) =>
      finalRows.some((row) => fishHasOptionalData(row, column.key)),
    );
  }, [finalRows]);

  return (
    <main className="app specimenCMTallyStep">
      <button className="backButton" onClick={onBack}>
        ← Back
      </button>

      <section className="standardHero">
        <div className="standardHeroIcon">📏</div>

        <div className="standardHeroText">
          <p className="stepKicker">Step 3 — Biological Observations</p>
          <h1>Species Data — Centimeter Tally</h1>
          <p>Enter centimeter tally observations by run and pass.</p>
        </div>
      </section>

      <section className="sampleControlCard">
        {draftFishRows.length > 0 && (
          <div
            style={{
              marginBottom: "14px",
              padding: "14px",
              borderRadius: "16px",
              background:
                "linear-gradient(135deg, rgba(255,159,67,0.16), rgba(255,210,154,0.08))",
              border: "1px solid rgba(255,210,154,0.22)",
              color: "#ffd29a",
              fontWeight: 800,
              fontSize: "13px",
            }}
          >
            Existing fish observations were imported from the active draft.
            Opening a pass below will load those saved fish into the centimeter
            tally modal.
          </div>
        )}

        <div className="sampleControlHeader">
          <h2>Sample Details</h2>
          <p>
            Set the number of runs, passes, and centimeter tally measurement
            details for this survey event.
          </p>
        </div>

        <div className="counterGrid">
          <div className="counterBox">
            <span>Number of Runs</span>

            <div className="counterControls">
              <button type="button" onClick={() => changeRuns(-1)}>
                ↓
              </button>

              <strong>{runsCount}</strong>

              <button type="button" onClick={() => changeRuns(1)}>
                ↑
              </button>
            </div>
          </div>

          <div className="counterBox">
            <span>Number of Passes</span>

            <div className="counterControls">
              <button type="button" onClick={() => changePasses(-1)}>
                ↓
              </button>

              <strong>{passesCount}</strong>

              <button type="button" onClick={() => changePasses(1)}>
                ↑
              </button>
            </div>
          </div>

          <label className="counterBox">
            <span>Length Type</span>

            <select
              className="input"
              value={lengthType}
              onChange={(event) =>
                setLengthType(event.target.value as LengthType)
              }
            >
              <option value="Total Length">Total Length</option>
              <option value="Fork Length">Fork Length</option>
            </select>
          </label>

          <label className="counterBox">
            <span>Length Unit</span>

            <input className="input" value={lengthUnit} disabled />
          </label>
        </div>
      </section>

      <section className="runsShell">
        <div className="sectionTitleBlock">
          <h2>Runs & Passes</h2>
          <p>Open each pass to enter centimeter tally observations.</p>
        </div>

        <div className="runsStack">
          {runs.map((run, runIndex) => (
            <section key={runIndex} className="runGroup">
              <div className="runGroupHeader">
                <div className="runGroupTitle">
                  <span className="runBadge">Run {runIndex + 1}</span>
                  <p>All passes below belong to this run.</p>
                </div>

                <label className="runNBox">
                  CustomRunName
                  <input
                    value={run.customRunName}
                    onChange={(event) => {
                      const value = event.target.value;

                      setRuns((previousRuns) =>
                        previousRuns.map((existingRun, index) =>
                          index === runIndex
                            ? {
                                ...existingRun,
                                customRunName: value,
                              }
                            : existingRun,
                        ),
                      );
                    }}
                  />
                </label>
              </div>

              <div className="passesGrouped">
                {run.passes.map((pass, passIndex) => (
                  <article key={passIndex} className="passPanel">
                    <div className="passPanelHeader">
                      <h3>Pass {passIndex + 1}</h3>

                      <span
                        className={
                          pass.fish.length > 0 ? "savedPill" : "emptyPill"
                        }
                      >
                        {pass.fish.length > 0
                          ? `${pass.fish.length} saved`
                          : "No data"}
                      </span>
                    </div>

                    <label className="passEffortBox">
                      Run Effort
                      <input
                        className="input"
                        type="number"
                        inputMode="decimal"
                        placeholder="Optional"
                        value={pass.effort ?? ""}
                        onChange={(event) => {
                          const value =
                            event.target.value === ""
                              ? null
                              : Number(event.target.value);

                          setRuns((previousRuns) =>
                            previousRuns.map(
                              (existingRun, existingRunIndex) => {
                                if (existingRunIndex !== runIndex) {
                                  return existingRun;
                                }

                                return {
                                  ...existingRun,
                                  passes: existingRun.passes.map(
                                    (existingPass, existingPassIndex) =>
                                      existingPassIndex === passIndex
                                        ? {
                                            ...existingPass,
                                            effort: value,
                                          }
                                        : existingPass,
                                  ),
                                };
                              },
                            ),
                          );
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      className="modernAddFishButton"
                      onClick={() => openModal(runIndex, passIndex)}
                    >
                      <span>📏</span>
                      {pass.fish.length > 0 ? "Edit Tally" : "Add Fish"}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="finalSpecimenCard">
        <h2>Final Centimeter Tally Datasheet</h2>

        <div className="specimenSummaryGrid">
          <div className="summaryCard">
            <span>Number of Species</span>
            <strong>{speciesSummary.length}</strong>
          </div>

          <div className="summaryCard">
            <span>Largest Specimen</span>
            <strong>
              {largestSpecimen
                ? `${largestSpecimen.CommonName} — ${largestSpecimen.Length} cm`
                : "—"}
            </strong>
          </div>

          <div className="summaryCard">
            <span>Smallest Specimen</span>
            <strong>
              {smallestSpecimen
                ? `${smallestSpecimen.CommonName} — ${smallestSpecimen.Length} cm`
                : "—"}
            </strong>
          </div>
        </div>

        <div className="speciesQuantitySummary">
          <h3>Quantity Total by Species</h3>

          {speciesSummary.length === 0 ? (
            <p>No fish entered yet.</p>
          ) : (
            <div className="speciesSummaryPills">
              {speciesSummary.map((speciesItem) => (
                <span key={speciesItem.CommonName}>
                  {speciesItem.CommonName}:{" "}
                  <strong>{speciesItem.Quantity}</strong>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="finalTableWrap">
          <table>
            <thead>
              <tr>
                <th>SiteID</th>
                <th>CustomRunName</th>
                <th>Pass</th>
                <th>Common</th>
                <th>Scientific</th>
                <th>Qty</th>
                <th>Length Type</th>
                <th>Length Unit</th>
                <th>Length</th>
                <th>Weight</th>

                {optionalColumns.map((column) => (
                  <th key={String(column.key)}>{column.label}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {finalRows.map((row, index) => (
                <tr key={index}>
                  <td>{siteID || ""}</td>
                  <td>{row.CustomRunName}</td>
                  <td>{row.SamplePass}</td>
                  <td>{row.CommonName}</td>
                  <td>{row.ScientificName || ""}</td>
                  <td>{row.Quantity ?? ""}</td>
                  <td>{row.LengthType}</td>
                  <td>{row.LengthUnit}</td>
                  <td>{row.Length ?? ""}</td>
                  <td>{row.Weight ?? ""}</td>

                  {optionalColumns.map((column) => (
                    <td key={String(column.key)}>
                      {displayValue(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          className="modernAddFishButton"
          onClick={() => onContinueToSaveDraft?.(fishObservationTable)}
        >
          Continue to Save Draft
        </button>
      </section>

      {modalOpen && (
        <FishEntryCMTallyModal
          activeRun={activeRun}
          activePass={activePass}
          rows={modalRows}
          onRowsChange={setModalRows}
          onSave={saveModal}
          onClose={() => setModalOpen(false)}
        />
      )}
    </main>
  );
}
