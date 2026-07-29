import "../../styles/SurveyInfoStep.css";
import { useEffect, useMemo, useState } from "react";

import type { LocationRecord } from "../../types/location";
import type { SurveyInfoRecord } from "../../types/survey";
import {
  getReferenceList,
  loadReferenceDataResilient,
} from "../../services/referenceDataService";

type SurveyInfoStepProps = {
  location: LocationRecord;
  onBack: () => void;
  initialSurvey?: SurveyInfoRecord | null;
  onSurveySaved?: (surveyInfo: SurveyInfoRecord) => void;
};

type DataEntryLists = {
  Collectors: string[];
  IdentifiedBy: string[];
  Project: string[];
  SamplingMethod: string[];
  Taxa: string[];
  Equipment: string[];
  TargetSpecies: string[];
  StorageLocation: string[];
  Visibility: string[];
  HydrologicFeature: string[];
  DominantSubstrate: string[];
  SubstrateCompaction: string[];
  WoodyDebris: string[];
  BeaverActivity: string[];
  TemporaryPools: string[];
  BankStability: string[];
  Riparian: string[];
  Landuse: string[];
  WoodlandExtent: string[];
  Weather: string[];
};

const fallbackLists: DataEntryLists = {
  Collectors: [],
  IdentifiedBy: [],
  Project: ["General Survey"],
  SamplingMethod: [],
  Taxa: ["mussel"],
  Equipment: [],
  TargetSpecies: ["None"],
  StorageLocation: [],
  Visibility: [],
  HydrologicFeature: [],
  DominantSubstrate: [],
  SubstrateCompaction: [],
  WoodyDebris: ["n/a", "low", "average", "high"],
  BeaverActivity: ["n/a", "none", "evidence", "dams in stream"],
  TemporaryPools: ["n/a", "none", "present"],
  BankStability: [],
  Riparian: [],
  Landuse: [],
  WoodlandExtent: [],
  Weather: ["1", "2", "3", "4"],
};

type CachedSurveyDefaults = {
  IdentifiedBy?: string;
  Collectors?: string[];
  Project?: string;
  SamplingMethod?: string[];
  Taxa?: string;
  TargetSpecies?: string;
  Equipment?: string;
  StorageLocation?: string;
};

const REQUIRED_SURVEY_CACHE_KEY = "naiadd.survey.requiredDefaults.v1";
const CURRENT_SURVEY_INFO_KEY = "naiadd.currentSurveyInfo.v1";

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
}

function normalizeMultiValue(value: unknown): string[] {
  if (Array.isArray(value)) return cleanList(value);

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item, index, array) => array.indexOf(item) === index);
  }

  return [];
}

