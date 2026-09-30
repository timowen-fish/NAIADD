import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  Database,
  Shell,
  MapPin,
  RefreshCw,
  Ruler,
  Search,
  X,
} from "lucide-react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { divIcon, type LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

import naiaddShield from "../assets/naiadd-shield.png";
import type { UserProfile } from "../types/user";
import { USER_ROLE_LABELS } from "../types/user";
import { getDisplayName } from "../utils/displayName";
import {
  listSurveyDrafts,
  WORKFLOW_SESSION_EVENT,
} from "../services/surveySessionService";
import {
  forceSyncSnapshot,
  getCachedSnapshotMetadata,
  readSnapshotRows,
} from "../services/snapshotService";

import { loadBrianReleaseRecords } from "../services/distributionService";

import "../styles/HomeDashboard.css";

type AnyRecord = Record<string, unknown>;

type HomeDashboardProps = {
  profile: UserProfile;
};

type DashboardSummary = {
  surveysCompleted: number;
  sitesSampled: number;
  speciesEncountered: number;
  musselsProcessed: number;
  mostCommonSpecies: string;
};

type ReleaseDashboardSummary = {
  releasesCompleted: number;
  releaseLocations: number;
  speciesPropagated: number;
  musselsPropagated: number;
  highestPropagatedSpecies: string;
};

const EMPTY_RELEASE_DASHBOARD_SUMMARY: ReleaseDashboardSummary = {
  releasesCompleted: 0,
  releaseLocations: 0,
  speciesPropagated: 0,
  musselsPropagated: 0,
  highestPropagatedSpecies: "—",
};

type RecentSurvey = {
  collectionID: string;
  siteID: string;
  waterbody: string;
  dateLabel: string;
  timestamp: number;
  method: string;
  musselCount: number;
  speciesCount: number;
};

type ChartRow = {
  label: string;
  value: number;
  displayValue?: string;
};

type SiteMapPoint = {
  coordinateKey: string;
  collectionID: string;
  collectionCount: number;
  siteID: string;
  siteName: string;
  waterbody: string;
  latitude: number;
  longitude: number;
};

type ReleaseMapPoint = {
  coordinateKey: string;
  recordCount: number;
  species: string[];
  latitude: number;
  longitude: number;
};


type DashboardAnalytics = {
  summary: DashboardSummary;
  recentSurveys: RecentSurvey[];
  topSpecies: ChartRow[];
  sitePoints: SiteMapPoint[];
  totalRows: number;
};

type SnapshotLoadState = "loading" | "ready" | "empty" | "error";

const SCENERY_IMAGES = Array.from(
  { length: 14 },
  (_, index) => `/images/scenery/Header_${index + 1}.jpg`,
);

const DASHBOARD_SNAPSHOT_COLUMNS = [
  "CollectionID",
  "SurveyDate",
  "Taxa",
  "ScientificName",
  "Condition",
  "Quantity",
  "SamplingMethod",
  "SiteID",
  "SiteID_AccessDB",
  "SiteID_Previous",
  "SiteName",
  "LocDescription",
  "Waterbody",
  "LatitudeDD",
  "LongitudeDD",
  "DownstreamLat",
  "DownstreamLong",
] as const;

const EMPTY_DASHBOARD_SUMMARY: DashboardSummary = {
  surveysCompleted: 0,
  sitesSampled: 0,
  speciesEncountered: 0,
  musselsProcessed: 0,
  mostCommonSpecies: "—",
};

let dashboardSnapshotRowsCache: AnyRecord[] | null = null;
let dashboardSnapshotRowsPromise: Promise<AnyRecord[]> | null = null;

async function readDashboardSnapshotRowsOnce(): Promise<AnyRecord[]> {
  if (dashboardSnapshotRowsCache) {
    return dashboardSnapshotRowsCache;
  }

  if (!dashboardSnapshotRowsPromise) {
    dashboardSnapshotRowsPromise = readSnapshotRows({
      columns: [...DASHBOARD_SNAPSHOT_COLUMNS],
    })
      .then((rows) => {
        dashboardSnapshotRowsCache = rows;
        return rows;
      })
      .finally(() => {
        dashboardSnapshotRowsPromise = null;
      });
  }

  return dashboardSnapshotRowsPromise;
}

function setDashboardSnapshotRowsCache(rows: AnyRecord[]): void {
  dashboardSnapshotRowsCache = rows;
  dashboardSnapshotRowsPromise = null;
}

