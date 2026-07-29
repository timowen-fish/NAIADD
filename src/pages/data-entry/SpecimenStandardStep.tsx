import { useEffect, useMemo, useRef, useState } from "react";
import MusselModalStandard, {
  type MusselStandardRow,
} from "./MusselModal_Standard";
import type { SpecimenFormType } from "../../types/surveySession";
import "../../styles/SpecimenStandardStep.css";

export type MusselObservationTable = {
  SiteID?: string;
  CustomRunName?: string;
  RunN?: number;
  Run_Number?: number;
  RunEffort?: number | null;
  SamplePass?: number;
  BOVA?: string;
  ScientificName?: string;
  Condition?: string;
  Quantity?: number | null;
  Size?: string;
  SexMaturity?: string;
  QualAbundance?: string;
  SpecimenNotes?: string;
};

type PassData = {
  effort: number | null;
  mussels: MusselStandardRow[];
};

type RunData = {
  customRunName: string;
  passes: PassData[];
};

type Props = {
  processingType?: SpecimenFormType;
  siteID?: string;
  onBack: () => void;
  onContinueToSaveDraft?: (rows: MusselObservationTable[]) => void;
  draftMusselRows?: MusselObservationTable[];
};

type FinalRow = MusselStandardRow & {
  CustomRunName: string;
  RunN: number;
  Run_Number: number;
  RunEffort: number | null;
  SamplePass: number;
};

type ProcessingConfiguration = {
  title: string;
  icon: string;
  sampleGroupLabel: string;
  subsampleLabel: string;
  intro: string;
};

const PROCESSING_CONFIG: Record<
  SpecimenFormType,
  ProcessingConfiguration
> = {
  standard_mussel: {
    title: "Standard Mussel Processing",
    icon: "◒",
    sampleGroupLabel: "Sample Group",
    subsampleLabel: "Pass",
    intro:
      "Enter standard NAIADD mussel observations by sample group and pass.",
  },
  quads: {
    title: "Quads",
    icon: "▦",
    sampleGroupLabel: "Quad",
    subsampleLabel: "Replicate",
    intro:
      "Enter quadrat observations using the standard mussel fields.",
  },
  musselrama: {
    title: "Musselrama",
    icon: "◉",
    sampleGroupLabel: "Station",
    subsampleLabel: "Pass",
    intro:
      "Enter Musselrama observations using the standard mussel fields.",
  },
};

