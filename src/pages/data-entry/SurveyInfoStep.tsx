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
  Surveyors: string[];
  Project: string[];
  SamplingMethod: string[];
  SurveyType: string[];
  Equipment: string[];
  TargetSpecies: string[];
  Weather: string[];
  Wind: string[];
  HabitatStructure: string[];
  BankStability: string[];
  LandUse: string[];
  CanopyCover: string[];
};

const fallbackLists: DataEntryLists = {
  Surveyors: [],
  Project: ["General Survey"],
  SamplingMethod: [],
  SurveyType: [],
  Equipment: [],
  TargetSpecies: ["None"],
  Weather: ["Clear", "Cloudy", "Rain", "Overcast", "Windy"],
  Wind: ["NA", "None", "Light", "Moderate", "Strong"],
  HabitatStructure: ["NA", "Low", "Moderate", "Abundant", "Very Abundant"],
  BankStability: ["NA", "Stable", "Eroding", "Vegetated", "Hard"],
  LandUse: [
    "NA",
    "Marsh",
    "Wooded Swamp",
    "Deciduous Forest",
    "Mixed Forest",
    "Cropland",
    "Pasture",
    "Urban",
  ],
  CanopyCover: ["NA", "None", "Mostly Clear", "Mostly Covered", "Full"],
};

type CachedRequiredSurveyFields = {
  Lead_Collector?: string;
  Surveyors?: string[];
  Project?: string;
  Survey_Type?: string;
  Geartype?: string[];
  TargetSpeciesNew?: string;
};

const REQUIRED_SURVEY_CACHE_KEY = "vadma_survey_required_cache";

function readRequiredSurveyCache(): CachedRequiredSurveyFields {
  try {
    const raw = localStorage.getItem(REQUIRED_SURVEY_CACHE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as CachedRequiredSurveyFields;

    return {
      Lead_Collector: String(parsed.Lead_Collector ?? ""),
      Surveyors: cleanList(parsed.Surveyors),
      Project: String(parsed.Project ?? ""),
      Survey_Type: String(parsed.Survey_Type ?? ""),
      Geartype: cleanList(parsed.Geartype),
      TargetSpeciesNew: String(parsed.TargetSpeciesNew ?? ""),
    };
  } catch {
    return {};
  }
}

function writeRequiredSurveyCache(values: CachedRequiredSurveyFields) {
  try {
    localStorage.setItem(REQUIRED_SURVEY_CACHE_KEY, JSON.stringify(values));
  } catch {
    // Local storage may be unavailable in private browsing or locked-down devices.
  }
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
}

function normalizeMultiValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return cleanList(value);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item, index, array) => array.indexOf(item) === index);
  }

  return [];
}

function mergeLists(raw: Partial<Record<keyof DataEntryLists, unknown>>) {
  return {
    Surveyors: cleanList(raw.Surveyors).length
      ? cleanList(raw.Surveyors)
      : fallbackLists.Surveyors,
    Project: cleanList(raw.Project).length
      ? cleanList(raw.Project)
      : fallbackLists.Project,
    SamplingMethod: cleanList(raw.SamplingMethod).length
      ? cleanList(raw.SamplingMethod)
      : fallbackLists.SamplingMethod,
    SurveyType: cleanList(raw.SurveyType).length
      ? cleanList(raw.SurveyType)
      : fallbackLists.SurveyType,
    Equipment: cleanList(raw.Equipment).length
      ? cleanList(raw.Equipment)
      : fallbackLists.Equipment,
    TargetSpecies: cleanList(raw.TargetSpecies).length
      ? cleanList(raw.TargetSpecies)
      : fallbackLists.TargetSpecies,
    Weather: cleanList(raw.Weather).length
      ? cleanList(raw.Weather)
      : fallbackLists.Weather,
    Wind: cleanList(raw.Wind).length ? cleanList(raw.Wind) : fallbackLists.Wind,
    HabitatStructure: cleanList(raw.HabitatStructure).length
      ? cleanList(raw.HabitatStructure)
      : fallbackLists.HabitatStructure,
    BankStability: cleanList(raw.BankStability).length
      ? cleanList(raw.BankStability)
      : fallbackLists.BankStability,
    LandUse: cleanList(raw.LandUse).length
      ? cleanList(raw.LandUse)
      : fallbackLists.LandUse,
    CanopyCover: cleanList(raw.CanopyCover).length
      ? cleanList(raw.CanopyCover)
      : fallbackLists.CanopyCover,
  };
}