function readSurveyDefaults(): CachedSurveyDefaults {
  try {
    const raw = localStorage.getItem(REQUIRED_SURVEY_CACHE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as CachedSurveyDefaults;

    return {
      IdentifiedBy: String(parsed.IdentifiedBy ?? ""),
      Collectors: cleanList(parsed.Collectors),
      Project: String(parsed.Project ?? ""),
      SamplingMethod: cleanList(parsed.SamplingMethod),
      Taxa: String(parsed.Taxa ?? ""),
      TargetSpecies: String(parsed.TargetSpecies ?? ""),
      Equipment: String(parsed.Equipment ?? ""),
      StorageLocation: String(parsed.StorageLocation ?? ""),
    };
  } catch {
    return {};
  }
}

function writeSurveyDefaults(values: CachedSurveyDefaults): void {
  try {
    localStorage.setItem(REQUIRED_SURVEY_CACHE_KEY, JSON.stringify(values));
  } catch {
    // Storage can be unavailable in private or restricted browser sessions.
  }
}

function mergeLists(
  raw: Partial<Record<keyof DataEntryLists, unknown>>,
): DataEntryLists {
  const resolved = { ...fallbackLists };

  (Object.keys(resolved) as (keyof DataEntryLists)[]).forEach((key) => {
    const values = cleanList(raw[key]);
    if (values.length > 0) resolved[key] = values;
  });

  return resolved;
}

type MultiPicklistProps = {
  title: string;
  required?: boolean;
  options: string[];
  selected: string[] | string | null | undefined;
  onChange: (selected: string[]) => void;
  note?: string;
};

function MultiPicklist({
  title,
  required = false,
  options,
  selected,
  onChange,
  note,
}: MultiPicklistProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const safeSelected = useMemo(() => normalizeMultiValue(selected), [selected]);
  const safeOptions = useMemo(() => cleanList(options), [options]);
  const filteredOptions = safeOptions.filter((option) =>
    option.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function toggleValue(value: string) {
    onChange(
      safeSelected.includes(value)
        ? safeSelected.filter((item) => item !== value)
        : [...safeSelected, value],
    );
  }

  return (
    <div className="multiSelectField">
      <label className="multiSelectLabel">
        {title}
        {required ? " *" : ""}
      </label>

      <button
        type="button"
        className="multiSelectButton"
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          {safeSelected.length > 0
            ? `${safeSelected.length} selected`
            : `Select ${title}`}
        </span>
        <span>{open ? "⌃" : "⌄"}</span>
      </button>

      {safeSelected.length > 0 && (
        <div className="multiSelectSelected">
          {safeSelected.map((item) => (
            <button
              key={item}
              type="button"
              className="multiSelectChip"
              onClick={() => toggleValue(item)}
            >
              {item} ×
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="multiSelectMenu">
          <input
            className="multiSelectSearch"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${title.toLowerCase()}...`}
          />

          <div className="multiSelectOptions">
            {filteredOptions.length === 0 ? (
              <div className="multiSelectEmpty">No matches found.</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`multiSelectOption ${
                    safeSelected.includes(option) ? "active" : ""
                  }`}
                  onClick={() => toggleValue(option)}
                >
                  <span>{safeSelected.includes(option) ? "✓" : "+"}</span>
                  {option}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {note && <div className="formSectionNote">{note}</div>}
    </div>
  );
}

function SurveyInfoStep({
  location,
  onBack,
  initialSurvey,
  onSurveySaved,
}: SurveyInfoStepProps) {
  const today = new Date().toISOString().slice(0, 10);
  const cachedDefaults = useMemo(() => readSurveyDefaults(), []);

  const [lists, setLists] = useState<DataEntryLists>(fallbackLists);
  const [saveMessage, setSaveMessage] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [listMessage, setListMessage] = useState(
    "Loading reference-data lists...",
  );

  const [form, setForm] = useState(() => ({
    SurveyDate: today,
    IdentifiedBy: cachedDefaults.IdentifiedBy || "",
    Collectors: cachedDefaults.Collectors || ([] as string[]),
    Project: cachedDefaults.Project || "General Survey",
    SamplingMethod: cachedDefaults.SamplingMethod || ([] as string[]),

    // Closest current NAIADD dictionary match for the former Survey Type.
    Taxa: cachedDefaults.Taxa || "mussel",

    // Transitional fields retained because the current dictionary has no
    // separate survey-level target taxon or equipment columns.
    TargetSpecies: cachedDefaults.TargetSpecies || "None",
    Equipment: cachedDefaults.Equipment || "",
    EffortSeconds: "",

    StorageLocation: cachedDefaults.StorageLocation || "",
    TotalTime: "",
    Comments: "",
    SiteComments: "",
    AirTemp: "",
    Visibility: "",
    WaterTemp: "",
    PH: "",
    DO: "",
    Conductivity: "",
    SpecificConductivity: "",
    Turbidity: "",
    TotalDissolvedSolids: "",
    HabitatNotes: "",
    WidthRange: "",
    BankfullWidth: "",
    SectionWidth: "",
    SectionLength: "",
    HydrologicFeature: "",
    RifflePercent: "",
    RunPercent: "",
    PoolPercent: "",
    SlackPercent: "",
    Depth: "",
    RiffleDepth: "",
    RunDepth: "",
    PoolDepth: "",
    AverageDepth: "",
    DepthUnderTwoFeet_Percent: "",
    DominantSubstrate: "",
    SubstrateCompaction: "",
    Embededness: "",
    WoodyDebris: "n/a",
    BeaverActivity: "n/a",
    TemporaryPools: "n/a",
    BankHeight: "",
    BankStability: "",
    CrayfishBurrows: "",
    BufferWidth_Left: "",
    BufferWidth_Right: "",
    Riparian: "",
    RiparianOther: "",
    Landuse: "",
    PercentCover: "",
    WoodlandExtent: "",
    Weather: "",
    ...(initialSurvey ?? {}),
  }));

  useEffect(() => {
    let cancelled = false;

    async function loadLists() {
      setListMessage("Loading Reference Data…");

      try {
        const referenceData = await loadReferenceDataResilient();
        if (cancelled) return;

        const general = referenceData.snapshot.generalLists;
        const species = referenceData.snapshot.species;

        const collectorValues = getReferenceList(general, [
          "collectors",
          "collector",
          "surveyors",
          "surveyor",
        ]);

        const identifiedByValues = getReferenceList(general, [
          "identified by",
          "identifiedby",
          "identifiers",
          "identifier",
        ]);

        const speciesValues = species
          .map((record) => String(record.CommonName || "").trim())
          .filter(Boolean);

        const rawLists: Partial<Record<keyof DataEntryLists, unknown>> = {
          Collectors: collectorValues,
          IdentifiedBy:
            identifiedByValues.length > 0
              ? identifiedByValues
              : collectorValues,
          Project: getReferenceList(general, ["project", "projects"]),
          SamplingMethod: getReferenceList(general, [
            "sampling method",
            "sampling methods",
            "samplingmethod",
            "gear type",
            "geartype",
          ]),
          Taxa: getReferenceList(general, ["taxa", "taxon", "survey type"]),
          Equipment: getReferenceList(general, ["equipment", "equipment list"]),
          TargetSpecies:
            speciesValues.length > 0
              ? ["None", ...speciesValues]
              : getReferenceList(general, [
                  "target species",
                  "target taxon",
                  "targetspecies",
                ]),
          StorageLocation: getReferenceList(general, [
            "storage location",
            "storagelocation",
          ]),
          Visibility: getReferenceList(general, ["visibility"]),
          HydrologicFeature: getReferenceList(general, [
            "hydrologic feature",
            "hydrologicfeature",
          ]),
          DominantSubstrate: getReferenceList(general, [
            "dominant substrate",
            "dominantsubstrate",
          ]),
          SubstrateCompaction: getReferenceList(general, [
            "substrate compaction",
            "substratecompaction",
          ]),
          WoodyDebris: getReferenceList(general, ["woody debris", "woodydebris"]),
          BeaverActivity: getReferenceList(general, [
            "beaver activity",
            "beaveractivity",
          ]),
          TemporaryPools: getReferenceList(general, [
            "temporary pools",
            "temporarypools",
          ]),
          BankStability: getReferenceList(general, [
            "bank stability",
            "bankstability",
          ]),
          Riparian: getReferenceList(general, ["riparian"]),
          Landuse: getReferenceList(general, ["landuse", "land use"]),
          WoodlandExtent: getReferenceList(general, [
            "woodland extent",
            "woodlandextent",
          ]),
          Weather: getReferenceList(general, ["weather"]),
        };

        const resolved = mergeLists(rawLists);
        setLists(resolved);

        const connected = Object.entries(rawLists).filter(
          ([, values]) => cleanList(values).length > 0,
        ).length;

        const sourceLabel =
          referenceData.source === "firestore"
            ? "Firestore"
            : referenceData.source === "cache"
              ? "local cache"
              : "bundled defaults";

        setListMessage(
          connected > 0
            ? `Loaded ${connected} survey reference list${connected === 1 ? "" : "s"} from ${sourceLabel}.`
            : `Reference Data loaded from ${sourceLabel}; unmatched fields are using safe fallback values.`,
        );

        console.info("NAIADD Survey Reference Data", {
          source: referenceData.source,
          availableKeys: Object.keys(general),
          speciesCount: species.length,
          connectedLists: Object.fromEntries(
            Object.entries(rawLists).map(([key, values]) => [
              key,
              cleanList(values).length,
            ]),
          ),
        });
      } catch (error) {
        if (cancelled) return;

        console.error("Unable to load NAIADD survey reference data:", error);
        setLists(fallbackLists);
        setListMessage(
          error instanceof Error
            ? `Reference Data error: ${error.message}`
            : "Reference Data could not be loaded.",
        );
      }
    }

    void loadLists();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      Project: String(current.Project || lists.Project[0] || "General Survey"),
      Taxa: String(current.Taxa || lists.Taxa[0] || "mussel"),
      TargetSpecies: String(
        current.TargetSpecies || lists.TargetSpecies[0] || "None",
      ),
    }));
  }, [lists]);

  const collectors = normalizeMultiValue(form.Collectors);
  const collectorCount = collectors.length;

  const totalPersonHours = useMemo(() => {
    const hours = Number(form.TotalTime);
    if (!Number.isFinite(hours) || hours < 0 || collectorCount === 0) return "";
    return (hours * collectorCount).toFixed(2);
  }, [form.TotalTime, collectorCount]);

  const requiredCompleteCount = [
    form.SurveyDate,
    form.IdentifiedBy,
    collectors.length > 0 ? "Collectors" : "",
    form.Project,
    normalizeMultiValue(form.SamplingMethod).length > 0
      ? "Sampling Method"
      : "",
    form.Taxa,
    form.TargetSpecies,
  ].filter(Boolean).length;

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyCachedDefaults() {
    const cached = readSurveyDefaults();
    setForm((current) => ({
      ...current,
      IdentifiedBy: cached.IdentifiedBy || current.IdentifiedBy,
      Collectors: cached.Collectors?.length ? cached.Collectors : current.Collectors,
      Project: cached.Project || current.Project,
      SamplingMethod: cached.SamplingMethod?.length
        ? cached.SamplingMethod
        : current.SamplingMethod,
      Taxa: cached.Taxa || current.Taxa,
      TargetSpecies: cached.TargetSpecies || current.TargetSpecies,
      Equipment: cached.Equipment || current.Equipment,
      StorageLocation: cached.StorageLocation || current.StorageLocation,
    }));
  }

  const numberInput = (
    field: keyof typeof form,
    label: string,
    options?: { min?: number; max?: number; step?: number },
  ) => (
    <label>
      {label}
      <input
        className="input"
        type="number"
        min={options?.min}
        max={options?.max}
        step={options?.step ?? "any"}
        value={String(form[field] ?? "")}
        onChange={(event) => updateField(field, event.target.value)}
      />
    </label>
  );

  function validateAndSave() {
    const samplingMethods = normalizeMultiValue(form.SamplingMethod);
    const missing: string[] = [];

    if (!form.SurveyDate) missing.push("Survey Date");
    if (!form.IdentifiedBy) missing.push("Identified By");
    if (collectors.length === 0) missing.push("Collectors");
    if (!form.Project) missing.push("Project");
    if (samplingMethods.length === 0) missing.push("Sampling Method");
    if (!form.Taxa) missing.push("Taxa Surveyed");
    if (!form.TargetSpecies) missing.push("Target Species");

    if (missing.length > 0) {
      setSaveMessage("");
      setValidationMessage(`Please complete: ${missing.join(", ")}.`);
      return;
    }

    const surveyInfo: SurveyInfoRecord = {
      SurveyDate: String(form.SurveyDate),
      IdentifiedBy: String(form.IdentifiedBy),
      Collectors: collectors.join(", "),
      Project: String(form.Project),
      SamplingMethod: samplingMethods.join(", "),
      Taxa: String(form.Taxa),

      // Transitional survey fields awaiting final dictionary consolidation.
      TargetSpecies: String(form.TargetSpecies || "None"),
      Equipment: form.Equipment ? String(form.Equipment) : null,
      EffortSeconds: form.EffortSeconds ? Number(form.EffortSeconds) : null,

      NumberOfCollectors: collectorCount,
      TotalTime: form.TotalTime ? Number(form.TotalTime) : null,
      TotalPersonHours: totalPersonHours ? Number(totalPersonHours) : null,
      StorageLocation: form.StorageLocation ? String(form.StorageLocation) : null,
      Comments: form.Comments ? String(form.Comments) : null,
      SiteComments: form.SiteComments ? String(form.SiteComments) : null,
      AirTemp: form.AirTemp ? String(form.AirTemp) : null,
      Visibility: form.Visibility ? String(form.Visibility) : null,
      WaterTemp: form.WaterTemp ? Number(form.WaterTemp) : null,
      PH: form.PH ? Number(form.PH) : null,
      DO: form.DO ? Number(form.DO) : null,
      Conductivity: form.Conductivity ? Number(form.Conductivity) : null,
      SpecificConductivity: form.SpecificConductivity
        ? Number(form.SpecificConductivity)
        : null,
      Turbidity: form.Turbidity ? Number(form.Turbidity) : null,
      TotalDissolvedSolids: form.TotalDissolvedSolids
        ? Number(form.TotalDissolvedSolids)
        : null,
      HabitatNotes: form.HabitatNotes ? String(form.HabitatNotes) : null,
      WidthRange: form.WidthRange ? String(form.WidthRange) : null,
      BankfullWidth: form.BankfullWidth ? String(form.BankfullWidth) : null,
      SectionWidth: form.SectionWidth ? Number(form.SectionWidth) : null,
      SectionLength: form.SectionLength ? Number(form.SectionLength) : null,
      Area:
        form.SectionWidth && form.SectionLength
          ? Number(form.SectionWidth) * Number(form.SectionLength)
          : null,
      HydrologicFeature: form.HydrologicFeature
        ? String(form.HydrologicFeature)
        : null,
      RifflePercent: form.RifflePercent ? String(form.RifflePercent) : null,
      RunPercent: form.RunPercent ? String(form.RunPercent) : null,
      PoolPercent: form.PoolPercent ? String(form.PoolPercent) : null,
      SlackPercent: form.SlackPercent ? String(form.SlackPercent) : null,
      Depth: form.Depth ? String(form.Depth) : null,
      RiffleDepth: form.RiffleDepth ? Number(form.RiffleDepth) : null,
      RunDepth: form.RunDepth ? Number(form.RunDepth) : null,
      PoolDepth: form.PoolDepth ? Number(form.PoolDepth) : null,
      AverageDepth: form.AverageDepth ? String(form.AverageDepth) : null,
      DepthUnderTwoFeet_Percent: form.DepthUnderTwoFeet_Percent
        ? String(form.DepthUnderTwoFeet_Percent)
        : null,
      DominantSubstrate: form.DominantSubstrate
        ? String(form.DominantSubstrate)
        : null,
      SubstrateCompaction: form.SubstrateCompaction
        ? String(form.SubstrateCompaction)
        : null,
      Embededness: form.Embededness ? Number(form.Embededness) : null,
      WoodyDebris: form.WoodyDebris ? String(form.WoodyDebris) : null,
      BeaverActivity: form.BeaverActivity ? String(form.BeaverActivity) : null,
      TemporaryPools: form.TemporaryPools ? String(form.TemporaryPools) : null,
      BankHeight: form.BankHeight ? String(form.BankHeight) : null,
      BankStability: form.BankStability ? String(form.BankStability) : null,
      CrayfishBurrows: form.CrayfishBurrows || null,
      BufferWidth_Left: form.BufferWidth_Left
        ? Number(form.BufferWidth_Left)
        : null,
      BufferWidth_Right: form.BufferWidth_Right
        ? Number(form.BufferWidth_Right)
        : null,
      Riparian: form.Riparian ? String(form.Riparian) : null,
      RiparianOther: form.RiparianOther ? String(form.RiparianOther) : null,
      Landuse: form.Landuse ? String(form.Landuse) : null,
      PercentCover: form.PercentCover ? String(form.PercentCover) : null,
      WoodlandExtent: form.WoodlandExtent ? String(form.WoodlandExtent) : null,
      Weather: form.Weather ? String(form.Weather) : null,
    };

    writeSurveyDefaults({
      IdentifiedBy: String(form.IdentifiedBy),
      Collectors: collectors,
      Project: String(form.Project),
      SamplingMethod: samplingMethods,
      Taxa: String(form.Taxa),
      TargetSpecies: String(form.TargetSpecies),
      Equipment: String(form.Equipment || ""),
      StorageLocation: String(form.StorageLocation || ""),
    });

    try {
      localStorage.setItem(
        CURRENT_SURVEY_INFO_KEY,
        JSON.stringify({
          locationSiteId: location.SiteID,
          savedAt: new Date().toISOString(),
          surveyInfo,
        }),
      );
    } catch {
      // The survey session callback remains authoritative if storage is blocked.
    }

    setValidationMessage("");
    setSaveMessage("Survey information saved locally.");
    onSurveySaved?.(surveyInfo);
  }

  return (
    <main className="app surveyInfoStep">
      <button type="button" className="backButton" onClick={onBack}>
        ← Back to Location
      </button>

      <section className="existingSiteCard savedLocationCard">
        <h2>Saved Location</h2>
        <div className="savedLocationBanner">
          <div className="savedLocationIcon">⌖</div>
          <div>
            <strong>{location.SiteName || "Unknown Site"}</strong>
            <p>{location.Waterbody || "Unknown Waterbody"}</p>
          </div>
        </div>
      </section>

      <section className="stepHeader">
        <div className="stepIcon">📋</div>
        <div>
          <p className="stepKicker">Data Entry</p>
          <h1>Step 2 — Survey Information</h1>
          <p>
            Complete the required collection details, then add any available
            effort, water-quality, habitat, and site measurements.
          </p>
        </div>
      </section>

      <div className="surveyReferenceStatus">{listMessage}</div>

      <section className="existingSiteCard requiredFieldsCard">
        <div className="requiredHeader">
          <div>
            <p className="sectionKicker">Start Here</p>
            <h2>Required Survey Information</h2>
          </div>
          <span className="requiredBadge">{requiredCompleteCount} of 7</span>
        </div>

        <div className="cacheHelperBar">
          <div>
            <strong>Last survey defaults</strong>
            <span>Reuse personnel, project, method, taxa, and storage values.</span>
          </div>
          <button
            type="button"
            className="cacheHelperButton"
            onClick={applyCachedDefaults}
          >
            Reuse Last Values
          </button>
        </div>

        <div className="detailsGrid requiredDetailsGrid">
          <label>
            Survey Date *
            <input
              className="input"
              type="date"
              value={String(form.SurveyDate)}
              onChange={(event) => updateField("SurveyDate", event.target.value)}
            />
          </label>

          <label>
            Identified By *
            <select
              className="input"
              value={String(form.IdentifiedBy)}
              onChange={(event) => updateField("IdentifiedBy", event.target.value)}
            >
              <option value="">Select Identifier</option>
              {lists.IdentifiedBy.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label>
            Project *
            <select
              className="input"
              value={String(form.Project)}
              onChange={(event) => updateField("Project", event.target.value)}
            >
              <option value="">Select Project</option>
              {lists.Project.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label>
            Taxa Surveyed *
            <select
              className="input"
              value={String(form.Taxa)}
              onChange={(event) => updateField("Taxa", event.target.value)}
            >
              <option value="">Select Taxa</option>
              {lists.Taxa.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label>
            Target Species *
            <select
              className="input"
              value={String(form.TargetSpecies)}
              onChange={(event) => updateField("TargetSpecies", event.target.value)}
            >
              <option value="">Select Target Species</option>
              {lists.TargetSpecies.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>

        <MultiPicklist
          title="Collectors"
          required
          options={lists.Collectors}
          selected={form.Collectors}
          onChange={(selected) =>
            setForm((current) => ({ ...current, Collectors: selected }))
          }
          note={`${collectorCount} collector${collectorCount === 1 ? "" : "s"} selected. The count is calculated automatically.`}
        />

        <MultiPicklist
          title="Sampling Method"
          required
          options={lists.SamplingMethod}
          selected={form.SamplingMethod}
          onChange={(selected) =>
            setForm((current) => ({ ...current, SamplingMethod: selected }))
          }
        />
      </section>

      <details className="existingSiteCard" open>
        <summary className="detailsSummary">Survey Effort and Collection</summary>
        <div className="detailsGrid detailsPad">
          <label>
            Equipment
            <select
              className="input"
              value={String(form.Equipment)}
              onChange={(event) => updateField("Equipment", event.target.value)}
            >
              <option value="">Select Equipment</option>
              {lists.Equipment.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label>
            Number of Collectors
            <input className="input locked" value={collectorCount} readOnly />
          </label>

          {numberInput("TotalTime", "Total Survey Time (hours)", { min: 0 })}

          <label>
            Total Person Hours
            <input className="input locked" value={totalPersonHours} readOnly />
          </label>

          {numberInput("EffortSeconds", "Timed Effort (seconds)", { min: 0 })}

          <label>
            Storage Location
            <select
              className="input"
              value={String(form.StorageLocation)}
              onChange={(event) => updateField("StorageLocation", event.target.value)}
            >
              <option value="">Select Storage Location</option>
              {lists.StorageLocation.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="detailsGrid detailsPad">
          <label>
            Comments
            <textarea
              className="input"
              value={String(form.Comments)}
              onChange={(event) => updateField("Comments", event.target.value)}
            />
          </label>
          <label>
            Site Comments
            <textarea
              className="input"
              value={String(form.SiteComments)}
              onChange={(event) => updateField("SiteComments", event.target.value)}
            />
          </label>
        </div>
      </details>

      <details className="existingSiteCard">
        <summary className="detailsSummary">Water and Field Conditions</summary>
        <div className="detailsGrid detailsPad">
          <label>
            Air Temperature
            <input className="input" value={String(form.AirTemp)} onChange={(e) => updateField("AirTemp", e.target.value)} />
          </label>
          <label>
            Visibility
            <select className="input" value={String(form.Visibility)} onChange={(e) => updateField("Visibility", e.target.value)}>
              <option value="">Select Visibility</option>
              {lists.Visibility.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          {numberInput("WaterTemp", "Water Temperature")}
          {numberInput("PH", "pH")}
          {numberInput("DO", "Dissolved Oxygen")}
          {numberInput("Conductivity", "Conductivity")}
          {numberInput("SpecificConductivity", "Specific Conductivity")}
          {numberInput("Turbidity", "Turbidity")}
          {numberInput("TotalDissolvedSolids", "Total Dissolved Solids")}
          <label>
            Weather Code
            <select className="input" value={String(form.Weather)} onChange={(e) => updateField("Weather", e.target.value)}>
              <option value="">Select Weather</option>
              {lists.Weather.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>
      </details>

      <details className="existingSiteCard">
        <summary className="detailsSummary">Survey Area and Hydrology</summary>
        <div className="detailsGrid detailsPad">
          <label>Width Range<input className="input" value={String(form.WidthRange)} onChange={(e) => updateField("WidthRange", e.target.value)} /></label>
          <label>Bankfull Width<input className="input" value={String(form.BankfullWidth)} onChange={(e) => updateField("BankfullWidth", e.target.value)} /></label>
          {numberInput("SectionWidth", "Section Width")}
          {numberInput("SectionLength", "Section Length")}
          <label>
            Hydrologic Feature
            <select className="input" value={String(form.HydrologicFeature)} onChange={(e) => updateField("HydrologicFeature", e.target.value)}>
              <option value="">Select Hydrologic Feature</option>
              {lists.HydrologicFeature.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          {numberInput("RifflePercent", "Riffle Percent", { min: 0, max: 100 })}
          {numberInput("RunPercent", "Run Percent", { min: 0, max: 100 })}
          {numberInput("PoolPercent", "Pool Percent", { min: 0, max: 100 })}
          {numberInput("SlackPercent", "Slack Percent", { min: 0, max: 100 })}
          <label>Depth Description<input className="input" value={String(form.Depth)} onChange={(e) => updateField("Depth", e.target.value)} /></label>
          {numberInput("RiffleDepth", "Riffle Depth")}
          {numberInput("RunDepth", "Run Depth")}
          {numberInput("PoolDepth", "Pool Depth")}
          <label>Average Depth<input className="input" value={String(form.AverageDepth)} onChange={(e) => updateField("AverageDepth", e.target.value)} /></label>
          {numberInput("DepthUnderTwoFeet_Percent", "Depth Under Two Feet (%)", { min: 0, max: 100 })}
        </div>
      </details>

      <details className="existingSiteCard">
        <summary className="detailsSummary">Habitat and Riparian Conditions</summary>
        <div className="detailsGrid detailsPad">
          <label>
            Dominant Substrate
            <select className="input" value={String(form.DominantSubstrate)} onChange={(e) => updateField("DominantSubstrate", e.target.value)}>
              <option value="">Select Dominant Substrate</option>
              {lists.DominantSubstrate.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            Substrate Compaction
            <select className="input" value={String(form.SubstrateCompaction)} onChange={(e) => updateField("SubstrateCompaction", e.target.value)}>
              <option value="">Select Compaction</option>
              {lists.SubstrateCompaction.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          {numberInput("Embededness", "Embeddedness (%)", { min: 0, max: 100 })}
          <label>
            Woody Debris
            <select className="input" value={String(form.WoodyDebris)} onChange={(e) => updateField("WoodyDebris", e.target.value)}>
              {lists.WoodyDebris.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            Beaver Activity
            <select className="input" value={String(form.BeaverActivity)} onChange={(e) => updateField("BeaverActivity", e.target.value)}>
              {lists.BeaverActivity.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            Temporary Pools
            <select className="input" value={String(form.TemporaryPools)} onChange={(e) => updateField("TemporaryPools", e.target.value)}>
              {lists.TemporaryPools.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>Bank Height<input className="input" value={String(form.BankHeight)} onChange={(e) => updateField("BankHeight", e.target.value)} /></label>
          <label>
            Bank Stability
            <select className="input" value={String(form.BankStability)} onChange={(e) => updateField("BankStability", e.target.value)}>
              <option value="">Select Bank Stability</option>
              {lists.BankStability.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            Crayfish Burrows
            <select className="input" value={String(form.CrayfishBurrows)} onChange={(e) => updateField("CrayfishBurrows", e.target.value)}>
              <option value="">Not Recorded</option><option value="TRUE">Present</option><option value="FALSE">Absent</option>
            </select>
          </label>
          {numberInput("BufferWidth_Left", "Left Buffer Width")}
          {numberInput("BufferWidth_Right", "Right Buffer Width")}
          <label>
            Riparian
            <select className="input" value={String(form.Riparian)} onChange={(e) => updateField("Riparian", e.target.value)}>
              <option value="">Select Riparian Type</option>
              {lists.Riparian.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>Riparian Other<input className="input" value={String(form.RiparianOther)} onChange={(e) => updateField("RiparianOther", e.target.value)} /></label>
          <label>
            Land Use
            <select className="input" value={String(form.Landuse)} onChange={(e) => updateField("Landuse", e.target.value)}>
              <option value="">Select Land Use</option>
              {lists.Landuse.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          {numberInput("PercentCover", "Percent Cover", { min: 0, max: 100 })}
          <label>
            Woodland Extent
            <select className="input" value={String(form.WoodlandExtent)} onChange={(e) => updateField("WoodlandExtent", e.target.value)}>
              <option value="">Select Woodland Extent</option>
              {lists.WoodlandExtent.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <label className="detailsPad">
          Habitat Notes
          <textarea className="input" value={String(form.HabitatNotes)} onChange={(e) => updateField("HabitatNotes", e.target.value)} />
        </label>
      </details>

      {validationMessage && <div className="surveyValidationBanner">{validationMessage}</div>}
      {saveMessage && <div className="surveySaveBanner">{saveMessage}</div>}

      <section className="existingSiteCard surveySaveCard desktopStepActions">
        <button type="button" className="primaryAction" onClick={validateAndSave}>
          Save Survey Information
        </button>
      </section>

      <div className={`mobileStepFooter mobileStepFooterSingle ${validationMessage || saveMessage ? "mobileStepFooterWithMessage" : ""}`}>
        {(validationMessage || saveMessage) && (
          <div className={`mobileStepFooterMessage ${validationMessage ? "mobileStepFooterMessageError" : "mobileStepFooterMessageOk"}`} role={validationMessage ? "alert" : "status"}>
            {validationMessage || saveMessage}
          </div>
        )}
        <button type="button" className="mobileStepPrimaryAction" onClick={validateAndSave}>
          Save Survey Information
        </button>
      </div>
    </main>
  );
}

export default SurveyInfoStep;
