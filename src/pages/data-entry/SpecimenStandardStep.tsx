import { useEffect, useMemo, useRef, useState } from "react";
import FishEntryModal, { type FishRow } from "./FishEntryModal";
import type { SpecimenFormType } from "../../types/surveySession";
import "../../styles/SpecimenStandardStep.css";

export type MusselObservationTable = {
  SiteID?: string;
  CustomRunName?: string;
  RunN?: number;
  Run_Number?: number;
  RunEffort?: number | null;
  SamplePass?: number;
  LengthType?: "Fork Length" | "Total Length";
  LengthUnit?: "Millimeter" | "Centimeter Class";
  WeightUnit?: "Grams" | "Kilograms";
  CommonName?: string;
  ScientificName?: string;
  Quantity?: number | null;
  Length?: number | null;
  ForkLength?: number | null;
  Weight?: number | null;
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
  SpecimenComments?: string;
  Comments?: string;
};

// Compatibility alias for existing workflow code during the NAIADD migration.
export type FishObservationTable = MusselObservationTable;

type LengthType = "Fork Length" | "Total Length";
type LengthUnit = "Millimeter" | "Centimeter Class";
type WeightUnit = "Grams" | "Kilograms";

type PassData = {
  effort: number | null;
  fish: FishRow[];
};

type RunData = {
  customRunName: string;
  passes: PassData[];
};

type Props = {
  processingType?: SpecimenFormType;
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
  WeightUnit: WeightUnit;
};

type OptionalColumn = {
  key: keyof FishRow;
  label: string;
};

function createEmptyFishRow(): FishRow {
  return {
    CommonName: "",
    ScientificName: "",
    Quantity: null,
    Length: null,
    Weight: null,
  };
}

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



function isLengthType(value: unknown): value is LengthType {
  return value === "Fork Length" || value === "Total Length";
}

function isLengthUnit(value: unknown): value is LengthUnit {
  return value === "Millimeter" || value === "Centimeter Class";
}

function isWeightUnit(value: unknown): value is WeightUnit {
  return value === "Grams" || value === "Kilograms";
}

function buildDraftFishSignature(rows: FishObservationTable[]) {
  return JSON.stringify(
    rows.map((row) => ({
      CustomRunName: row.CustomRunName ?? "",
      RunN: (row as any).RunN ?? "",
      Run_Number: (row as any).Run_Number ?? "",
      RunEffort: (row as any).RunEffort ?? null,
      SamplePass: row.SamplePass ?? "",
      CommonName: row.CommonName ?? "",
      ScientificName: row.ScientificName ?? "",
      Quantity: row.Quantity ?? null,
      Length: row.Length ?? null,
      Weight: row.Weight ?? null,
      LengthType: row.LengthType ?? "",
      LengthUnit: row.LengthUnit ?? "",
      WeightUnit: row.WeightUnit ?? "",
    })),
  );
}

