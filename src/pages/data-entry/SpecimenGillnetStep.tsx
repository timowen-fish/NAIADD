import { useEffect, useMemo, useRef, useState } from "react";
import FishEntryGillnetModal, { type FishRow } from "./FishEntryGillnetModal";
import type { FishObservationTable } from "./SpecimenStandardStep";
import "../../styles/SpecimenGillnetStep.css";

type LengthType = "Fork Length" | "Total Length";
type LengthUnit = "Millimeter" | "Centimeter Class";
type WeightUnit = "Grams" | "Kilograms";

type PassData = {
  effort: number | null;
  barmeshCm: number | null;
  fish: FishRow[];
};

type RunData = {
  customRunName: string;
  netNumber: string;
  setDate: string;
  setTime: string;
  pullDate: string;
  pullTime: string;
  nightsSet: number | null;
  netDepthM: number | null;
  netLengthM: number | null;
  placementSMB: string;
  placementShoreOpen: string;
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
  NetNumber: string;
  SetDate: string;
  SetTime: string;
  PullDate: string;
  PullTime: string;
  NightsSet: number | null;
  Barmesh_cm: number | null;
  NetDepth_m: number | null;
  NetLength_m: number | null;
  Placement_SMB: string;
  Placement_ShoreOpen: string;
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

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function createEmptyRun(index: number, passesCount: number): RunData {
  return {
    customRunName: String(index + 1),
    netNumber: String(index + 1),
    setDate: "",
    setTime: "",
    pullDate: "",
    pullTime: "",
    nightsSet: null,
    netDepthM: null,
    netLengthM: null,
    placementSMB: "",
    placementShoreOpen: "",
    passes: Array.from({ length: passesCount }, () => ({
      effort: null,
      barmeshCm: null,
      fish: [],
    })),
  };
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
      CustomNetName: row.CustomRunName ?? "",
      NetNumber: (row as any).NetNumber ?? "",
      SetDate: (row as any).SetDate ?? "",
      SetTime: (row as any).SetTime ?? "",
      PullDate: (row as any).PullDate ?? "",
      PullTime: (row as any).PullTime ?? "",
      NightsSet: (row as any).NightsSet ?? "",
      Barmesh_cm: (row as any).Barmesh_cm ?? "",
      NetDepth_m: (row as any).NetDepth_m ?? "",
      NetLength_m: (row as any).NetLength_m ?? "",
      Placement_SMB: (row as any).Placement_SMB ?? "",
      Placement_ShoreOpen: (row as any).Placement_ShoreOpen ?? "",
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
    return [createEmptyRun(0, 1)];
  }

  const runMap = new Map<string, { meta: Omit<RunData, "passes">; passes: Map<number, { effort: number | null; barmeshCm: number | null; fish: FishRow[] }> }>();

  rows.forEach((row) => {
    const runName = String(row.CustomRunName || "1");
    const rawPassNumber = Number(row.SamplePass || 1);
    const passNumber = Number.isFinite(rawPassNumber)
      ? Math.max(1, rawPassNumber)
      : 1;

    if (!runMap.has(runName)) {
      const fallbackRunIndex = Math.max(0, runMap.size);
      runMap.set(runName, {
        meta: {
          customRunName: runName,
          netNumber: String((row as any).NetNumber ?? runName ?? fallbackRunIndex + 1),
          setDate: typeof (row as any).SetDate === "string" ? (row as any).SetDate : "",
          setTime: typeof (row as any).SetTime === "string" ? (row as any).SetTime : "",
          pullDate: typeof (row as any).PullDate === "string" ? (row as any).PullDate : "",
          pullTime: typeof (row as any).PullTime === "string" ? (row as any).PullTime : "",
          nightsSet: numberOrNull((row as any).NightsSet),
          netDepthM: numberOrNull((row as any).NetDepth_m),
          netLengthM: numberOrNull((row as any).NetLength_m),
          placementSMB: typeof (row as any).Placement_SMB === "string" ? (row as any).Placement_SMB : "",
          placementShoreOpen: typeof (row as any).Placement_ShoreOpen === "string" ? (row as any).Placement_ShoreOpen : "",
        },
        passes: new Map<number, { effort: number | null; barmeshCm: number | null; fish: FishRow[] }>(),
      });
    }

    const passMap = runMap.get(runName)!.passes;

    if (!passMap.has(passNumber)) {
      passMap.set(passNumber, {
        effort: numberOrNull((row as any).RunEffort),
        barmeshCm: numberOrNull((row as any).Barmesh_cm),
        fish: [],
      });
    }

    if (row.CommonName && row.CommonName !== "NoFish") {
      passMap.get(passNumber)!.fish.push(fishRowFromDraftRow(row));
    }
  });

  if (runMap.size === 0) {
    return [createEmptyRun(0, 1)];
  }

  return Array.from(runMap.values()).map((run) => {
    const passNumbers = Array.from(run.passes.keys());
    const maxPass = Math.max(...passNumbers, 1);

    return {
      ...run.meta,
      passes: Array.from({ length: maxPass }, (_, index) => ({
        effort: run.passes.get(index + 1)?.effort ?? null,
        barmeshCm: run.passes.get(index + 1)?.barmeshCm ?? null,
        fish: run.passes.get(index + 1)?.fish || [],
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

export default function SpecimenGillnetStep({
  siteID,
  onBack,
  onContinueToSaveDraft,
  draftFishRows = [],
}: Props) {
  const [runsCount, setRunsCount] = useState(1);
  const [passesCount, setPassesCount] = useState(1);

  const [lengthType, setLengthType] = useState<LengthType>("Total Length");
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>("Millimeter");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("Grams");

  const [runs, setRuns] = useState<RunData[]>([createEmptyRun(0, 1)]);
  const [expandedGillnetDetails, setExpandedGillnetDetails] = useState<Record<number, boolean>>({});
  const [expandedDeploymentDetails, setExpandedDeploymentDetails] = useState<Record<number, boolean>>({});

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
        "Are you sure? Reducing the number of runs or passes will clear fish data from removed tables.",
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
        updated.push(createEmptyRun(updated.length, safePasses));
      }

      updated.length = safeRuns;

      updated.forEach((run) => {
        while (run.passes.length < safePasses) {
          run.passes.push({ effort: null, barmeshCm: null, fish: [] });
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
            NetNumber: run.netNumber || String(runIndex + 1),
            SetDate: run.setDate,
            SetTime: run.setTime,
            PullDate: run.pullDate,
            PullTime: run.pullTime,
            NightsSet: run.nightsSet,
            Barmesh_cm: pass.barmeshCm,
            NetDepth_m: run.netDepthM,
            NetLength_m: run.netLengthM,
            Placement_SMB: run.placementSMB,
            Placement_ShoreOpen: run.placementShoreOpen,
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
              NetNumber: run.netNumber || String(runIndex + 1),
              SetDate: run.setDate,
              SetTime: run.setTime,
              PullDate: run.pullDate,
              PullTime: run.pullTime,
              NightsSet: run.nightsSet,
              Barmesh_cm: pass.barmeshCm,
              NetDepth_m: run.netDepthM,
              NetLength_m: run.netLengthM,
              Placement_SMB: run.placementSMB,
              Placement_ShoreOpen: run.placementShoreOpen,
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
      NetNumber: row.NetNumber,
      SetDate: row.SetDate,
      SetTime: row.SetTime,
      PullDate: row.PullDate,
      PullTime: row.PullTime,
      NightsSet: row.NightsSet,
      Barmesh_cm: row.Barmesh_cm,
      NetDepth_m: row.NetDepth_m,
      NetLength_m: row.NetLength_m,
      Placement_SMB: row.Placement_SMB,
      Placement_ShoreOpen: row.Placement_ShoreOpen,
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


  function updateRun(runIndex: number, patch: Partial<RunData>) {
    setRuns((prev) =>
      prev.map((existingRun, index) =>
        index === runIndex ? { ...existingRun, ...patch } : existingRun,
      ),
    );
  }

  function updatePass(
    runIndex: number,
    passIndex: number,
    patch: Partial<PassData>,
  ) {
    setRuns((prev) =>
      prev.map((existingRun, existingRunIndex) => {
        if (existingRunIndex !== runIndex) return existingRun;

        return {
          ...existingRun,
          passes: existingRun.passes.map((existingPass, existingPassIndex) =>
            existingPassIndex === passIndex
              ? { ...existingPass, ...patch }
              : existingPass,
          ),
        };
      }),
    );
  }

  function toggleGillnetDetails(runIndex: number) {
    setExpandedGillnetDetails((prev) => ({
      ...prev,
      [runIndex]: !prev[runIndex],
    }));
  }

  function toggleDeploymentDetails(runIndex: number) {
    setExpandedDeploymentDetails((prev) => ({
      ...prev,
      [runIndex]: !prev[runIndex],
    }));
  }

  function deploymentSummary(run: RunData) {
    const set = [run.setDate, run.setTime].filter(Boolean).join(" ");
    const pull = [run.pullDate, run.pullTime].filter(Boolean).join(" ");

    if (!set && !pull) return "Deployment not entered";
    if (set && pull) return `Set ${set} • Pull ${pull}`;
    if (set) return `Set ${set}`;
    return `Pull ${pull}`;
  }

  function netSpecSummary(run: RunData) {
    const pieces = [
      run.netLengthM !== null ? `${run.netLengthM} m long` : "",
      run.netDepthM !== null ? `${run.netDepthM} m deep` : "",
      run.nightsSet !== null ? `${run.nightsSet} night${run.nightsSet === 1 ? "" : "s"}` : "",
    ].filter(Boolean);

    return pieces.length > 0 ? pieces.join(" • ") : "Net specs not entered";
  }

  return (
    <main className="app specimenGillnetStep">
      <button className="backButton" onClick={onBack}>
        ← Back
      </button>

      <section className="standardHero">
        <div className="standardHeroIcon">🎣</div>

        <div className="standardHeroText">
          <p className="stepKicker">Step 3 — Biological Observations</p>
          <h1>Species Data — Gillnet Form</h1>
          <p>Enter biological observations by net and panel.</p>
        </div>
      </section>

      <section className="sampleControlCard">
        {draftFishRows.length > 0 && (
          <div className="importedDraftNotice">
            <strong>Draft fish data loaded.</strong> Existing fish observations
            were imported from the active draft. Open any saved panel below to
            edit, add, or remove records in the fish modal.
          </div>
        )}

        <div className="sampleControlHeader">
          <h2>Sample Details</h2>
          <p>
            Set the number of nets, panels, and measurement units for this
            gillnet event.
          </p>
        </div>

        <div className="counterGrid">
          <div className="counterBox">
            <span>Number of Nets</span>

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
            <span>Number of Panels</span>

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
          <h2>Nets & Panels</h2>
          <p>Open each panel to enter fish observations.</p>
        </div>

        <div className="runsStack">
          {runs.map((run, runIndex) => (
            <section key={runIndex} className="runGroup">
              <div className="runGroupHeader gillnetRunHeader">
                <div className="runGroupTitle">
                  <span className="runBadge">Net {runIndex + 1}</span>
                  <p>All panels below belong to this net.</p>
                </div>

                <div className="gillnetCompactFields">
                  <label className="runNBox">
                    Custom Net Name
                    <input
                      value={run.customRunName}
                      onChange={(e) => updateRun(runIndex, { customRunName: e.target.value })}
                    />
                  </label>

                  <label className="runNBox">
                    Net Number
                    <input
                      value={run.netNumber}
                      onChange={(e) => updateRun(runIndex, { netNumber: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              <div className="gillnetMetaSummary">
                <span className="gillnetMetaChip">{deploymentSummary(run)}</span>
                <span className="gillnetMetaChip">{netSpecSummary(run)}</span>
                {run.placementSMB && <span className="gillnetMetaChip">SMB: {run.placementSMB}</span>}
                {run.placementShoreOpen && <span className="gillnetMetaChip">Placement: {run.placementShoreOpen}</span>}
              </div>

              <div className="gillnetDetailButtons">
                <button
                  type="button"
                  className="gillnetDetailsToggle"
                  onClick={() => toggleDeploymentDetails(runIndex)}
                >
                  {expandedDeploymentDetails[runIndex] ? "▴" : "▾"} Deployment Details
                </button>

                <button
                  type="button"
                  className="gillnetDetailsToggle"
                  onClick={() => toggleGillnetDetails(runIndex)}
                >
                  {expandedGillnetDetails[runIndex] ? "▴" : "▾"} Gear Details
                </button>
              </div>

              {expandedDeploymentDetails[runIndex] && (
                <div className="gillnetDetailsPanel">
                  <div className="gillnetDetailsGrid">
                    <label className="runNBox">
                      Set Date
                      <input
                        type="date"
                        value={run.setDate}
                        onChange={(e) => updateRun(runIndex, { setDate: e.target.value })}
                      />
                    </label>

                    <label className="runNBox">
                      Set Time
                      <input
                        type="time"
                        value={run.setTime}
                        onChange={(e) => updateRun(runIndex, { setTime: e.target.value })}
                      />
                    </label>

                    <label className="runNBox">
                      Pull Date
                      <input
                        type="date"
                        value={run.pullDate}
                        onChange={(e) => updateRun(runIndex, { pullDate: e.target.value })}
                      />
                    </label>

                    <label className="runNBox">
                      Pull Time
                      <input
                        type="time"
                        value={run.pullTime}
                        onChange={(e) => updateRun(runIndex, { pullTime: e.target.value })}
                      />
                    </label>

                    <label className="runNBox">
                      Nights Set
                      <input
                        type="number"
                        inputMode="decimal"
                        value={run.nightsSet ?? ""}
                        onChange={(e) =>
                          updateRun(runIndex, {
                            nightsSet: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              )}

              {expandedGillnetDetails[runIndex] && (
                <div className="gillnetDetailsPanel">
                  <div className="gillnetDetailsGrid">
                    <label className="runNBox">
                      Net Depth (m)
                      <input
                        type="number"
                        inputMode="decimal"
                        value={run.netDepthM ?? ""}
                        onChange={(e) =>
                          updateRun(runIndex, {
                            netDepthM: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </label>

                    <label className="runNBox">
                      Net Length (m)
                      <input
                        type="number"
                        inputMode="decimal"
                        value={run.netLengthM ?? ""}
                        onChange={(e) =>
                          updateRun(runIndex, {
                            netLengthM: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </label>

                    <label className="runNBox">
                      Placement SMB
                      <input
                        value={run.placementSMB}
                        onChange={(e) => updateRun(runIndex, { placementSMB: e.target.value })}
                      />
                    </label>

                    <label className="runNBox">
                      Placement Shore/Open
                      <input
                        value={run.placementShoreOpen}
                        onChange={(e) => updateRun(runIndex, { placementShoreOpen: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className="passesGrouped">
                {run.passes.map((pass, passIndex) => (
                  <article key={passIndex} className="passPanel">
                    <div className="passPanelHeader">
                      <h3>Panel {passIndex + 1}</h3>

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
                      Barmesh_cm
                      <input
                        className="input"
                        type="number"
                        inputMode="decimal"
                        placeholder="Panel mesh size"
                        value={pass.barmeshCm ?? ""}
                        onChange={(e) => {
                          const value =
                            e.target.value === ""
                              ? null
                              : Number(e.target.value);

                          updatePass(runIndex, passIndex, { barmeshCm: value });
                        }}
                      />
                    </label>

                    <label className="passEffortBox">
                      Net/Panel Effort
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

                          updatePass(runIndex, passIndex, { effort: value });
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      className="modernAddFishButton"
                      onClick={() => openModal(runIndex, passIndex)}
                    >
                      <span>🐟</span>
                      Add Fish
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="finalSpecimenCard">
        <h2>Final Gillnet Specimen Datasheet</h2>

        <div className="specimenSummaryGrid">
          <div className="summaryCard">
            <span>Number of Species</span>
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
          <h3>Quantity Total by Species</h3>

          {speciesSummary.length === 0 ? (
            <p>No fish entered yet.</p>
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
                <th>CustomNetName</th>
                <th>NetNumber</th>
                <th>SetDate</th>
                <th>SetTime</th>
                <th>PullDate</th>
                <th>PullTime</th>
                <th>NightsSet</th>
                <th>Barmesh_cm</th>
                <th>NetDepth_m</th>
                <th>NetLength_m</th>
                <th>Placement_SMB</th>
                <th>Placement_ShoreOpen</th>
                <th>Panel</th>
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
                  <td>{row.NetNumber}</td>
                  <td>{row.SetDate}</td>
                  <td>{row.SetTime}</td>
                  <td>{row.PullDate}</td>
                  <td>{row.PullTime}</td>
                  <td>{row.NightsSet ?? ""}</td>
                  <td>{row.Barmesh_cm ?? ""}</td>
                  <td>{row.NetDepth_m ?? ""}</td>
                  <td>{row.NetLength_m ?? ""}</td>
                  <td>{row.Placement_SMB}</td>
                  <td>{row.Placement_ShoreOpen}</td>
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
        <FishEntryGillnetModal
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
