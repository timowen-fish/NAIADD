import { useMemo, type ReactNode } from "react";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type {
  SpecimenFormType,
  SurveySession,
} from "../../types/surveySession";
import "../../styles/ReviewStep.css";

type Props = {
  session: SurveySession;
  onEditLocation: () => void;
  onEditSurvey: () => void;
  onEditSpecimens: () => void;
  onContinue: () => void;
};

type AnyRecord = Record<string, unknown>;

type ValidationItem = {
  level: "complete" | "warning" | "error";
  text: string;
  action?: () => void;
};

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

function firstValue(record: AnyRecord, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return null;
}

function display(value: unknown, fallback = "—"): string {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean).join(", ") || fallback;
  }

  return String(value);
}

function numeric(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function specimenTypeLabel(type: SpecimenFormType | null | undefined): string {
  if (type === "gillnet") return "Gill Net Survey";
  if (type === "cm_tally") return "Centimeter Tally";
  if (type === "standard") return "Standard Fish Processing";
  return "Not selected";
}

function formatDate(value: unknown): string {
  const text = display(value, "");
  if (!text) return "—";

  const date = new Date(`${text}T12:00:00`);
  if (Number.isNaN(date.getTime())) return text;

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export default function ReviewStep({
  session,
  onEditLocation,
  onEditSurvey,
  onEditSpecimens,
  onContinue,
}: Props) {
  const location = asRecord(session.location);
  const survey = asRecord(session.survey);
  const rows = useMemo(
    () => (Array.isArray(session.specimens) ? session.specimens.map(asRecord) : []),
    [session.specimens],
  );

  const realRows = useMemo(
    () =>
      rows.filter((row) => {
        const name = display(firstValue(row, ["CommonName", "commonName"]), "");
        return name !== "" && name !== "NoFish";
      }),
    [rows],
  );

  const speciesSummary = useMemo(() => {
    const summary = new Map<string, number>();

    realRows.forEach((row) => {
      const name = display(firstValue(row, ["CommonName", "commonName"]), "Unknown");
      const quantity = numeric(firstValue(row, ["Quantity", "quantity"])) ?? 1;
      summary.set(name, (summary.get(name) ?? 0) + quantity);
    });

    return Array.from(summary.entries())
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
  }, [realRows]);

  const totalFish = useMemo(
    () =>
      realRows.reduce(
        (sum, row) => sum + (numeric(firstValue(row, ["Quantity", "quantity"])) ?? 1),
        0,
      ),
    [realRows],
  );

  const measuredRows = useMemo(
    () =>
      realRows
        .map((row) => ({
          row,
          length: numeric(firstValue(row, ["Length", "length", "ForkLength"])),
        }))
        .filter((item): item is { row: AnyRecord; length: number } => item.length !== null),
    [realRows],
  );

  const largest = useMemo(
    () =>
      measuredRows.length > 0
        ? measuredRows.reduce((best, item) => (item.length > best.length ? item : best))
        : null,
    [measuredRows],
  );

  const smallest = useMemo(
    () =>
      measuredRows.length > 0
        ? measuredRows.reduce((best, item) => (item.length < best.length ? item : best))
        : null,
    [measuredRows],
  );

  const netCount = useMemo(
    () =>
      new Set(
        realRows
          .map((row) => display(firstValue(row, ["NetNumber", "CustomRunName"]), ""))
          .filter(Boolean),
      ).size,
    [realRows],
  );

  const panelCount = useMemo(
    () =>
      new Set(
        realRows
          .map((row) => {
            const net = display(firstValue(row, ["NetNumber", "CustomRunName"]), "");
            const panel = display(firstValue(row, ["SamplePass", "Pass"]), "");
            return net || panel ? `${net}:${panel}` : "";
          })
          .filter(Boolean),
      ).size,
    [realRows],
  );

  const cmClassCount = useMemo(
    () =>
      new Set(
        realRows
          .map((row) => numeric(firstValue(row, ["Length", "length"])))
          .filter((value): value is number => value !== null),
      ).size,
    [realRows],
  );

  const missingWeight = realRows.filter(
    (row) => numeric(firstValue(row, ["Weight", "weight"])) === null,
  ).length;
  const missingSex = realRows.filter(
    (row) => display(firstValue(row, ["Sex", "sex"]), "") === "",
  ).length;

  const latitude = numeric(
    firstValue(location, [
      "DownstreamLat",
      "downstreamLat",
      "DownstreamLatitude",
      "downstreamLatitude",
      "Latitude",
      "latitude",
      "Lat",
      "lat",
      "Y",
      "y",
    ]),
  );

  const longitude = numeric(
    firstValue(location, [
      "DownstreamLong",
      "downstreamLong",
      "DownstreamLongitude",
      "downstreamLongitude",
      "Longitude",
      "longitude",
      "Lon",
      "lon",
      "Lng",
      "lng",
      "Long",
      "long",
      "X",
      "x",
    ]),
  );

  const validationItems: ValidationItem[] = [
    session.location
      ? { level: "complete", text: "Location complete", action: onEditLocation }
      : { level: "error", text: "Location is required", action: onEditLocation },
    session.survey
      ? { level: "complete", text: "Survey information complete", action: onEditSurvey }
      : { level: "error", text: "Survey information is required", action: onEditSurvey },
    session.specimenFormType && rows.length > 0
      ? { level: "complete", text: "Specimen data entered", action: onEditSpecimens }
      : { level: "error", text: "Specimen data is required", action: onEditSpecimens },
  ];

  if (missingWeight > 0 && session.specimenFormType !== "cm_tally") {
    validationItems.push({
      level: "warning",
      text: `${missingWeight} specimen row${missingWeight === 1 ? " is" : "s are"} missing weight`,
      action: onEditSpecimens,
    });
  }

  if (missingSex > 0 && session.specimenFormType !== "cm_tally") {
    validationItems.push({
      level: "warning",
      text: `${missingSex} specimen row${missingSex === 1 ? " is" : "s are"} missing sex`,
      action: onEditSpecimens,
    });
  }

  const hasBlockingErrors = validationItems.some((item) => item.level === "error");
  const lengthUnit = display(
    firstValue(realRows[0] ?? {}, ["LengthUnit", "lengthUnit"]),
    session.specimenFormType === "cm_tally" ? "cm" : "",
  );

  return (
    <main className="reviewStep">
      <section className="reviewProgressCard">
        <div>
          <p className="reviewKicker">Review &amp; Submit</p>
          <h2>{hasBlockingErrors ? "Survey needs attention" : "Ready for final review"}</h2>
          <p>Confirm the location, survey details, and biological observations before continuing.</p>
        </div>

        <div className="reviewProgressChecks">
          <span className={session.location ? "complete" : "incomplete"}>Location</span>
          <span className={session.survey ? "complete" : "incomplete"}>Survey</span>
          <span className={rows.length > 0 ? "complete" : "incomplete"}>Specimens</span>
        </div>
      </section>

      <div className="reviewCardGrid">
        <ReviewCard title="Location" icon="⌖" onEdit={onEditLocation}>
          <Definition label="Waterbody" value={firstValue(location, ["Waterbody", "waterbody"])} />
          <Definition label="Site Name" value={firstValue(location, ["SiteName", "siteName"])} />
          <Definition label="Site ID" value={firstValue(location, ["SiteID", "siteID", "id"])} mono />

          <div className="reviewCoordinateGrid">
            <Definition label="Latitude" value={latitude?.toFixed(6)} />
            <Definition label="Longitude" value={longitude?.toFixed(6)} />
          </div>

          <div className="reviewMapPreview" aria-label="Location coordinate preview">
            {latitude !== null && longitude !== null ? (
              <MapContainer
                center={[latitude, longitude]}
                zoom={15}
                minZoom={6}
                maxZoom={18}
                zoomControl={false}
                attributionControl={false}
                dragging={false}
                scrollWheelZoom={false}
                doubleClickZoom={false}
                touchZoom={false}
                keyboard={false}
                style={{
                  width: "100%",
                  height: "100%",
                  minHeight: "220px",
                  borderRadius: "18px",
                  background: "#111827",
                }}
              >
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />

                <CircleMarker
                  center={[latitude, longitude]}
                  radius={7}
                  pathOptions={{
                    color: "#ffffff",
                    fillColor: "#ff9f43",
                    fillOpacity: 1,
                    opacity: 1,
                    weight: 3,
                  }}
                />
              </MapContainer>
            ) : (
              <strong>Coordinates unavailable</strong>
            )}
          </div>
        </ReviewCard>

        <ReviewCard title="Survey Details" icon="▤" onEdit={onEditSurvey}>
          <Definition
            label="Survey Date"
            value={formatDate(firstValue(survey, ["Survey_Date", "SurveyDate", "surveyDate", "Date"]))}
          />
          <Definition label="Project" value={firstValue(survey, ["Project", "project"])} />
          <Definition label="Survey Type" value={firstValue(survey, ["SurveyType", "Survey_Type", "surveyType"])} />
          <Definition label="Sampling Method" value={firstValue(survey, ["SamplingMethod", "Sampling_Method", "samplingMethod"])} />
          <Definition label="Lead Biologist" value={firstValue(survey, ["LeadBiologist", "Lead_Biologist", "leadBiologist"])} />
          <Definition label="Surveyors" value={firstValue(survey, ["Surveyors", "surveyors"])} />
          <Definition label="Weather" value={firstValue(survey, ["Weather", "weather"])} />
        </ReviewCard>

        <ReviewCard title="Specimen Summary" icon="◇" onEdit={onEditSpecimens} wide>
          <div className="reviewMetricGrid">
            <Metric label="Entry Method" value={specimenTypeLabel(session.specimenFormType)} />
            <Metric label="Fish Count" value={String(totalFish)} />
            <Metric label="Species" value={String(speciesSummary.length)} />
            {session.specimenFormType === "gillnet" && <Metric label="Nets" value={String(netCount)} />}
            {session.specimenFormType === "gillnet" && <Metric label="Panels" value={String(panelCount)} />}
            {session.specimenFormType === "cm_tally" && <Metric label="CM Classes" value={String(cmClassCount)} />}
            <Metric
              label="Largest"
              value={
                largest
                  ? `${display(firstValue(largest.row, ["CommonName"]), "Fish")} — ${largest.length}${lengthUnit ? ` ${lengthUnit}` : ""}`
                  : "—"
              }
            />
            <Metric
              label="Smallest"
              value={
                smallest
                  ? `${display(firstValue(smallest.row, ["CommonName"]), "Fish")} — ${smallest.length}${lengthUnit ? ` ${lengthUnit}` : ""}`
                  : "—"
              }
            />
          </div>

          <div className="reviewSpeciesSummary">
            <h3>Quantity by Species</h3>
            {speciesSummary.length === 0 ? (
              <p>No specimen rows have been entered.</p>
            ) : (
              <div className="reviewSpeciesRows">
                {speciesSummary.slice(0, 12).map((species) => (
                  <div key={species.name}>
                    <span>{species.name}</span>
                    <strong>{species.quantity}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ReviewCard>

        <section className="reviewValidationCard">
          <div className="reviewCardHeader">
            <div className="reviewCardTitle">
              <span>!</span>
              <h2>Validation</h2>
            </div>
          </div>

          <div className="reviewValidationList">
            {validationItems.map((item, index) => (
              <button
                key={`${item.text}-${index}`}
                type="button"
                className={item.level}
                onClick={item.action}
              >
                <span>{item.level === "complete" ? "✓" : item.level === "warning" ? "!" : "×"}</span>
                <strong>{item.text}</strong>
                {item.action && <small>Edit →</small>}
              </button>
            ))}
          </div>
        </section>
      </div>

      <footer className="reviewFooter">
        <div>
          <strong>{hasBlockingErrors ? "Required information is missing" : "Review complete"}</strong>
          <span>
            {hasBlockingErrors
              ? "Resolve the errors above before continuing."
              : "Warnings do not block the draft and submission workflow."}
          </span>
        </div>

        <button type="button" disabled={hasBlockingErrors} onClick={onContinue}>
          Continue to Submit →
        </button>
      </footer>
    </main>
  );
}

function ReviewCard({
  title,
  icon,
  onEdit,
  wide = false,
  children,
}: {
  title: string;
  icon: string;
  onEdit: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={wide ? "reviewCard wide" : "reviewCard"}>
      <div className="reviewCardHeader">
        <div className="reviewCardTitle">
          <span>{icon}</span>
          <h2>{title}</h2>
        </div>
        <button type="button" onClick={onEdit}>Edit →</button>
      </div>
      <div className="reviewCardBody">{children}</div>
    </section>
  );
}

function Definition({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: unknown;
  mono?: boolean;
}) {
  return (
    <div className="reviewDefinition">
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>{display(value)}</strong>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="reviewMetric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