type MultiPicklistProps = {
  title: string;
  required?: boolean;
  options: string[];
  selected: string[] | string | null | undefined;
  onChange: (nextSelected: string[]) => void;
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

  const safeSelected = useMemo<string[]>(() => {
    if (Array.isArray(selected)) {
      return selected
        .map((item) => String(item ?? "").trim())
        .filter(Boolean);
    }

    if (typeof selected === "string") {
      return selected
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [];
  }, [selected]);

  const safeOptions = Array.isArray(options)
    ? options
        .map((option) => String(option ?? "").trim())
        .filter(Boolean)
    : [];

  const filteredOptions = safeOptions.filter((option) =>
    option.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleValue = (value: string) => {
    if (safeSelected.includes(value)) {
      onChange(safeSelected.filter((item) => item !== value));
      return;
    }

    onChange([...safeSelected, value]);
  };

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
            onChange={(e) => setSearch(e.target.value)}
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

  const [lists, setLists] = useState<DataEntryLists>(fallbackLists);
  const [saveMessage, setSaveMessage] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [listMessage, setListMessage] = useState("Loading reference-data lists...");
  const cachedRequiredFields = useMemo(() => readRequiredSurveyCache(), []);

  const [form, setForm] = useState(() => ({
    Survey_Date: today,
    Survey_StartTime: "12:00",
    Survey_EndTime: "12:00",
    Effort: "",
    Lead_Collector: cachedRequiredFields.Lead_Collector || "",
    Surveyors: cachedRequiredFields.Surveyors || ([] as string[]),
    Survey_NumSurveyors: "",
    Project: cachedRequiredFields.Project || "General Survey",
    TotalPasses: "1",
    Comments: "",
    Survey_Type: cachedRequiredFields.Survey_Type || "",
    Geartype: cachedRequiredFields.Geartype || ([] as string[]),
    Equip: "",
    TargetSpeciesNew: cachedRequiredFields.TargetSpeciesNew || "None",
    ACDC: "DC",
    Volts: "",
    Amps: "",
    PPS: "",
    Range: "",
    Air_Temp: "",
    Weather: [] as string[],
    Wind: "NA",
    Stream_Discharge: "",
    Tide: "NA",
    Water_Temp: "",
    Conductivity_ppm: "",
    SpecificConductivity_uScm: "",
    DissolvedOxygen_mgL: "",
    pH: "",
    Secchi_cm: "",
    Salinity_ppt: "",
    Hardness_ppm: "",
    Alkalinity_ppm: "",
    Ammonia_ppm: "",
    Nitrate_ppm: "",
    Nitrite_ppm: "",
    Phosphorus_ppm: "",
    ReachLength_m: "",
    AvgChannelWidth_m: "",
    AvgDepth_m: "",
    MinDepth_m: "",
    MaxDepth_m: "",
    Flow_CFS: "",
    HabitatStructure: "NA",
    BankStability: "NA",
    LandUse: "NA",
    CanopyCover: "NA",
    UndercutBanks: "",
    LargeRocks: "",
    WoodyDebris: "",
    CypressKnees: "",
    SubmergedTreeRoots: "",
    SubmergedTerrestrialVegetation: "",
    EmergentMacrophytes: "",
    SubmergedMacrophytes: "",
    FloatingMacrophytes: "",
    Algae: "",
    BeaverLodge: "",
    DockOrPier: "",
    BridgeAbutment: "",
    NoStructure: "",
    Wetlands_L: "",
    Wetlands_R: "",
    ForestedWetlands_L: "",
    ForestedWetlands_R: "",
    ShrubOrScrub_L: "",
    ShrubOrScrub_R: "",
    Forested_L: "",
    Forested_R: "",
    Cropland_L: "",
    Cropland_R: "",
    Pastureland_L: "",
    Pastureland_R: "",
    Developed_L: "",
    Developed_R: "",
    Disturbed_L: "",
    Disturbed_R: "",
    Logged_L: "",
    Logged_R: "",
    OpenOrBarren_L: "",
    OpenOrBarren_R: "",
    Impervious_L: "",
    Impervious_R: "",
    ...(initialSurvey ?? {}),
  }));

  useEffect(() => {
    let cancelled = false;

    async function loadLists() {
      setListMessage("Loading Reference Data…");

      try {
        const referenceData = await loadReferenceDataResilient();

        if (cancelled) return;

        const general = referenceData.generalLists;

        const rawLists: Partial<Record<keyof DataEntryLists, unknown>> = {
          Surveyors: getReferenceList(general, [
            "surveyors",
            "surveyor",
            "lead biologist",
            "lead biologists",
            "collectors",
          ]),
          Project: getReferenceList(general, ["project", "projects"]),
          SamplingMethod: getReferenceList(general, [
            "sampling method",
            "sampling methods",
            "samplingmethod",
            "gear type",
            "geartype",
          ]),
          SurveyType: getReferenceList(general, [
            "survey type",
            "survey types",
            "surveytype",
          ]),
          Equipment: getReferenceList(general, [
            "equipment",
            "equipment list",
          ]),
          TargetSpecies: getReferenceList(general, [
            "target species",
            "targetspecies",
            "target species list",
          ]),
          Weather: getReferenceList(general, [
            "weather",
            "condition",
            "conditions",
          ]),
          Wind: getReferenceList(general, ["wind"]),
          HabitatStructure: getReferenceList(general, [
            "habitat structure",
            "habitatstructure",
          ]),
          BankStability: getReferenceList(general, [
            "bank stability",
            "bankstability",
          ]),
          LandUse: getReferenceList(general, ["land use", "landuse"]),
          CanopyCover: getReferenceList(general, [
            "canopy cover",
            "canopycover",
          ]),
        };

        const resolvedLists = mergeLists(rawLists);
        setLists(resolvedLists);

        const connectedGroups = Object.entries(rawLists)
          .filter(([, values]) => cleanList(values).length > 0)
          .map(([name, values]) => `${name} (${cleanList(values).length})`);

        const availableKeys = Object.keys(general);

        console.info("VADMA Survey Reference Data", {
          availableKeys,
          connectedGroups,
          counts: Object.fromEntries(
            Object.entries(general).map(([key, values]) => [
              key,
              values.length,
            ]),
          ),
        });

        setListMessage(
          connectedGroups.length > 0
            ? `Connected to Reference Data: ${connectedGroups.join(", ")}.`
            : availableKeys.length > 0
              ? `Reference Data loaded, but no survey lists matched. Available IDs: ${availableKeys.join(", ")}`
              : "Reference Data loaded, but it contained no general lists.",
        );
      } catch (error) {
        if (!cancelled) {
          console.error("Unable to load survey reference-data lists:", error);
          setLists(fallbackLists);
          setListMessage(
            error instanceof Error
              ? `Reference Data error: ${error.message}`
              : "Reference Data could not be loaded.",
          );
        }
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
      Project: current.Project || lists.Project[0] || "General Survey",
      TargetSpeciesNew:
        current.TargetSpeciesNew || lists.TargetSpecies[0] || "None",
      Wind: current.Wind || lists.Wind[0] || "NA",
      HabitatStructure:
        current.HabitatStructure || lists.HabitatStructure[0] || "NA",
      BankStability: current.BankStability || lists.BankStability[0] || "NA",
      LandUse: current.LandUse || lists.LandUse[0] || "NA",
      CanopyCover: current.CanopyCover || lists.CanopyCover[0] || "NA",
    }));
  }, [lists]);

  const watts = useMemo(() => {
    const volts = Number(form.Volts);
    const amps = Number(form.Amps);

    if (!Number.isFinite(volts) || !Number.isFinite(amps)) {
      return "";
    }

    return String(volts * amps);
  }, [form.Volts, form.Amps]);

  const totalPersonHours = useMemo(() => {
    const start = form.Survey_StartTime;
    const end = form.Survey_EndTime;
    const n = Number(form.Survey_NumSurveyors);

    if (!start || !end || !Number.isFinite(n)) {
      return "";
    }

    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);

    let startDecimal = startHour + startMinute / 60;
    let endDecimal = endHour + endMinute / 60;

    if (endDecimal < startDecimal) {
      endDecimal += 24;
    }

    return ((endDecimal - startDecimal) * n).toFixed(2);
  }, [form.Survey_StartTime, form.Survey_EndTime, form.Survey_NumSurveyors]);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateMulti(
    field: "Surveyors" | "Geartype" | "Weather",
    value: string,
  ) {
    setForm((current) => {
      const exists = current[field].includes(value);

      return {
        ...current,
        [field]: exists
          ? current[field].filter((item) => item !== value)
          : [...current[field], value],
      };
    });
  }

  const cachedRequiredCount = [
    form.Lead_Collector,
    form.Surveyors.length > 0 ? "Surveyors" : "",
    form.Project,
    form.Survey_Type,
    form.Geartype.length > 0 ? "Sampling Method" : "",
    form.TargetSpeciesNew,
  ].filter(Boolean).length;

  function applyCachedRequiredFields() {
    const cached = readRequiredSurveyCache();

    setForm((current) => ({
      ...current,
      Lead_Collector: cached.Lead_Collector || current.Lead_Collector,
      Surveyors: cached.Surveyors?.length
        ? cached.Surveyors
        : current.Surveyors,
      Project: cached.Project || current.Project,
      Survey_Type: cached.Survey_Type || current.Survey_Type,
      Geartype: cached.Geartype?.length ? cached.Geartype : current.Geartype,
      TargetSpeciesNew: cached.TargetSpeciesNew || current.TargetSpeciesNew,
    }));
  }

  const numberInput = (field: keyof typeof form, label: string) => (
    <label>
      {label}
      <input
        className="input"
        type="number"
        value={String(form[field] ?? "")}
        onChange={(e) => updateField(field, e.target.value)}
      />
    </label>
  );

  const codeInput = (field: keyof typeof form, label: string) => (
    <label>
      {label}
      <input
        className="input"
        type="number"
        min="0"
        max="6"
        step="1"
        value={String(form[field] ?? "")}
        onChange={(e) => updateField(field, e.target.value)}
      />
    </label>
  );

  function validateAndSave() {
    const surveyors = normalizeMultiValue(form.Surveyors);
    const gearTypes = normalizeMultiValue(form.Geartype);
    const weatherValues = normalizeMultiValue(form.Weather);
    const missing: string[] = [];

    if (!form.Survey_Date) missing.push("Survey Date");
    if (!form.Lead_Collector) missing.push("Lead Biologist");
    if (surveyors.length === 0) missing.push("Surveyors");
    if (!form.Project) missing.push("Project");
    if (!form.Survey_Type) missing.push("Survey Type");
    if (gearTypes.length === 0) missing.push("Sampling Method");
    if (!form.TargetSpeciesNew) missing.push("Target Species");

    if (missing.length > 0) {
      setSaveMessage("");
      setValidationMessage(`Please complete: ${missing.join(", ")}.`);
      return;
    }

    setValidationMessage("");

    const surveyInfo: SurveyInfoRecord = {
      Survey_Date: form.Survey_Date,
      Survey_StartTime: form.Survey_StartTime,
      Survey_EndTime: form.Survey_EndTime,
      Effort: form.Effort || null,
      Surveyors: surveyors.join(", "),
      Lead_Collector: form.Lead_Collector,
      Survey_NumSurveyors: form.Survey_NumSurveyors || null,
      TotalPersonHours: totalPersonHours || null,
      Project: form.Project,
      TotalPasses: Number(form.TotalPasses) || 1,
      Comments: form.Comments || "None",
      Survey_Type: form.Survey_Type,
      Geartype: gearTypes.join(", "),
      Equip: form.Equip || null,
      TargetSpeciesNew: form.TargetSpeciesNew || "None",
      ACDC: form.ACDC || "DC",
      Volts: form.Volts || null,
      Amps: form.Amps || null,
      Watts: watts || null,
      PPS: form.PPS || null,
      Range: form.Range || null,
      Air_Temp: form.Air_Temp || null,
      Weather: weatherValues.join(", "),
      Wind: form.Wind,
      Stream_Discharge: form.Stream_Discharge || null,
      Tide: form.Tide || "NA",
      Water_Temp: form.Water_Temp || null,
      Conductivity_ppm: form.Conductivity_ppm || null,
      SpecificConductivity_uScm: form.SpecificConductivity_uScm || null,
      DissolvedOxygen_mgL: form.DissolvedOxygen_mgL || null,
      pH: form.pH || null,
      Secchi_cm: form.Secchi_cm || null,
      Salinity_ppt: form.Salinity_ppt || null,
      Hardness_ppm: form.Hardness_ppm || null,
      Alkalinity_ppm: form.Alkalinity_ppm || null,
      Ammonia_ppm: form.Ammonia_ppm || null,
      Nitrate_ppm: form.Nitrate_ppm || null,
      Nitrite_ppm: form.Nitrite_ppm || null,
      Phosphorus_ppm: form.Phosphorus_ppm || null,
      ReachLength_m: form.ReachLength_m || null,
      AvgChannelWidth_m: form.AvgChannelWidth_m || null,
      AvgDepth_m: form.AvgDepth_m || null,
      MinDepth_m: form.MinDepth_m || null,
      MaxDepth_m: form.MaxDepth_m || null,
      Flow_CFS: form.Flow_CFS || null,
      HabitatStructure: form.HabitatStructure,
      BankStability: form.BankStability,
      LandUse: form.LandUse,
      CanopyCover: form.CanopyCover,
      UndercutBanks: form.UndercutBanks || null,
      LargeRocks: form.LargeRocks || null,
      WoodyDebris: form.WoodyDebris || null,
      CypressKnees: form.CypressKnees || null,
      SubmergedTreeRoots: form.SubmergedTreeRoots || null,
      SubmergedTerrestrialVegetation:
        form.SubmergedTerrestrialVegetation || null,
      EmergentMacrophytes: form.EmergentMacrophytes || null,
      SubmergedMacrophytes: form.SubmergedMacrophytes || null,
      FloatingMacrophytes: form.FloatingMacrophytes || null,
      Algae: form.Algae || null,
      BeaverLodge: form.BeaverLodge || null,
      DockOrPier: form.DockOrPier || null,
      BridgeAbutment: form.BridgeAbutment || null,
      NoStructure: form.NoStructure || null,
      Wetlands_L: form.Wetlands_L || null,
      Wetlands_R: form.Wetlands_R || null,
      ForestedWetlands_L: form.ForestedWetlands_L || null,
      ForestedWetlands_R: form.ForestedWetlands_R || null,
      ShrubOrScrub_L: form.ShrubOrScrub_L || null,
      ShrubOrScrub_R: form.ShrubOrScrub_R || null,
      Forested_L: form.Forested_L || null,
      Forested_R: form.Forested_R || null,
      Cropland_L: form.Cropland_L || null,
      Cropland_R: form.Cropland_R || null,
      Pastureland_L: form.Pastureland_L || null,
      Pastureland_R: form.Pastureland_R || null,
      Developed_L: form.Developed_L || null,
      Developed_R: form.Developed_R || null,
      Disturbed_L: form.Disturbed_L || null,
      Disturbed_R: form.Disturbed_R || null,
      Logged_L: form.Logged_L || null,
      Logged_R: form.Logged_R || null,
      OpenOrBarren_L: form.OpenOrBarren_L || null,
      OpenOrBarren_R: form.OpenOrBarren_R || null,
      Impervious_L: form.Impervious_L || null,
      Impervious_R: form.Impervious_R || null,
    } as SurveyInfoRecord;

    writeRequiredSurveyCache({
      Lead_Collector: form.Lead_Collector,
      Surveyors: surveyors,
      Project: form.Project,
      Survey_Type: form.Survey_Type,
      Geartype: gearTypes,
      TargetSpeciesNew: form.TargetSpeciesNew,
    });

    localStorage.setItem(
      "vadma2.currentSurveyInfo",
      JSON.stringify({
        locationSiteId: location.SiteID,
        savedAt: new Date().toISOString(),
        surveyInfo,
      }),
    );

    setSaveMessage("Survey information saved locally.");
    onSurveySaved?.(surveyInfo);
  }

  return (
    <main className="app surveyInfoStep">
      {onBack && (
        <button type="button" className="backButton" onClick={onBack}>
          ← Back to Location
        </button>
      )}

      {location && (
        <section className="existingSiteCard savedLocationCard">
          <h2>Saved Location</h2>

          <div className="savedLocationBanner">
            <div className="savedLocationIcon">⌖</div>

            <div>
              <strong>
                {location.SiteName || "Unknown Site"}
              </strong>

              <p>
                {location.Waterbody || "Unknown Waterbody"}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="stepHeader">
        <div className="stepIcon">📋</div>

        <div>
          <p className="stepKicker">Data Entry</p>
          <h1>Step 2 — Survey Information</h1>
          <p>
            Enter required survey fields first, then complete effort, methods,
            and optional field conditions.
          </p>
        </div>
      </section>

      <div className="surveyReferenceStatus">{listMessage}</div>

      <section className="existingSiteCard requiredFieldsCard">
        <div className="requiredHeader">
          <div>
            <p className="sectionKicker">Start Here</p>
            <h2>Required Fields</h2>
          </div>

          <span className="requiredBadge">Required</span>
        </div>

        <div className="cacheHelperBar">
          <div>
            <strong>Last survey defaults</strong>
            <span>
              {cachedRequiredCount > 0
                ? `${cachedRequiredCount} required values are already filled from your last saved survey.`
                : "Required values will be remembered after you save this survey."}
            </span>
          </div>

          <button
            type="button"
            className="cacheHelperButton"
            onClick={applyCachedRequiredFields}
          >
            Reuse Last Required Fields
          </button>
        </div>

        <div className="detailsGrid requiredDetailsGrid">
          <label>
            Survey Date *
            <input
              className="input"
              type="date"
              value={form.Survey_Date}
              onChange={(e) => updateField("Survey_Date", e.target.value)}
            />
          </label>

          <label>
            Lead Biologist *
            <select
              className="input"
              value={form.Lead_Collector}
              onChange={(e) => updateField("Lead_Collector", e.target.value)}
            >
              <option value="">Select Lead Biologist</option>

              {lists.Surveyors.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <label>
            Project *
            <select
              className="input"
              value={form.Project}
              onChange={(e) => updateField("Project", e.target.value)}
            >
              <option value="">Select Project</option>

              {lists.Project.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <label>
            Survey Type *
            <select
              className="input"
              value={form.Survey_Type}
              onChange={(e) => updateField("Survey_Type", e.target.value)}
            >
              <option value="">Select Survey Type</option>

              {lists.SurveyType.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <label>
            Target Species *
            <select
              className="input"
              value={form.TargetSpeciesNew}
              onChange={(e) => updateField("TargetSpeciesNew", e.target.value)}
            >
              <option value="">Select Target Species</option>

              {lists.TargetSpecies.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
        </div>

        <MultiPicklist
          title="Surveyors"
          required
          options={lists.Surveyors}
          selected={form.Surveyors}
          onChange={(nextSelected) =>
            setForm((current) => ({
              ...current,
              Surveyors: nextSelected,
            }))
          }
          note="Select all crew members involved in the survey."
        />

        <MultiPicklist
          title="Sampling Method"
          required
          options={lists.SamplingMethod}
          selected={form.Geartype}
          onChange={(nextSelected) =>
            setForm((current) => ({
              ...current,
              Geartype: nextSelected,
            }))
          }
          note="Select all sampling methods used during this survey."
        />
      </section>

      <details className="existingSiteCard">
        <summary className="detailsSummary">General Survey Information</summary>

        <div className="detailsGrid detailsPad">
          <label>
            Survey Start Time
            <input
              className="input"
              type="time"
              value={form.Survey_StartTime}
              onChange={(e) => updateField("Survey_StartTime", e.target.value)}
            />
          </label>

          <label>
            Survey End Time
            <input
              className="input"
              type="time"
              value={form.Survey_EndTime}
              onChange={(e) => updateField("Survey_EndTime", e.target.value)}
            />
          </label>

          <label>
            Effort Seconds
            <input
              className="input"
              type="number"
              value={form.Effort}
              onChange={(e) => updateField("Effort", e.target.value)}
            />
          </label>

          <label>
            Number of Surveyors
            <input
              className="input"
              type="number"
              value={form.Survey_NumSurveyors}
              onChange={(e) =>
                updateField("Survey_NumSurveyors", e.target.value)
              }
            />
          </label>

          <label>
            Total Person Hours
            <input className="input locked" value={totalPersonHours} readOnly />
          </label>

          <label>
            Total Runs / Samples / Passes
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              value={form.TotalPasses}
              onChange={(e) => updateField("TotalPasses", e.target.value)}
            />
          </label>

          <label>
            Comments
            <input
              className="input"
              value={form.Comments}
              onChange={(e) => updateField("Comments", e.target.value)}
            />
          </label>
        </div>
      </details>

      <details className="existingSiteCard">
        <summary className="detailsSummary">Survey Methods</summary>

        <div className="detailsGrid detailsPad">
          <label>
            Equipment
            <select
              className="input"
              value={form.Equip}
              onChange={(e) => updateField("Equip", e.target.value)}
            >
              <option value="">Select Equipment</option>

              {lists.Equipment.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <label>
            ACDC
            <select
              className="input"
              value={form.ACDC}
              onChange={(e) => updateField("ACDC", e.target.value)}
            >
              <option>DC</option>
              <option>AC</option>
            </select>
          </label>

          <label>
            Volts
            <input
              className="input"
              type="number"
              value={form.Volts}
              onChange={(e) => updateField("Volts", e.target.value)}
            />
          </label>

          <label>
            Amps
            <input
              className="input"
              type="number"
              value={form.Amps}
              onChange={(e) => updateField("Amps", e.target.value)}
            />
          </label>

          <label>
            Watts
            <input className="input locked" value={watts} readOnly />
          </label>

          <label>
            PPS
            <input
              className="input"
              type="number"
              value={form.PPS}
              onChange={(e) => updateField("PPS", e.target.value)}
            />
          </label>

          <label>
            Range
            <input
              className="input"
              type="number"
              value={form.Range}
              onChange={(e) => updateField("Range", e.target.value)}
            />
          </label>
        </div>
      </details>

      <details className="existingSiteCard">
        <summary className="detailsSummary">
          Site Conditions and Water Quality
        </summary>

        <div className="detailsGrid detailsPad">
          {numberInput("Air_Temp", "Air Temperature °F")}

          <label>
            Wind
            <select
              className="input"
              value={form.Wind}
              onChange={(e) => updateField("Wind", e.target.value)}
            >
              {lists.Wind.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          {numberInput("Stream_Discharge", "Stream Discharge CFS")}

          <label>
            Tide
            <select
              className="input"
              value={form.Tide}
              onChange={(e) => updateField("Tide", e.target.value)}
            >
              <option value="NA">NA</option>
              <option value="High">High</option>
              <option value="Low">Low</option>
              <option value="Ebb">Ebb</option>
              <option value="Flood">Flood</option>
            </select>
          </label>
        </div>

        <div className="checkboxGroup">
          <h3>Weather</h3>

          {lists.Weather.map((x) => (
            <label key={x} className="checkPill">
              <input
                type="checkbox"
                checked={form.Weather.includes(x)}
                onChange={() => updateMulti("Weather", x)}
              />
              {x}
            </label>
          ))}
        </div>

        <details className="existingSiteCard nestedDetailsCard">
          <summary className="detailsSummary">Water Column</summary>

          <div className="detailsGrid detailsPad">
            {numberInput("Water_Temp", "Water Temperature °C")}
            {numberInput("Conductivity_ppm", "Conductivity ppm")}
            {numberInput(
              "SpecificConductivity_uScm",
              "Specific Conductivity µS/cm",
            )}
            {numberInput("DissolvedOxygen_mgL", "Dissolved Oxygen mg/L")}
            {numberInput("pH", "pH")}
            {numberInput("Secchi_cm", "Secchi cm")}
          </div>
        </details>

        <details className="existingSiteCard nestedDetailsCard">
          <summary className="detailsSummary">Water Chemistry</summary>

          <div className="detailsGrid detailsPad">
            {numberInput("Salinity_ppt", "Salinity ppt")}
            {numberInput("Hardness_ppm", "Hardness ppm")}
            {numberInput("Alkalinity_ppm", "Alkalinity ppm")}
            {numberInput("Ammonia_ppm", "Ammonia ppm")}
            {numberInput("Nitrate_ppm", "Nitrate ppm")}
            {numberInput("Nitrite_ppm", "Nitrite ppm")}
            {numberInput("Phosphorus_ppm", "Phosphorus ppm")}
          </div>
        </details>
      </details>

      <details className="existingSiteCard">
        <summary className="detailsSummary">
          Site Parameters, Habitat, and Morphology
        </summary>

        <details className="existingSiteCard nestedDetailsCard">
          <summary className="detailsSummary">Reach Information</summary>

          <div className="detailsGrid detailsPad">
            {numberInput("ReachLength_m", "Reach Length m")}
            {numberInput("AvgChannelWidth_m", "Average Channel Width m")}
            {numberInput("AvgDepth_m", "Average Depth m")}
            {numberInput("MinDepth_m", "Minimum Depth m")}
            {numberInput("MaxDepth_m", "Maximum Depth m")}
            {numberInput("Flow_CFS", "Flow CFS")}
          </div>
        </details>

        <div className="detailsGrid detailsPad">
          <label>
            Habitat Structure
            <select
              className="input"
              value={form.HabitatStructure}
              onChange={(e) => updateField("HabitatStructure", e.target.value)}
            >
              {lists.HabitatStructure.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <label>
            Bank Stability
            <select
              className="input"
              value={form.BankStability}
              onChange={(e) => updateField("BankStability", e.target.value)}
            >
              {lists.BankStability.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <label>
            Land Use
            <select
              className="input"
              value={form.LandUse}
              onChange={(e) => updateField("LandUse", e.target.value)}
            >
              {lists.LandUse.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <label>
            Canopy Cover
            <select
              className="input"
              value={form.CanopyCover}
              onChange={(e) => updateField("CanopyCover", e.target.value)}
            >
              {lists.CanopyCover.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
        </div>

        <details className="existingSiteCard nestedDetailsCard">
          <summary className="detailsSummary">Habitat Details</summary>

          <p className="formSectionNote">
            Coverage code: 0=None; 1=&lt;10%; 2=10–25%; 3=26–75%; 4=76–90%;
            5=&gt;90%; 6=100%.
          </p>

          <div className="detailsGrid detailsPad">
            {codeInput("UndercutBanks", "Undercut Banks")}
            {codeInput("LargeRocks", "Large Rocks")}
            {codeInput("WoodyDebris", "Woody Debris")}
            {codeInput("CypressKnees", "Cypress Knees")}
            {codeInput("SubmergedTreeRoots", "Submerged Tree Roots")}
            {codeInput(
              "SubmergedTerrestrialVegetation",
              "Submerged Terrestrial Vegetation",
            )}
            {codeInput("EmergentMacrophytes", "Emergent Macrophytes")}
            {codeInput("SubmergedMacrophytes", "Submerged Macrophytes")}
            {codeInput("FloatingMacrophytes", "Floating Macrophytes")}
            {codeInput("Algae", "Algae")}
            {codeInput("BeaverLodge", "Beaver Lodge")}
            {codeInput("DockOrPier", "Dock or Pier")}
            {codeInput("BridgeAbutment", "Bridge Abutment")}
            {codeInput("NoStructure", "No Structure")}
          </div>
        </details>

        <details className="existingSiteCard nestedDetailsCard">
          <summary className="detailsSummary">Land Use Details</summary>

          <p className="formSectionNote">
            Percent coverage by left and right bank.
          </p>

          <div className="detailsGrid detailsPad">
            {numberInput("Wetlands_L", "Wetlands L")}
            {numberInput("Wetlands_R", "Wetlands R")}
            {numberInput("ForestedWetlands_L", "Forested Wetlands L")}
            {numberInput("ForestedWetlands_R", "Forested Wetlands R")}
            {numberInput("ShrubOrScrub_L", "Shrub or Scrub L")}
            {numberInput("ShrubOrScrub_R", "Shrub or Scrub R")}
            {numberInput("Forested_L", "Forested L")}
            {numberInput("Forested_R", "Forested R")}
            {numberInput("Cropland_L", "Cropland L")}
            {numberInput("Cropland_R", "Cropland R")}
            {numberInput("Pastureland_L", "Pastureland L")}
            {numberInput("Pastureland_R", "Pastureland R")}
            {numberInput("Developed_L", "Developed L")}
            {numberInput("Developed_R", "Developed R")}
            {numberInput("Disturbed_L", "Disturbed L")}
            {numberInput("Disturbed_R", "Disturbed R")}
            {numberInput("Logged_L", "Logged L")}
            {numberInput("Logged_R", "Logged R")}
            {numberInput("OpenOrBarren_L", "Open or Barren L")}
            {numberInput("OpenOrBarren_R", "Open or Barren R")}
            {numberInput("Impervious_L", "Impervious L")}
            {numberInput("Impervious_R", "Impervious R")}
          </div>
        </details>
      </details>

      {validationMessage && (
        <div className="surveyValidationBanner">{validationMessage}</div>
      )}

      {saveMessage && <div className="surveySaveBanner">{saveMessage}</div>}

      <section className="existingSiteCard surveySaveCard desktopStepActions">
        <button
          type="button"
          className="primaryAction"
          onClick={validateAndSave}
        >
          Save Survey Information
        </button>
      </section>

      <div
        className={`mobileStepFooter mobileStepFooterSingle ${
          validationMessage || saveMessage ? "mobileStepFooterWithMessage" : ""
        }`}
      >
        {(validationMessage || saveMessage) && (
          <div
            className={`mobileStepFooterMessage ${
              validationMessage
                ? "mobileStepFooterMessageError"
                : "mobileStepFooterMessageOk"
            }`}
            role={validationMessage ? "alert" : "status"}
          >
            {validationMessage || saveMessage}
          </div>
        )}

        <button
          type="button"
          className="mobileStepPrimaryAction"
          onClick={validateAndSave}
        >
          Save Survey Information
        </button>
      </div>
    </main>
  );
}

export default SurveyInfoStep;