function fishRowFromDraftRow(row: FishObservationTable): FishRow {
  return {
    CommonName: row.CommonName || "",
    ScientificName: row.ScientificName || "",
    Quantity: row.Quantity ?? null,
    Length: row.Length ?? null,
    Weight: row.Weight ?? null,
    Sex: typeof row.Sex === "string" ? row.Sex : "",
    Anomaly: typeof row.Anomaly === "string" ? row.Anomaly : "",
    Condition: typeof row.Condition === "string" ? row.Condition : "",
    Maturity: typeof row.Maturity === "string" ? row.Maturity : "",
    WildPropagated:
      typeof row.WildPropagated === "string" ? row.WildPropagated : "",
    Disposition: typeof row.Disposition === "string" ? row.Disposition : "",
    MinLength: row.MinLength ?? null,
    MaxLength: row.MaxLength ?? null,
    MinWeight: row.MinWeight ?? null,
    MaxWeight: row.MaxWeight ?? null,
    TotalWeight: row.TotalWeight ?? null,
    PrimaryTagType:
      typeof row.PrimaryTagType === "string" ? row.PrimaryTagType : "",
    PrimaryTagNumber:
      typeof row.PrimaryTagNumber === "string" ? row.PrimaryTagNumber : "",
    Tag1MarkRecap:
      typeof row.Tag1MarkRecap === "string" ? row.Tag1MarkRecap : "",
    SecondaryTagType:
      typeof row.SecondaryTagType === "string" ? row.SecondaryTagType : "",
    SecondaryTagNumber:
      typeof row.SecondaryTagNumber === "string" ? row.SecondaryTagNumber : "",
    Tag2MarkRecap:
      typeof row.Tag2MarkRecap === "string" ? row.Tag2MarkRecap : "",
    TissueSampleID:
      typeof row.TissueSampleID === "string" ? row.TissueSampleID : "",
    TissueResults:
      typeof row.TissueResults === "string" ? row.TissueResults : "",
    OtolithID: typeof row.OtolithID === "string" ? row.OtolithID : "",
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
  if (!rows || rows.length === 0) {
    return [{ customRunName: "1", passes: [{ effort: null, fish: [] }] }];
  }

  const runMap = new Map<string, Map<number, { effort: number | null; fish: FishRow[] }>>();

  rows.forEach((row) => {
    const runName = String(row.CustomRunName || "1");
    const rawPassNumber = Number(row.SamplePass || 1);
    const passNumber = Number.isFinite(rawPassNumber)
      ? Math.max(1, rawPassNumber)
      : 1;

    if (!runMap.has(runName)) {
      runMap.set(runName, new Map<number, { effort: number | null; fish: FishRow[] }>());
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

    if (row.CommonName && row.CommonName !== "NoFish") {
      passMap.get(passNumber)!.fish.push(fishRowFromDraftRow(row));
    }
  });

  if (runMap.size === 0) {
    return [{ customRunName: "1", passes: [{ effort: null, fish: [] }] }];
  }

  return Array.from(runMap.entries()).map(([customRunName, passMap]) => {
    const passNumbers = Array.from(passMap.keys());
    const maxPass = Math.max(...passNumbers, 1);

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

type ProcessingConfiguration = {
  title: string;
  icon: string;
  sampleGroupLabel: string;
  subsampleLabel: string;
  intro: string;
};

const PROCESSING_CONFIG: Record<SpecimenFormType, ProcessingConfiguration> = {
  standard_mussel: {
    title: "Standard Mussel Processing",
    icon: "◒",
    sampleGroupLabel: "Sample Group",
    subsampleLabel: "Pass",
    intro: "Enter mussel observations by sample group and pass.",
  },
  quads: {
    title: "Quads",
    icon: "▦",
    sampleGroupLabel: "Quad",
    subsampleLabel: "Replicate",
    intro: "Enter quadrat observations using the standard mussel-processing form.",
  },
  musselrama: {
    title: "Musselrama",
    icon: "◉",
    sampleGroupLabel: "Station",
    subsampleLabel: "Pass",
    intro: "Enter Musselrama observations using the standard mussel-processing form.",
  },
};

export default function SpecimenStandardStep({
  processingType = "standard_mussel",
  siteID,
  onBack,
  onContinueToSaveDraft,
  draftFishRows = [],
}: Props) {
  const processingConfig = PROCESSING_CONFIG[processingType];
  const [runsCount, setRunsCount] = useState(1);
  const [passesCount, setPassesCount] = useState(1);

  const [lengthType, setLengthType] = useState<LengthType>("Total Length");
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>("Millimeter");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("Grams");

  const [runs, setRuns] = useState<RunData[]>([
    { customRunName: "1", passes: [{ effort: null, fish: [] }] },
  ]);

  const [modalOpen, setModalOpen] = useState(false);
  const [activeRun, setActiveRun] = useState(0);
  const [activePass, setActivePass] = useState(0);
  const [modalRows, setModalRows] = useState<FishRow[]>([]);

  const hydratedDraftSignatureRef = useRef<string>("");

  useEffect(() => {
    if (!draftFishRows || draftFishRows.length === 0) return;

    const signature = buildDraftFishSignature(draftFishRows);

    if (signature === hydratedDraftSignatureRef.current) return;

    const hydratedRuns = hydrateRunsFromDraftRows(draftFishRows);
    const firstDraftRowWithUnits = draftFishRows.find(
      (row) => row.LengthType || row.LengthUnit || row.WeightUnit,
    );

    setRuns(hydratedRuns);
    setRunsCount(hydratedRuns.length);
    setPassesCount(
      Math.max(...hydratedRuns.map((run) => run.passes.length), 1),
    );

    if (firstDraftRowWithUnits?.LengthType && isLengthType(firstDraftRowWithUnits.LengthType)) {
      setLengthType(firstDraftRowWithUnits.LengthType);
    }

    if (firstDraftRowWithUnits?.LengthUnit && isLengthUnit(firstDraftRowWithUnits.LengthUnit)) {
      setLengthUnit(firstDraftRowWithUnits.LengthUnit);
    }

    if (firstDraftRowWithUnits?.WeightUnit && isWeightUnit(firstDraftRowWithUnits.WeightUnit)) {
      setWeightUnit(firstDraftRowWithUnits.WeightUnit);
    }

    hydratedDraftSignatureRef.current = signature;
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
        "Are you sure? Reducing the number of runs or passes will clear mussel data from removed tables.",
      );

      if (!confirmed) return false;
    }

    setRuns((prev) => {
      const updated = prev.map((run) => ({
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
    const existing = runs[runIndex].passes[passIndex].fish;

    setActiveRun(runIndex);
    setActivePass(passIndex);

    setModalRows(
      existing.length > 0
        ? existing.map((row) => ({ ...row }))
        : [createEmptyFishRow()],
    );

    setModalOpen(true);
  }

  function saveModal() {
    setRuns((prev) => {
      const cleaned = modalRows.filter((row) => row.CommonName.trim() !== "");

      return prev.map((run, runIndex) => {
        if (runIndex !== activeRun) return run;

        return {
          ...run,
          passes: run.passes.map((pass, passIndex) =>
            passIndex === activePass ? { ...pass, fish: cleaned } : pass,
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
            LengthType: lengthType,
            LengthUnit: lengthUnit,
            WeightUnit: weightUnit,
            CommonName: "NoFish",
            ScientificName: "",
            Quantity: 0,
            Length: null,
            Weight: null,
          });
        } else {
          pass.fish.forEach((fish) => {
            rows.push({
              CustomRunName: run.customRunName,
              RunN: runIndex + 1,
              Run_Number: runIndex + 1,
              RunEffort: pass.effort,
              SamplePass: passIndex + 1,
              LengthType: lengthType,
              LengthUnit: lengthUnit,
              WeightUnit: weightUnit,
              ...fish,
            });
          });
        }
      });
    });

    return rows;
  }, [runs, lengthType, lengthUnit, weightUnit]);

  const fishObservationTable: FishObservationTable[] = useMemo(() => {
    return finalRows.map((row) => ({
      SiteID: siteID,
      CustomRunName: row.CustomRunName,
      RunN: row.RunN,
      Run_Number: row.Run_Number,
      RunEffort: row.RunEffort,
      SamplePass: row.SamplePass,
      LengthType: row.LengthType,
      LengthUnit: row.LengthUnit,
      WeightUnit: row.WeightUnit,
      CommonName: row.CommonName,
      ScientificName: row.ScientificName || "",
      Quantity: row.Quantity ?? null,
      Length: row.Length ?? null,
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
    })) as FishObservationTable[];
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
      .map(([CommonName, Quantity]) => ({ CommonName, Quantity }))
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
    <main className="app specimenStandardStep">
      <button className="backButton" onClick={onBack}>
        ← Back
      </button>

      <section className="standardHero">
        <div className="standardHeroIcon">{processingConfig.icon}</div>

        <div className="standardHeroText">
          <p className="stepKicker">Step 3 — Biological Observations</p>
          <h1>{processingConfig.title}</h1>
          <p>{processingConfig.intro}</p>
        </div>
      </section>

      <section className="sampleControlCard">
        {draftFishRows.length > 0 && (
          <div className="importedDraftNotice">
            <strong>Draft mussel data loaded.</strong> Existing mussel observations
            were imported from the active draft. Open any saved pass below to
            edit, add, or remove records in the mussel modal.
          </div>
        )}

        <div className="sampleControlHeader">
          <h2>Sample Details</h2>
          <p>
            Set the number of sample groups, subsamples, and measurement units for this
            survey event.
          </p>
        </div>

        <div className="counterGrid">
          <div className="counterBox">
            <span>Number of {processingConfig.sampleGroupLabel}s</span>

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
            <span>Number of {processingConfig.subsampleLabel}s</span>

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
              onChange={(e) => setLengthType(e.target.value as LengthType)}
            >
              <option value="Total Length">Total Length</option>
              <option value="Fork Length">Fork Length</option>
            </select>
          </label>

          <label className="counterBox">
            <span>Length Unit</span>
            <select
              className="input"
              value={lengthUnit}
              onChange={(e) => setLengthUnit(e.target.value as LengthUnit)}
            >
              <option value="Millimeter">Millimeter</option>
              <option value="Centimeter Class">Centimeter Class</option>
            </select>
          </label>

          <label className="counterBox">
            <span>Weight Unit</span>
            <select
              className="input"
              value={weightUnit}
              onChange={(e) => setWeightUnit(e.target.value as WeightUnit)}
            >
              <option value="Grams">Grams</option>
              <option value="Kilograms">Kilograms</option>
            </select>
          </label>
        </div>
      </section>

      <section className="runsShell">
        <div className="sectionTitleBlock">
          <h2>{processingConfig.sampleGroupLabel}s &amp; {processingConfig.subsampleLabel}s</h2>
          <p>Open each {processingConfig.subsampleLabel.toLowerCase()} to enter mussel observations.</p>
        </div>

        <div className="runsStack">
          {runs.map((run, runIndex) => (
            <section key={runIndex} className="runGroup">
              <div className="runGroupHeader">
                <div className="runGroupTitle">
                  <span className="runBadge">{processingConfig.sampleGroupLabel} {runIndex + 1}</span>
                  <p>All {processingConfig.subsampleLabel.toLowerCase()}s below belong to this {processingConfig.sampleGroupLabel.toLowerCase()}.</p>
                </div>

                <label className="runNBox">
                  {processingConfig.sampleGroupLabel} Name
                  <input
                    value={run.customRunName}
                    onChange={(e) => {
                      const value = e.target.value;

                      setRuns((prev) =>
                        prev.map((existingRun, index) =>
                          index === runIndex
                            ? { ...existingRun, customRunName: value }
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
                      <h3>{processingConfig.subsampleLabel} {passIndex + 1}</h3>

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
                        onChange={(e) => {
                          const value =
                            e.target.value === ""
                              ? null
                              : Number(e.target.value);

                          setRuns((prev) =>
                            prev.map((existingRun, existingRunIndex) => {
                              if (existingRunIndex !== runIndex) {
                                return existingRun;
                              }

                              return {
                                ...existingRun,
                                passes: existingRun.passes.map(
                                  (existingPass, existingPassIndex) =>
                                    existingPassIndex === passIndex
                                      ? { ...existingPass, effort: value }
                                      : existingPass,
                                ),
                              };
                            }),
                          );
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      className="modernAddFishButton"
                      onClick={() => openModal(runIndex, passIndex)}
                    >
                      <span>◒</span>
                      Add Mussels
                    </button>
                  </article>
                ))}
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
            <span>Largest Specimen</span>
            <strong>
              {largestSpecimen
                ? `${largestSpecimen.CommonName} — ${largestSpecimen.Length} ${lengthUnit}`
                : "—"}
            </strong>
          </div>

          <div className="summaryCard">
            <span>Smallest Specimen</span>
            <strong>
              {smallestSpecimen
                ? `${smallestSpecimen.CommonName} — ${smallestSpecimen.Length} ${lengthUnit}`
                : "—"}
            </strong>
          </div>
        </div>

        <div className="speciesQuantitySummary">
          <h3>Mussel Quantity by Species</h3>

          {speciesSummary.length === 0 ? (
            <p>No mussels entered yet.</p>
          ) : (
            <div className="speciesSummaryPills">
              {speciesSummary.map((species) => (
                <span key={species.CommonName}>
                  {species.CommonName}: <strong>{species.Quantity}</strong>
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
                <th>Weight Unit</th>
                <th>Weight</th>

                {optionalColumns.map((column) => (
                  <th key={column.key}>{column.label}</th>
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
                  <td>{row.WeightUnit}</td>
                  <td>{row.Weight ?? ""}</td>

                  {optionalColumns.map((column) => (
                    <td key={column.key}>{row[column.key] ?? ""}</td>
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
        <FishEntryModal
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