function createEmptyMusselRow(): MusselStandardRow {
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function passHasData(pass: PassData) {
  return pass.mussels.some(
    (row) => row.ScientificName.trim() !== "",
  );
}

function buildDraftSignature(rows: MusselObservationTable[]) {
  return JSON.stringify(
    rows.map((row) => ({
      CustomRunName: row.CustomRunName ?? "",
      RunN: row.RunN ?? "",
      Run_Number: row.Run_Number ?? "",
      RunEffort: row.RunEffort ?? null,
      SamplePass: row.SamplePass ?? "",
      BOVA: row.BOVA ?? "",
      ScientificName: row.ScientificName ?? "",
      Condition: row.Condition ?? "",
      Quantity: row.Quantity ?? null,
      Size: row.Size ?? "",
      SexMaturity: row.SexMaturity ?? "",
      QualAbundance: row.QualAbundance ?? "",
      SpecimenNotes: row.SpecimenNotes ?? "",
    })),
  );
}

function rowFromDraft(
  row: MusselObservationTable,
): MusselStandardRow {
  return {
    BOVA: String(row.BOVA || ""),
    ScientificName: String(row.ScientificName || ""),
    Condition: String(row.Condition || ""),
    Quantity: row.Quantity ?? null,
    Size: String(row.Size || ""),
    SexMaturity: String(row.SexMaturity || ""),
    QualAbundance: String(row.QualAbundance || ""),
    SpecimenNotes: String(row.SpecimenNotes || ""),
  };
}

function hydrateRunsFromDraftRows(
  rows: MusselObservationTable[],
): RunData[] {
  if (!rows.length) {
    return [
      {
        customRunName: "1",
        passes: [{ effort: null, mussels: [] }],
      },
    ];
  }

  const runMap = new Map<
    string,
    Map<
      number,
      {
        effort: number | null;
        mussels: MusselStandardRow[];
      }
    >
  >();

  rows.forEach((row) => {
    const scientificName = String(
      row.ScientificName || "",
    ).trim();

    const runName = String(row.CustomRunName || "1");
    const rawPass = Number(row.SamplePass || 1);
    const passNumber = Number.isFinite(rawPass)
      ? Math.max(1, rawPass)
      : 1;

    if (!runMap.has(runName)) {
      runMap.set(runName, new Map());
    }

    const passMap = runMap.get(runName)!;

    if (!passMap.has(passNumber)) {
      passMap.set(passNumber, {
        effort:
          typeof row.RunEffort === "number" &&
          Number.isFinite(row.RunEffort)
            ? row.RunEffort
            : null,
        mussels: [],
      });
    }

    if (
      scientificName &&
      scientificName !== "No Specimen" &&
      scientificName !== "NoFish"
    ) {
      passMap
        .get(passNumber)!
        .mussels.push(rowFromDraft(row));
    }
  });

  if (!runMap.size) {
    return [
      {
        customRunName: "1",
        passes: [{ effort: null, mussels: [] }],
      },
    ];
  }

  return Array.from(runMap.entries()).map(
    ([customRunName, passMap]) => {
      const maxPass = Math.max(
        ...Array.from(passMap.keys()),
        1,
      );

      return {
        customRunName,
        passes: Array.from(
          { length: maxPass },
          (_, index) => ({
            effort:
              passMap.get(index + 1)?.effort ?? null,
            mussels:
              passMap.get(index + 1)?.mussels || [],
          }),
        ),
      };
    },
  );
}

export default function SpecimenStandardStep({
  processingType = "standard_mussel",
  siteID,
  onBack,
  onContinueToSaveDraft,
  draftMusselRows = [],
}: Props) {
  const processingConfig =
    PROCESSING_CONFIG[processingType];

  const [runsCount, setRunsCount] = useState(1);
  const [passesCount, setPassesCount] = useState(1);
  const [runs, setRuns] = useState<RunData[]>([
    {
      customRunName: "1",
      passes: [{ effort: null, mussels: [] }],
    },
  ]);

  const [modalOpen, setModalOpen] = useState(false);
  const [activeRun, setActiveRun] = useState(0);
  const [activePass, setActivePass] = useState(0);
  const [modalRows, setModalRows] = useState<
    MusselStandardRow[]
  >([]);

  const hydratedDraftSignatureRef = useRef("");

  useEffect(() => {
    if (!draftMusselRows.length) return;

    const signature =
      buildDraftSignature(draftMusselRows);

    if (
      signature === hydratedDraftSignatureRef.current
    ) {
      return;
    }

    const hydrated =
      hydrateRunsFromDraftRows(draftMusselRows);

    setRuns(hydrated);
    setRunsCount(hydrated.length);
    setPassesCount(
      Math.max(
        ...hydrated.map((run) => run.passes.length),
        1,
      ),
    );

    hydratedDraftSignatureRef.current = signature;
  }, [draftMusselRows]);

  function reductionWouldClearData(
    newRuns: number,
    newPasses: number,
  ) {
    return runs.some((run, runIndex) => {
      if (runIndex >= newRuns) {
        return run.passes.some(passHasData);
      }

      return run.passes.some((pass, passIndex) => {
        return (
          passIndex >= newPasses && passHasData(pass)
        );
      });
    });
  }

  function syncStructure(
    newRuns: number,
    newPasses: number,
  ) {
    const safeRuns = clamp(newRuns, 1, 20);
    const safePasses = clamp(newPasses, 1, 20);

    if (
      (safeRuns < runsCount ||
        safePasses < passesCount) &&
      reductionWouldClearData(safeRuns, safePasses) &&
      !window.confirm(
        "Reducing the number of groups or passes will remove saved mussel observations. Continue?",
      )
    ) {
      return false;
    }

    setRuns((current) => {
      const updated = current.map((run) => ({
        ...run,
        passes: run.passes.map((pass) => ({
          ...pass,
          mussels: pass.mussels.map((row) => ({
            ...row,
          })),
        })),
      }));

      while (updated.length < safeRuns) {
        updated.push({
          customRunName: String(updated.length + 1),
          passes: Array.from(
            { length: safePasses },
            () => ({
              effort: null,
              mussels: [],
            }),
          ),
        });
      }

      updated.length = safeRuns;

      updated.forEach((run) => {
        while (run.passes.length < safePasses) {
          run.passes.push({
            effort: null,
            mussels: [],
          });
        }

        run.passes.length = safePasses;
      });

      return updated;
    });

    setRunsCount(safeRuns);
    setPassesCount(safePasses);
    return true;
  }

  function openModal(
    runIndex: number,
    passIndex: number,
  ) {
    const existing =
      runs[runIndex].passes[passIndex].mussels;

    setActiveRun(runIndex);
    setActivePass(passIndex);
    setModalRows(
      existing.length
        ? existing.map((row) => ({ ...row }))
        : [createEmptyMusselRow()],
    );
    setModalOpen(true);
  }

  function saveModal() {
    const cleaned = modalRows.filter(
      (row) => row.ScientificName.trim() !== "",
    );

    setRuns((current) =>
      current.map((run, runIndex) => {
        if (runIndex !== activeRun) return run;

        return {
          ...run,
          passes: run.passes.map(
            (pass, passIndex) =>
              passIndex === activePass
                ? { ...pass, mussels: cleaned }
                : pass,
          ),
        };
      }),
    );

    setModalOpen(false);
  }

  const finalRows = useMemo<FinalRow[]>(() => {
    const output: FinalRow[] = [];

    runs.forEach((run, runIndex) => {
      run.passes.forEach((pass, passIndex) => {
        if (!pass.mussels.length) {
          output.push({
            CustomRunName: run.customRunName,
            RunN: runIndex + 1,
            Run_Number: runIndex + 1,
            RunEffort: pass.effort,
            SamplePass: passIndex + 1,
            ...createEmptyMusselRow(),
            ScientificName: "No Specimen",
            Quantity: 0,
          });
          return;
        }

        pass.mussels.forEach((row) => {
          output.push({
            CustomRunName: run.customRunName,
            RunN: runIndex + 1,
            Run_Number: runIndex + 1,
            RunEffort: pass.effort,
            SamplePass: passIndex + 1,
            ...row,
          });
        });
      });
    });

    return output;
  }, [runs]);

  const musselObservationTable =
    useMemo<MusselObservationTable[]>(
      () =>
        finalRows.map((row) => ({
          SiteID: siteID,
          CustomRunName: row.CustomRunName,
          RunN: row.RunN,
          Run_Number: row.Run_Number,
          RunEffort: row.RunEffort,
          SamplePass: row.SamplePass,
          BOVA: row.BOVA,
          ScientificName: row.ScientificName,
          Condition: row.Condition,
          Quantity: row.Quantity,
          Size: row.Size,
          SexMaturity: row.SexMaturity,
          QualAbundance: row.QualAbundance,
          SpecimenNotes: row.SpecimenNotes,
        })),
      [finalRows, siteID],
    );

  const realRows = finalRows.filter(
    (row) =>
      row.ScientificName &&
      row.ScientificName !== "No Specimen",
  );

  const speciesSummary = useMemo(() => {
    const summary = new Map<string, number>();

    realRows.forEach((row) => {
      const name = row.ScientificName;
      summary.set(
        name,
        (summary.get(name) || 0) +
          Number(row.Quantity || 0),
      );
    });

    return Array.from(summary.entries())
      .map(([ScientificName, Quantity]) => ({
        ScientificName,
        Quantity,
      }))
      .sort((a, b) => b.Quantity - a.Quantity);
  }, [realRows]);

  return (
    <main className="app specimenStandardStep">
      <button
        type="button"
        className="backButton"
        onClick={onBack}
      >
        ← Back
      </button>

      <section className="standardHero">
        <div className="standardHeroIcon">
          {processingConfig.icon}
        </div>
        <div className="standardHeroText">
          <p className="stepKicker">
            Step 3 — Biological Observations
          </p>
          <h1>{processingConfig.title}</h1>
          <p>{processingConfig.intro}</p>
        </div>
      </section>

      <section className="sampleControlCard">
        {draftMusselRows.length > 0 && (
          <div className="importedDraftNotice">
            <strong>Draft mussel data loaded.</strong>{" "}
            Existing observations were imported from the
            active draft.
          </div>
        )}

        <div className="sampleControlHeader">
          <h2>Sample Details</h2>
          <p>
            Set the number of sample groups and
            subsamples for this survey event.
          </p>
        </div>

        <div className="counterGrid">
          <div className="counterBox">
            <span>
              Number of{" "}
              {processingConfig.sampleGroupLabel}s
            </span>
            <div className="counterControls">
              <button
                type="button"
                onClick={() =>
                  syncStructure(
                    runsCount - 1,
                    passesCount,
                  )
                }
              >
                ↓
              </button>
              <strong>{runsCount}</strong>
              <button
                type="button"
                onClick={() =>
                  syncStructure(
                    runsCount + 1,
                    passesCount,
                  )
                }
              >
                ↑
              </button>
            </div>
          </div>

          <div className="counterBox">
            <span>
              Number of{" "}
              {processingConfig.subsampleLabel}s
            </span>
            <div className="counterControls">
              <button
                type="button"
                onClick={() =>
                  syncStructure(
                    runsCount,
                    passesCount - 1,
                  )
                }
              >
                ↓
              </button>
              <strong>{passesCount}</strong>
              <button
                type="button"
                onClick={() =>
                  syncStructure(
                    runsCount,
                    passesCount + 1,
                  )
                }
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="runsShell">
        <div className="sectionTitleBlock">
          <h2>
            {processingConfig.sampleGroupLabel}s &amp;{" "}
            {processingConfig.subsampleLabel}s
          </h2>
          <p>
            Open each{" "}
            {processingConfig.subsampleLabel.toLowerCase()}{" "}
            to enter mussel observations.
          </p>
        </div>

        <div className="runsStack">
          {runs.map((run, runIndex) => (
            <section
              key={runIndex}
              className="runGroup"
            >
              <div className="runGroupHeader">
                <div className="runGroupTitle">
                  <span className="runBadge">
                    {processingConfig.sampleGroupLabel}{" "}
                    {runIndex + 1}
                  </span>
                </div>

                <label className="runNBox">
                  {processingConfig.sampleGroupLabel} Name
                  <input
                    value={run.customRunName}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRuns((current) =>
                        current.map((existing, index) =>
                          index === runIndex
                            ? {
                                ...existing,
                                customRunName: value,
                              }
                            : existing,
                        ),
                      );
                    }}
                  />
                </label>
              </div>

              <div className="passesGrouped">
                {run.passes.map(
                  (pass, passIndex) => (
                    <article
                      key={passIndex}
                      className="passPanel"
                    >
                      <div className="passPanelHeader">
                        <h3>
                          {
                            processingConfig.subsampleLabel
                          }{" "}
                          {passIndex + 1}
                        </h3>
                        <span
                          className={
                            pass.mussels.length
                              ? "savedPill"
                              : "emptyPill"
                          }
                        >
                          {pass.mussels.length
                            ? `${pass.mussels.length} saved`
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
                                : Number(
                                    event.target.value,
                                  );

                            setRuns((current) =>
                              current.map(
                                (
                                  existingRun,
                                  existingRunIndex,
                                ) => {
                                  if (
                                    existingRunIndex !==
                                    runIndex
                                  ) {
                                    return existingRun;
                                  }

                                  return {
                                    ...existingRun,
                                    passes:
                                      existingRun.passes.map(
                                        (
                                          existingPass,
                                          existingPassIndex,
                                        ) =>
                                          existingPassIndex ===
                                          passIndex
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
                        className="modernAddMusselButton"
                        onClick={() =>
                          openModal(runIndex, passIndex)
                        }
                      >
                        <span>◒</span>
                        Add Mussels
                      </button>
                    </article>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="finalSpecimenCard">
        <h2>Final Mussel Datasheet</h2>

        <div className="specimenSummaryGrid">
          <div className="summaryCard">
            <span>Number of Mussel Species</span>
            <strong>{speciesSummary.length}</strong>
          </div>

          <div className="summaryCard">
            <span>Total Quantity</span>
            <strong>
              {realRows.reduce(
                (sum, row) =>
                  sum + Number(row.Quantity || 0),
                0,
              )}
            </strong>
          </div>

          <div className="summaryCard">
            <span>Observation Records</span>
            <strong>{realRows.length}</strong>
          </div>
        </div>

        <div className="speciesQuantitySummary">
          <h3>Mussel Quantity by Scientific Name</h3>

          {!speciesSummary.length ? (
            <p>No mussels entered yet.</p>
          ) : (
            <div className="speciesSummaryPills">
              {speciesSummary.map((species) => (
                <span key={species.ScientificName}>
                  <em>{species.ScientificName}</em>:{" "}
                  <strong>{species.Quantity}</strong>
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
                <th>BOVA</th>
                <th>ScientificName</th>
                <th>Condition</th>
                <th>Quantity</th>
                <th>Size</th>
                <th>SexMaturity</th>
                <th>QualAbundance</th>
                <th>SpecimenNotes</th>
              </tr>
            </thead>

            <tbody>
              {finalRows.map((row, index) => (
                <tr key={index}>
                  <td>{siteID || ""}</td>
                  <td>{row.CustomRunName}</td>
                  <td>{row.SamplePass}</td>
                  <td>{row.BOVA}</td>
                  <td>
                    <em>{row.ScientificName}</em>
                  </td>
                  <td>{row.Condition}</td>
                  <td>{row.Quantity ?? ""}</td>
                  <td>{row.Size}</td>
                  <td>{row.SexMaturity}</td>
                  <td>{row.QualAbundance}</td>
                  <td>{row.SpecimenNotes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          className="modernAddMusselButton"
          onClick={() =>
            onContinueToSaveDraft?.(
              musselObservationTable,
            )
          }
        >
          Continue to Save Draft
        </button>
      </section>

      {modalOpen && (
        <MusselModalStandard
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
