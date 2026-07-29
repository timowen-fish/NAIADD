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
  if (type === "standard_mussel") return "Standard Mussel Processing";
  if (type === "quads") return "Quads";
  if (type === "musselrama") return "Musselrama";
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
        const name = display(
          firstValue(row, ["ScientificName", "scientificName"]),
          "",
        );

        return (
          name !== "" &&
          name !== "No Specimen"
        );
      }),
    [rows],
  );

  const speciesSummary = useMemo(() => {
    const summary = new Map<string, number>();

    realRows.forEach((row) => {
      const name = display(
        firstValue(row, ["ScientificName", "scientificName"]),
        "Unknown",
      );
      const quantity =
        numeric(firstValue(row, ["Quantity", "quantity"])) ?? 1;

      summary.set(name, (summary.get(name) ?? 0) + quantity);
    });

    return Array.from(summary.entries())
      .map(([name, quantity]) => ({ name, quantity }))
      .sort(
        (a, b) =>
          b.quantity - a.quantity ||
          a.name.localeCompare(b.name),
      );
  }, [realRows]);

  const totalSpecimens = useMemo(
    () =>
      realRows.reduce(
        (sum, row) =>
          sum +
          (numeric(firstValue(row, ["Quantity", "quantity"])) ??
            1),
        0,
      ),
    [realRows],
  );

  const sampleGroupCount = useMemo(
    () =>
      new Set(
        realRows
          .map((row) =>
            display(
              firstValue(row, [
                "CustomRunName",
                "RunN",
                "Run_Number",
              ]),
              "",
            ),
          )
          .filter(Boolean),
      ).size,
    [realRows],
  );

  const subsampleCount = useMemo(
    () =>
      new Set(
        realRows
          .map((row) => {
            const group = display(
              firstValue(row, [
                "CustomRunName",
                "RunN",
                "Run_Number",
              ]),
              "",
            );
            const pass = display(
              firstValue(row, ["SamplePass", "Pass"]),
              "",
            );

            return group || pass ? `${group}:${pass}` : "";
          })
          .filter(Boolean),
      ).size,
    [realRows],
  );

  const missingCondition = realRows.filter(
    (row) =>
      display(
        firstValue(row, ["Condition", "condition"]),
        "",
      ) === "",
  ).length;

  const missingSexMaturity = realRows.filter(
    (row) =>
      display(
        firstValue(row, ["SexMaturity", "sexMaturity"]),
        "",
      ) === "",
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

  if (missingCondition > 0) {
    validationItems.push({
      level: "warning",
      text: `${missingCondition} specimen row${missingCondition === 1 ? " is" : "s are"} missing condition`,
      action: onEditSpecimens,
    });
  }

  if (missingSexMaturity > 0) {
    validationItems.push({
      level: "warning",
      text: `${missingSexMaturity} specimen row${missingSexMaturity === 1 ? " is" : "s are"} missing sex/maturity`,
      action: onEditSpecimens,
    });
  }

  const hasBlockingErrors = validationItems.some(
    (item) => item.level === "error",
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
          <Definition
            label="Identified By"
            value={firstValue(survey, ["IdentifiedBy", "identifiedBy"])}
          />
          <Definition
            label="Collectors"
            value={firstValue(survey, ["Collectors", "collectors"])}
          />
          <Definition
            label="Sampling Method"
            value={firstValue(survey, [
              "SamplingMethod",
              "Sampling_Method",
              "samplingMethod",
            ])}
          />
          <Definition
            label="Taxa Surveyed"
            value={firstValue(survey, ["Taxa", "taxa"])}
          />
          <Definition
            label="Target Species"
            value={firstValue(survey, [
              "TargetSpecies",
              "targetSpecies",
            ])}
          />
          <Definition
            label="Equipment"
            value={firstValue(survey, ["Equipment", "equipment"])}
          />
          <Definition
            label="Storage Location"
            value={firstValue(survey, [
              "StorageLocation",
              "storageLocation",
            ])}
          />
          <Definition
            label="Total Person Hours"
            value={firstValue(survey, [
              "TotalPersonHours",
              "totalPersonHours",
            ])}
          />
          <Definition
            label="Weather"
            value={firstValue(survey, ["Weather", "weather"])}
          />
        </ReviewCard>

        <ReviewCard title="Specimen Summary" icon="◇" onEdit={onEditSpecimens} wide>
          <div className="reviewMetricGrid">
            <Metric
              label="Entry Method"
              value={specimenTypeLabel(
                session.specimenFormType,
              )}
            />
            <Metric
              label="Total Quantity"
              value={String(totalSpecimens)}
            />
            <Metric
              label="Species"
              value={String(speciesSummary.length)}
            />
            <Metric
              label="Observation Records"
              value={String(realRows.length)}
            />
            <Metric
              label="Sample Groups"
              value={String(sampleGroupCount)}
            />
            <Metric
              label="Subsamples"
              value={String(subsampleCount)}
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
                    <span>
                      <em>{species.name}</em>
                    </span>
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