function getValue(row: AnyRecord, names: readonly string[]): unknown {
  for (const name of names) {
    const value = row[name];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  const lowerCaseKeys = new Map(
    Object.keys(row).map((key) => [key.toLowerCase(), key]),
  );

  for (const name of names) {
    const matchedKey = lowerCaseKeys.get(name.toLowerCase());

    if (!matchedKey) continue;

    const value = row[matchedKey];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function toText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function toMusselCount(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) return 0;

  return Math.round(parsed);
}

function formatWholeNumber(value: number): string {
  const safeValue = Number.isFinite(value) ? Math.round(value) : 0;

  return safeValue.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}


function toNumber(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const timestamp =
      value > 1_000_000_000
        ? value
        : Date.UTC(1970, 0, 1) + value * 86_400_000;

    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value: unknown): string {
  const parsed = parseDate(value);

  if (!parsed) return "Unknown date";

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildDashboardAnalytics(rows: AnyRecord[]): DashboardAnalytics {
  const collectionIDs = new Set<string>();
  const speciesNames = new Set<string>();
  const speciesTotals = new Map<string, number>();
  const locationPointMap = new Map<string, SiteMapPoint>();
  const surveyMap = new Map<
    string,
    RecentSurvey & {
      species: Set<string>;
    }
  >();

  for (const row of rows) {
    const collectionID =
      toText(getValue(row, ["CollectionID", "Collection_Id"])) ||
      "Unknown Collection";

    if (collectionID !== "Unknown Collection") {
      collectionIDs.add(collectionID);
    }

    const siteID =
      toText(
        getValue(row, [
          "SiteID",
          "SiteID_AccessDB",
          "SiteID_Previous",
        ]),
      ) || "Unknown Site";

    const siteName =
      toText(getValue(row, ["SiteName", "LocDescription"])) || siteID;

    const waterbody =
      toText(
        getValue(row, ["Waterbody", "SiteName", "LocDescription"]),
      ) || "Unknown Waterbody";

    const species =
      toText(getValue(row, ["ScientificName", "Taxa"])) ||
      "Unknown Species";

    const quantity = toMusselCount(
      getValue(row, ["Quantity", "Count", "Qty", "Number"]),
    );

    if (species !== "Unknown Species") {
      speciesNames.add(species);
      speciesTotals.set(species, (speciesTotals.get(species) ?? 0) + quantity);
    }

    const latitude = toNumber(
      getValue(row, [
        "DownstreamLat",
        "downstreamLat",
        "LatitudeDD",
        "DownstreamLatitude",
        "Latitude",
        "latitude",
        "Lat",
        "lat",
        "Lat_Decimal_Degree",
        "Y",
        "y",
      ]),
    );

    const longitude = toNumber(
      getValue(row, [
        "DownstreamLong",
        "downstreamLong",
        "LongitudeDD",
        "DownstreamLongitude",
        "Longitude",
        "longitude",
        "Long",
        "long",
        "Lng",
        "lng",
        "Long_Decimal_Degree",
        "X",
        "x",
      ]),
    );

    if (
      collectionID !== "Unknown Collection" &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180 &&
      latitude !== 0 &&
      longitude !== 0
    ) {
      const coordinateKey = `${latitude},${longitude}`;
      const existingPoint = locationPointMap.get(coordinateKey);

      if (!existingPoint) {
        locationPointMap.set(coordinateKey, {
          coordinateKey,
          collectionID,
          collectionCount: 1,
          siteID,
          siteName,
          waterbody,
          latitude,
          longitude,
        });
      } else if (
        existingPoint.collectionID !== collectionID &&
        !existingPoint.collectionID.split("|").includes(collectionID)
      ) {
        existingPoint.collectionID += `|${collectionID}`;
        existingPoint.collectionCount += 1;
      }
    }

    const dateValue = getValue(row, [
      "SurveyDate",
      "Survey_Date",
      "SampleDate",
      "CollectionDate",
      "Date",
      "FinalDate",
    ]);

    const timestamp = parseDate(dateValue)?.getTime() ?? 0;

    const method =
      toText(
        getValue(row, [
          "Sampling_Method",
          "SamplingMethod",
          "Survey_Type",
          "SurveyType",
          "GearType",
          "Geartype",
        ]),
      ) || "Survey";

    if (!surveyMap.has(collectionID)) {
      surveyMap.set(collectionID, {
        collectionID,
        siteID,
        waterbody,
        dateLabel: formatDate(dateValue),
        timestamp,
        method,
        musselCount: 0,
        speciesCount: 0,
        species: new Set<string>(),
      });
    }

    const survey = surveyMap.get(collectionID)!;

    if (timestamp > survey.timestamp) {
      survey.timestamp = timestamp;
      survey.dateLabel = formatDate(dateValue);
    }

    survey.musselCount += quantity;

    if (species !== "Unknown Species") {
      survey.species.add(species);
      survey.speciesCount = survey.species.size;
    }
  }

  const topSpecies = [...speciesTotals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const recentSurveys = [...surveyMap.values()]
    .filter((survey) => survey.collectionID !== "Unknown Collection")
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10)
    .map(({ species, ...survey }) => survey);

  return {
    summary: {
      surveysCompleted: collectionIDs.size,
      sitesSampled: locationPointMap.size,
      speciesEncountered: speciesNames.size,
      musselsProcessed: [...speciesTotals.values()].reduce(
        (total, quantity) => total + quantity,
        0,
      ),
      mostCommonSpecies: topSpecies[0]?.label ?? "—",
    },
    recentSurveys,
    topSpecies,
    sitePoints: [...locationPointMap.values()],
    totalRows: rows.length,
  };
}

function SceneryHeader({
  profile,
  isOnline,
}: HomeDashboardProps & { isOnline: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const fadeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveIndex((current) => {
        setPreviousIndex(current);
        return (current + 1) % SCENERY_IMAGES.length;
      });

      if (fadeTimeoutRef.current) {
        window.clearTimeout(fadeTimeoutRef.current);
      }

      fadeTimeoutRef.current = window.setTimeout(() => {
        setPreviousIndex(null);
      }, 1800);
    }, 30000);

    return () => {
      window.clearInterval(interval);

      if (fadeTimeoutRef.current) {
        window.clearTimeout(fadeTimeoutRef.current);
      }
    };
  }, []);

  return (
    <section className="home-scenery-header">
      {previousIndex !== null && (
        <div
          className="home-scenery-image home-scenery-image-previous"
          style={{
            backgroundImage: `url(${SCENERY_IMAGES[previousIndex]})`,
          }}
        />
      )}

      <div
        className="home-scenery-image home-scenery-image-active"
        style={{
          backgroundImage: `url(${SCENERY_IMAGES[activeIndex]})`,
        }}
      />

      <div className="home-scenery-shade" />

      <div className="home-scenery-brand">
        <img src={naiaddShield} alt="NAIADD" />

        <div>
          <p>WELCOME BACK</p>
          <h1>{getDisplayName(profile)}</h1>
          <div className="home-hero-status-row">
            <span>{USER_ROLE_LABELS[profile.role]}</span>

            <span
              className={`home-connection-status ${isOnline ? "online" : "offline"}`}
            >
              <i aria-hidden="true" />
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

type MetricCardProps = {
  title: string;
  value: string;
  icon: React.ReactNode;
  isLoading: boolean;
  releaseTitle: string;
  releaseValue: string;
  isReleaseLoading: boolean;
  valueClassName?: string;
  releaseValueClassName?: string;
};

function MetricCard({
  title,
  value,
  icon,
  isLoading,
  releaseTitle,
  releaseValue,
  isReleaseLoading,
  valueClassName = "",
  releaseValueClassName = "",
}: MetricCardProps) {
  return (
    <article className="home-dual-metric-card">
      <section className="home-dual-metric-half home-dual-metric-survey">
        <div className="home-dual-metric-heading">
          <span>{title}</span>
          <div className="home-dual-metric-icon">{icon}</div>
        </div>
        <strong
          className={[
            "home-dual-metric-value",
            isLoading ? "loading" : "",
            valueClassName,
          ]
            .filter(Boolean)
            .join(" ")}
          title={!isLoading ? value : undefined}
        >
          {isLoading ? "—" : value}
        </strong>
      </section>

      <section className="home-dual-metric-half home-dual-metric-release">
        <div className="home-dual-metric-heading">
          <span>{releaseTitle}</span>
        </div>
        <strong
          className={[
            "home-dual-metric-value",
            "home-dual-metric-release-value",
            isReleaseLoading ? "loading" : "",
            releaseValueClassName,
          ]
            .filter(Boolean)
            .join(" ")}
          title={!isReleaseLoading ? releaseValue : undefined}
        >
          {isReleaseLoading ? "—" : releaseValue}
        </strong>
      </section>
    </article>
  );
}


function ChartList({
  rows,
  emptyText,
}: {
  rows: ChartRow[];
  emptyText: string;
}) {
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  if (rows.length === 0) {
    return <div className="home-chart-empty">{emptyText}</div>;
  }

  return (
    <div className="home-chart-list">
      {rows.map((row) => (
        <div className="home-chart-row" key={row.label}>
          <div className="home-chart-label">
            <span className="home-scientific-name" title={row.label}>{row.label}</span>
            <strong>{row.displayValue ?? formatWholeNumber(row.value)}</strong>
          </div>

          <div className="home-chart-track">
            <div
              className="home-chart-fill"
              style={{
                width: `${Math.max(4, (row.value / maxValue) * 100)}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

const VIRGINIA_BOUNDS: LatLngBoundsExpression = [
  [36.54, -83.68],
  [39.47, -75.24],
];

function FitMapToVirginia() {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(VIRGINIA_BOUNDS, {
      padding: [12, 12],
      animate: false,
    });
  }, [map]);

  return null;
}

type DashboardMapSearchResult = {
  latitude: number;
  longitude: number;
  label: string;
  type: string;
};

let lastDashboardNominatimRequestAt = 0;

async function searchVirginiaDashboardMap(
  rawQuery: string,
): Promise<DashboardMapSearchResult[]> {
  const query = rawQuery.trim();

  if (!query) {
    throw new Error(
      "Enter an address, road, waterbody, county, park, forest, or place to search.",
    );
  }

  if (!navigator.onLine) {
    throw new Error("Map location search is unavailable while offline.");
  }

  const elapsed = Date.now() - lastDashboardNominatimRequestAt;
  const remaining = 1100 - elapsed;

  if (remaining > 0) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
  }

  lastDashboardNominatimRequestAt = Date.now();

  const searchQuery = /\b(virginia|va)\b/i.test(query)
    ? query
    : `${query}, Virginia`;

  const params = new URLSearchParams({
    format: "jsonv2",
    q: searchQuery,
    countrycodes: "us",
    viewbox: "-83.8,39.6,-75.0,36.4",
    bounded: "1",
    limit: "6",
    addressdetails: "1",
    dedupe: "1",
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Location search is temporarily unavailable (${response.status}).`,
    );
  }

  const rawResults = (await response.json()) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
    type?: string;
  }>;

  const results = rawResults
    .map((result) => ({
      latitude: Number(result.lat),
      longitude: Number(result.lon),
      label: String(result.display_name || query),
      type: String(result.type || "location"),
    }))
    .filter(
      (result) =>
        Number.isFinite(result.latitude) &&
        Number.isFinite(result.longitude) &&
        result.latitude >= 36.4 &&
        result.latitude <= 39.6 &&
        result.longitude >= -83.8 &&
        result.longitude <= -75.0,
    );

  if (results.length === 0) {
    throw new Error(
      "No matching Virginia location was found. Try an address, road, waterbody, county, state park, state forest, or place name.",
    );
  }

  return results;
}

function FocusDashboardMapSearch({
  result,
  requestKey,
}: {
  result: DashboardMapSearchResult | null;
  requestKey: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!result || requestKey <= 0) return;
    map.setView([result.latitude, result.longitude], 13, { animate: true });
  }, [map, requestKey, result]);

  return null;
}

function dashboardReleaseStarIcon() {
  return divIcon({
    className: "home-release-star-marker",
    iconSize: [10, 10],
    iconAnchor: [5, 5],
    popupAnchor: [0, -5],
    html: `
      <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true">
        <path
          d="M12 1.9l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 16.98l-5.9 3.1 1.13-6.58-4.78-4.66 6.6-.96L12 1.9z"
          fill="#d100a7"
          stroke="#111111"
          stroke-width="2.1"
          stroke-linejoin="round"
        />
      </svg>
    `,
  });
}

function SiteDistributionMap({
  points,
  releasePoints,
}: {
  points: SiteMapPoint[];
  releasePoints: ReleaseMapPoint[];
}) {
  const [searchText, setSearchText] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<DashboardMapSearchResult[]>([]);
  const [searchMessage, setSearchMessage] = useState("");
  const [searchResult, setSearchResult] = useState<DashboardMapSearchResult | null>(null);
  const [searchFocusKey, setSearchFocusKey] = useState(0);

  async function runSearch() {
    if (searching) return;

    setSearchResults([]);
    setSearching(true);
    setSearchMessage("Searching OpenStreetMap...");

    try {
      const results = await searchVirginiaDashboardMap(searchText);
      setSearchResults(results);
      setSearchMessage(
        `${results.length} matching Virginia location${results.length === 1 ? "" : "s"} found.`,
      );
    } catch (error) {
      setSearchMessage(
        error instanceof Error ? error.message : "Unable to search for that location.",
      );
    } finally {
      setSearching(false);
    }
  }

  function chooseResult(result: DashboardMapSearchResult) {
    setSearchText(result.label);
    setSearchResults([]);
    setSearchResult(result);
    setSearchMessage(`Showing ${result.label}.`);
    setSearchFocusKey((current) => current + 1);
  }

  function clearSearch() {
    setSearchText("");
    setSearchResults([]);
    setSearchMessage("");
    setSearchResult(null);
  }

  if (points.length === 0 && releasePoints.length === 0) {
    return (
      <div className="home-map-empty">
        No survey or release coordinates are available.
      </div>
    );
  }

  return (
    <>
      <div className="home-map-location-search">
        <div className="home-map-location-search-row">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
              setSearchResults([]);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void runSearch();
              }
            }}
            placeholder="Search address, road, waterbody, county, park, forest, or place…"
            aria-label="Search Virginia map locations"
          />
          {searchText && (
            <button
              type="button"
              className="home-map-location-clear"
              onClick={clearSearch}
              aria-label="Clear map location search"
              title="Clear map location search"
            >
              <X size={16} />
            </button>
          )}
          <button
            type="button"
            className="home-map-location-search-button"
            onClick={() => void runSearch()}
            disabled={searching}
          >
            {searching ? "Searching…" : "Search Map"}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="home-map-location-results">
            {searchResults.map((result, index) => (
              <button
                type="button"
                key={`${result.latitude}-${result.longitude}-${index}`}
                onClick={() => chooseResult(result)}
              >
                <strong>{result.label.split(",")[0]}</strong>
                <span>{result.label}</span>
                <small>{result.type}</small>
              </button>
            ))}
          </div>
        )}

        <div className="home-map-location-meta">
          <span role="status">{searchMessage}</span>
          <small>Search data © OpenStreetMap contributors, via Nominatim.</small>
        </div>
      </div>

      <div className="home-site-map-shell">
        <MapContainer
          className="home-site-map"
          center={[37.55, -78.5]}
          zoom={7}
          scrollWheelZoom
          attributionControl
          preferCanvas
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />

          <FitMapToVirginia />
          <FocusDashboardMapSearch
            result={searchResult}
            requestKey={searchFocusKey}
          />

          {points.map((point) => (
            <CircleMarker
              key={point.coordinateKey}
              center={[point.latitude, point.longitude]}
              radius={2.8}
              pathOptions={{
                color: "rgba(255, 255, 255, 0.92)",
                weight: 0.9,
                fillColor: "#4daf4a",
                fillOpacity: 0.82,
              }}
            >
              <Popup>
                <div className="home-site-popup">
                  <strong>{point.siteName}</strong>
                  <span>{point.waterbody}</span>
                  <span>{point.siteID}</span>
                  <small>
                    {point.collectionCount.toLocaleString()} survey
                    {point.collectionCount === 1 ? "" : "s"} at this location
                  </small>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {releasePoints.map((point) => (
            <Marker
              key={`release:${point.coordinateKey}`}
              position={[point.latitude, point.longitude]}
              icon={dashboardReleaseStarIcon()}
              zIndexOffset={250}
            >
              <Popup>
                <div className="home-site-popup">
                  <strong>Release Database</strong>
                  <span>
                    {point.species.length === 1
                      ? point.species[0]
                      : `${point.species.length.toLocaleString()} species`}
                  </span>
                  <small>
                    {point.recordCount.toLocaleString()} release record
                    {point.recordCount === 1 ? "" : "s"} at this location
                  </small>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        <div className="home-map-count">
          <MapPin size={14} aria-hidden="true" />
          {points.length.toLocaleString()} survey locations
          {releasePoints.length > 0
            ? ` • ${releasePoints.length.toLocaleString()} release locations`
            : ""}
        </div>
      </div>
    </>
  );
}

export default function HomeDashboard({ profile }: HomeDashboardProps) {
  const [draftCount, setDraftCount] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [snapshotRows, setSnapshotRows] = useState<AnyRecord[]>(
    () => dashboardSnapshotRowsCache ?? [],
  );
  const [snapshotState, setSnapshotState] = useState<SnapshotLoadState>(
    () => (dashboardSnapshotRowsCache ? "ready" : "loading"),
  );
  const [snapshotStatus, setSnapshotStatus] = useState(() =>
    dashboardSnapshotRowsCache
      ? "Cached production snapshot loaded."
      : "Loading cached NAIADD production snapshot...",
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRecentActivityOpen, setIsRecentActivityOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [releaseMapPoints, setReleaseMapPoints] = useState<ReleaseMapPoint[]>([]);
  const [releaseSummary, setReleaseSummary] = useState<ReleaseDashboardSummary>(
    EMPTY_RELEASE_DASHBOARD_SUMMARY,
  );
  const [isReleaseSummaryLoading, setIsReleaseSummaryLoading] = useState(true);

  const analytics = useMemo(
    () =>
      snapshotRows.length > 0
        ? buildDashboardAnalytics(snapshotRows)
        : {
            summary: EMPTY_DASHBOARD_SUMMARY,
            recentSurveys: [],
            topSpecies: [],
            sitePoints: [],
            totalRows: 0,
          },
    [snapshotRows],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadReleaseMapPoints() {
      try {
        const records = await loadBrianReleaseRecords();
        if (cancelled) return;

        const grouped = new Map<string, ReleaseMapPoint>();
        const propagatedSpecies = new Set<string>();
        const propagatedTotals = new Map<string, number>();
        let musselsPropagated = 0;

        for (const record of records) {
          const species = String(record.scientificName || "").trim();
          const rawReleaseCount = getValue(record.raw, [
            "Release Count",
            "ReleaseCount",
            "Release_Count",
            "Quantity",
            "Count",
          ]);
          const releaseCount = toMusselCount(rawReleaseCount);

          if (species) {
            propagatedSpecies.add(species);
            propagatedTotals.set(
              species,
              (propagatedTotals.get(species) ?? 0) + releaseCount,
            );
          }

          musselsPropagated += releaseCount;
          const latitude = Number(record.latitude);
          const longitude = Number(record.longitude);

          if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180 ||
            latitude === 0 ||
            longitude === 0
          ) {
            continue;
          }

          const coordinateKey = `${latitude},${longitude}`;
          const existing = grouped.get(coordinateKey);

          if (!existing) {
            grouped.set(coordinateKey, {
              coordinateKey,
              recordCount: 1,
              species: species ? [species] : [],
              latitude,
              longitude,
            });
            continue;
          }

          existing.recordCount += 1;
          if (species && !existing.species.includes(species)) {
            existing.species.push(species);
          }
        }

        for (const point of grouped.values()) {
          point.species.sort((left, right) => left.localeCompare(right));
        }

        const highestPropagatedSpecies = [...propagatedTotals.entries()]
          .sort((left, right) => right[1] - left[1])[0]?.[0] ?? "—";

        setReleaseSummary({
          releasesCompleted: records.length,
          releaseLocations: grouped.size,
          speciesPropagated: propagatedSpecies.size,
          musselsPropagated,
          highestPropagatedSpecies,
        });
        setReleaseMapPoints([...grouped.values()]);
        setIsReleaseSummaryLoading(false);
      } catch (error) {
        console.warn("Unable to load Release Database dashboard metrics.", error);
        if (!cancelled) {
          setReleaseMapPoints([]);
          setReleaseSummary(EMPTY_RELEASE_DASHBOARD_SUMMARY);
          setIsReleaseSummaryLoading(false);
        }
      }
    }

    void loadReleaseMapPoints();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    function refreshDraftCount() {
      const drafts = listSurveyDrafts(profile.uid);
      setDraftCount(drafts.length);
    }

    refreshDraftCount();

    window.addEventListener(
      WORKFLOW_SESSION_EVENT,
      refreshDraftCount,
    );
    window.addEventListener("storage", refreshDraftCount);

    return () => {
      window.removeEventListener(
        WORKFLOW_SESSION_EVENT,
        refreshDraftCount,
      );
      window.removeEventListener("storage", refreshDraftCount);
    };
  }, [profile.uid]);

  useEffect(() => {
    const loadState = { cancelled: false };

    async function loadSnapshotFromCache() {
      try {
        if (dashboardSnapshotRowsCache) {
          const meta = getCachedSnapshotMetadata();

          setSnapshotRows(dashboardSnapshotRowsCache);
          setSnapshotState(
            dashboardSnapshotRowsCache.length > 0 ? "ready" : "empty",
          );
          setSnapshotStatus(
            dashboardSnapshotRowsCache.length > 0
              ? `Production snapshot${meta?.version ? ` ${meta.version}` : ""} loaded.`
              : "The cached production snapshot contained no dashboard records.",
          );
          return;
        }

        setSnapshotState("loading");
        setSnapshotStatus("Loading cached NAIADD production snapshot...");

        const cachedMeta = getCachedSnapshotMetadata();
        const rows = await readDashboardSnapshotRowsOnce();

        if (loadState.cancelled) return;

        const meta = getCachedSnapshotMetadata();

        setSnapshotRows(rows);
        setSnapshotState(rows.length > 0 ? "ready" : "empty");
        setSnapshotStatus(
          rows.length > 0
            ? `Production snapshot${meta?.version ? ` ${meta.version}` : ""} loaded.`
            : cachedMeta
              ? "The cached production snapshot contained no dashboard records."
              : 'No cached production database is available. Click "Sync Database" to download one.',
        );
      } catch (error) {
        if (loadState.cancelled) return;

        console.error("Unable to load cached NAIADD snapshot dashboard metrics:", error);

        setSnapshotRows([]);
        setSnapshotState("error");
        setSnapshotStatus(
          error instanceof Error
            ? error.message
            : "Unable to read the cached NAIADD production snapshot.",
        );
      }
    }

    void loadSnapshotFromCache();

    return () => {
      loadState.cancelled = true;
    };
  }, []);

  async function handleSnapshotRefresh() {
    try {
      setIsSyncing(true);
      setSnapshotState("loading");
      setSnapshotStatus("Syncing NAIADD production database...");

      const result = await forceSyncSnapshot();
      const rows = await readSnapshotRows({
        columns: [...DASHBOARD_SNAPSHOT_COLUMNS],
      });

      setDashboardSnapshotRowsCache(rows);
      setSnapshotRows(rows);
      setSnapshotState(rows.length > 0 ? "ready" : "empty");
      setSnapshotStatus(result.message);
    } catch (error) {
      console.error("Unable to refresh NAIADD production snapshot:", error);

      setSnapshotState(snapshotRows.length > 0 ? "ready" : "error");
      setSnapshotStatus(
        error instanceof Error
          ? error.message
          : "Unable to refresh the NAIADD production snapshot.",
      );
    } finally {
      setIsSyncing(false);
    }
  }

  const isSnapshotLoading = snapshotState === "loading";


  return (
    <div className="home-dashboard-page">
      <SceneryHeader profile={profile} isOnline={isOnline} />

      <section className="home-dashboard-intro">
        <div>
          <p className="home-eyebrow">APPLICATION OVERVIEW</p>
          <h2>Dashboard</h2>

          <div className="home-dashboard-datetime">
            {new Intl.DateTimeFormat("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            }).format(now)}
            {" • "}
            {new Intl.DateTimeFormat("en-US", {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            }).format(now)}
          </div>
        </div>
      </section>

      <section className="home-database-toolbar" aria-label="Database snapshot status">
        <div className="home-database-status">
          <Database size={18} aria-hidden="true" />

          <div>
            <strong>NAIADD Production Database</strong>
            <span>{snapshotStatus}</span>
          </div>
        </div>

        <button
          type="button"
          className="home-snapshot-refresh"
          onClick={() => void handleSnapshotRefresh()}
          disabled={isSyncing}
        >
          <RefreshCw
            size={17}
            aria-hidden="true"
            className={isSyncing ? "spinning" : ""}
          />
          {isSyncing ? "Syncing" : "Sync Database"}
        </button>
      </section>

      <section className="home-metrics-grid">
        <MetricCard
          title="Surveys Completed"
          value={analytics.summary.surveysCompleted.toLocaleString()}
          icon={<ClipboardList size={30} />}
          isLoading={isSnapshotLoading}
          releaseTitle="Releases Completed"
          releaseValue={releaseSummary.releasesCompleted.toLocaleString()}
          isReleaseLoading={isReleaseSummaryLoading}
        />

        <MetricCard
          title="Sampled Locations"
          value={analytics.summary.sitesSampled.toLocaleString()}
          icon={<MapPin size={30} />}
          isLoading={isSnapshotLoading}
          releaseTitle="Release Locations"
          releaseValue={releaseSummary.releaseLocations.toLocaleString()}
          isReleaseLoading={isReleaseSummaryLoading}
        />

        <MetricCard
          title="Species Encountered"
          value={analytics.summary.speciesEncountered.toLocaleString()}
          icon={<Shell size={30} />}
          isLoading={isSnapshotLoading}
          releaseTitle="Species Propagated"
          releaseValue={releaseSummary.speciesPropagated.toLocaleString()}
          isReleaseLoading={isReleaseSummaryLoading}
        />

        <MetricCard
          title="Mussels Processed"
          value={formatWholeNumber(analytics.summary.musselsProcessed)}
          icon={<Ruler size={30} />}
          isLoading={isSnapshotLoading}
          releaseTitle="Mussels Propagated"
          releaseValue={formatWholeNumber(releaseSummary.musselsPropagated)}
          isReleaseLoading={isReleaseSummaryLoading}
        />

        <MetricCard
          title="Most Common Species"
          value={analytics.summary.mostCommonSpecies}
          icon={<BarChart3 size={30} />}
          isLoading={isSnapshotLoading}
          releaseTitle="Highest Propagated Species"
          releaseValue={releaseSummary.highestPropagatedSpecies}
          isReleaseLoading={isReleaseSummaryLoading}
          valueClassName="home-metric-value-species"
          releaseValueClassName="home-metric-value-species"
        />
      </section>

      <section className="home-draft-strip">
        <span>Saved survey drafts</span>
        <strong>{draftCount.toLocaleString()}</strong>
        <small>
          {draftCount === 1
            ? "1 survey available to continue"
            : `${draftCount} surveys available to continue`}
        </small>
      </section>

      <section className="home-activity-collapsible">
        <button
          type="button"
          className="home-activity-toggle"
          onClick={() => setIsRecentActivityOpen((current) => !current)}
          aria-expanded={isRecentActivityOpen}
          aria-controls="home-recent-surveys-panel"
        >
          <div>
            <p>DATABASE ACTIVITY</p>
            <h3>Recent Surveys</h3>
          </div>

          <div className="home-activity-toggle-meta">
            <span>{analytics.recentSurveys.length} newest surveys</span>
            <b className={isRecentActivityOpen ? "open" : ""} aria-hidden="true">▾</b>
          </div>
        </button>

        <div
          id="home-recent-surveys-panel"
          className={isRecentActivityOpen ? "home-activity-collapse open" : "home-activity-collapse"}
        >
          <div className="home-activity-collapse-inner">
            <div className="home-recent-list">
              {isSnapshotLoading ? (
                <div className="home-panel-empty">Loading recent surveys...</div>
              ) : analytics.recentSurveys.length === 0 ? (
                <div className="home-panel-empty">No recent survey records are available.</div>
              ) : (
                analytics.recentSurveys.map((survey) => (
                  <article className="home-recent-survey" key={survey.collectionID}>
                    <div className="home-recent-survey-top">
                      <div>
                        <strong>{survey.waterbody}</strong>
                        <span>{survey.collectionID}</span>
                      </div>
                      <time>{survey.dateLabel}</time>
                    </div>
                    <div className="home-recent-survey-meta">
                      <span>{survey.siteID}</span>
                      <span>{survey.method}</span>
                    </div>
                    <div className="home-recent-survey-stats">
                      <span><b>{formatWholeNumber(survey.musselCount)}</b> mussels</span>
                      <span><b>{survey.speciesCount.toLocaleString()}</b> species</span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="home-charts-grid home-dashboard-visuals-grid">
        <article className="home-panel home-chart-panel">
          <div className="home-panel-heading">
            <div>
              <p>SPECIMEN TOTALS</p>
              <h3>Top Species</h3>
            </div>
          </div>

          <ChartList
            rows={analytics.topSpecies}
            emptyText="No species totals are available."
          />
        </article>

        <article className="home-panel home-map-panel">
          <div className="home-panel-heading">
            <div>
              <p>SURVEY COVERAGE</p>
              <h3>Sampled Locations</h3>
            </div>
          </div>

          <SiteDistributionMap points={analytics.sitePoints} releasePoints={releaseMapPoints} />
        </article>
      </section>
    </div>
  );
}
