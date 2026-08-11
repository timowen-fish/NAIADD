import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Database,
  Shell,
  FolderKanban,
  LoaderCircle,
  Map as MapIcon,
  MapPin,
  Plus,
  SlidersHorizontal,
  Play,
  Save,
  FolderOpen,
  LandPlot,
  Target,
  ClipboardList,
  Wrench,
  UserRound,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Pentagon,
  Search,
  Trash2,
  RotateCw,
  Waves,
  X,
} from "lucide-react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Rectangle,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { divIcon, type LatLngBoundsExpression } from "leaflet";
import { area as turfArea, polygon as turfPolygon } from "@turf/turf";
import "leaflet/dist/leaflet.css";

import {
  getCachedSnapshotMetadata,
  readSnapshotRows,
} from "../services/snapshotService";
import {
  deleteSavedQueryData,
  loadQueryDataSession,
  loadSavedQueryData,
  saveAppliedQueryData,
  saveNamedQueryData,
  saveQueryDataSession,
  type QueryDataBoundaryType,
  type QueryDataCoordinate,
  type QueryDataCustomFilterField,
  type QueryDataCustomFilters,
  type QueryDataSession,
  type SavedQueryData,
} from "../services/queryDataSessionService";
import "../styles/QueryDataPage.css";

type SnapshotRow = Record<string, unknown>;

type CollectionMapPoint = {
  collectionID: string;
  collectionIDs: string[];
  surveyDate: string;
  timestamp: number;
  latitude: number;
  longitude: number;
  siteName: string;
  waterbody: string;
  species: string[];
  surveyors: string[];
  projects: string[];
  targetSpecies: string[];
  surveyTypes: string[];
  equipment: string[];
};

type InitialSiteMapPoint = CollectionMapPoint & {
  siteKey: string;
  collectionCount: number;
};

type MapLoadState = "idle" | "loading" | "ready" | "empty" | "error";

type QueryMapView = {
  center: [number, number];
  zoom: number;
};

type QueryBasemap = "satellite" | "street";
type AreaDrawingMode = "polygon" | "rectangle" | "circle" | null;

type BoundaryFeature = {
  id: string;
  label: string;
  type: Exclude<QueryDataBoundaryType, "">;
  feature: GeoJsonFeature;
};

type GeoJsonFeature = {
  type?: string;
  properties?: Record<string, unknown>;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
};

const cachedBoundaryFeatures: Partial<
  Record<Exclude<QueryDataBoundaryType, "">, BoundaryFeature[]>
> = {};

function ringArea(ring: number[][]): number {
  let area = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += current[0] * next[1] - next[0] * current[1];
  }

  return Math.abs(area / 2);
}

function featureOuterRing(feature: GeoJsonFeature): number[][] {
  const geometry = feature.geometry;
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];

  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    return Array.isArray(rings[0]) ? rings[0] : [];
  }

  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates as number[][][][];
    const outerRings = polygons
      .map((polygon) => (Array.isArray(polygon?.[0]) ? polygon[0] : []))
      .filter((ring) => ring.length >= 3);

    return outerRings.sort(
      (left, right) => ringArea(right) - ringArea(left),
    )[0] ?? [];
  }

  return [];
}

function simplifyBoundaryRing(
  ring: number[][],
  maxPoints = 650,
): QueryDataCoordinate[] {
  if (ring.length < 3) return [];

  const stride = Math.max(1, Math.ceil(ring.length / maxPoints));
  const simplified = ring
    .filter((_, index) => index % stride === 0 || index === ring.length - 1)
    .map(([longitude, latitude]) => ({
      latitude: Number(latitude),
      longitude: Number(longitude),
    }))
    .filter(
      (coordinate) =>
        Number.isFinite(coordinate.latitude) &&
        Number.isFinite(coordinate.longitude),
    );

  if (simplified.length >= 3) {
    const first = simplified[0];
    const last = simplified[simplified.length - 1];

    if (
      first.latitude === last.latitude &&
      first.longitude === last.longitude
    ) {
      simplified.pop();
    }
  }

  return simplified;
}

function featureIntersectsVirginia(feature: GeoJsonFeature): boolean {
  const geometry = feature.geometry;
  if (!geometry || !Array.isArray(geometry.coordinates)) return false;

  const stack: unknown[] = [geometry.coordinates];
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  while (stack.length > 0) {
    const current = stack.pop();

    if (!Array.isArray(current)) continue;

    if (
      current.length >= 2 &&
      typeof current[0] === "number" &&
      typeof current[1] === "number"
    ) {
      const longitude = current[0];
      const latitude = current[1];

      minLng = Math.min(minLng, longitude);
      maxLng = Math.max(maxLng, longitude);
      minLat = Math.min(minLat, latitude);
      maxLat = Math.max(maxLat, latitude);
      continue;
    }

    for (const item of current) {
      stack.push(item);
    }
  }

  if (![minLng, maxLng, minLat, maxLat].every(Number.isFinite)) {
    return false;
  }

  return (
    maxLng >= -83.75 &&
    minLng <= -75.0 &&
    maxLat >= 36.45 &&
    minLat <= 39.55
  );
}

function geometryToPolygons(feature: GeoJsonFeature): number[][][][] {
  const geometry = feature.geometry;

  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return [];
  }

  if (geometry.type === "Polygon") {
    return [geometry.coordinates as number[][][]];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates as number[][][][];
  }

  return [];
}

function mergeBoundaryFeatures(
  features: BoundaryFeature[],
): BoundaryFeature[] {
  const grouped = new Map<string, BoundaryFeature[]>();

  for (const feature of features) {
    const existing = grouped.get(feature.id) ?? [];
    existing.push(feature);
    grouped.set(feature.id, existing);
  }

  return [...grouped.values()].map((group) => {
    const first = group[0];

    if (group.length === 1) {
      return first;
    }

    const polygons = group.flatMap((item) =>
      geometryToPolygons(item.feature),
    );

    return {
      ...first,
      feature: {
        type: "Feature",
        properties: first.feature.properties,
        geometry: {
          type: "MultiPolygon",
          coordinates: polygons,
        },
      },
    };
  });
}

async function loadBoundaryFeatures(
  type: Exclude<QueryDataBoundaryType, "">,
): Promise<BoundaryFeature[]> {
  const cached = cachedBoundaryFeatures[type];
  if (cached) return cached;

  const url =
    type === "county"
      ? "/spatial/counties.geojson"
      : "/spatial/huc08.geojson";

  const response = await fetch(url, { cache: "force-cache" });

  if (!response.ok) {
    throw new Error(
      `Unable to load ${type === "county" ? "county" : "HUC8"} boundaries.`,
    );
  }

  const data = await response.json();
  const rawFeatures = (data?.features ?? []) as GeoJsonFeature[];

  const parsedFeatures = rawFeatures
    .filter((feature) =>
      type === "county" ? true : featureIntersectsVirginia(feature),
    )
    .map((feature) => {
      if (type === "county") {
        const label = String(feature.properties?.County_Nam ?? "").trim();
        const id = String(feature.properties?.FIPS ?? "").trim();

        if (!label) return null;

        return {
          id: `county:${id || label.toLowerCase()}`,
          label: `${label} County`,
          type,
          feature,
        } satisfies BoundaryFeature;
      }

      const name = String(feature.properties?.HUC8Name ?? "").trim();
      const code = String(feature.properties?.HUC8 ?? "").trim();

      if (!code) return null;

      return {
        id: `huc8:${code}`,
        label: name ? `${code} — ${name}` : code,
        type,
        feature,
      } satisfies BoundaryFeature;
    })
    .filter((feature): feature is BoundaryFeature => feature !== null);

  const features = mergeBoundaryFeatures(parsedFeatures).sort((left, right) =>
    left.label.localeCompare(right.label),
  );

  cachedBoundaryFeatures[type] = features;
  return features;
}

let cachedCollectionPoints: CollectionMapPoint[] | null = null;
let cachedCollectionPointsKey = "";
let cachedQueryMapView: QueryMapView = {
  center: [37.55, -78.5],
  zoom: 7,
};
let lastFittedCollectionKey = "";

const MAP_SNAPSHOT_COLUMNS = [
  "CollectionID",
  "SurveyDate",
  "Taxa",
  "ScientificName",
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
  "Collectors",
  "Project",
] as const;

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getValue(
  row: SnapshotRow,
  candidates: readonly string[],
): unknown {
  for (const candidate of candidates) {
    const value = row[candidate];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  const keysByLowerCase = new Map(
    Object.keys(row).map((key) => [key.toLowerCase(), key]),
  );

  for (const candidate of candidates) {
    const actualKey = keysByLowerCase.get(candidate.toLowerCase());
    if (!actualKey) continue;

    const value = row[actualKey];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return undefined;
}

function toText(value: unknown): string {
  return value === undefined || value === null
    ? ""
    : String(value).trim();
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;

  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseSurveyDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const numericDate = new Date(value);

    if (!Number.isNaN(numericDate.getTime())) {
      return numericDate;
    }
  }

  const text = toText(value);

  if (!text) return null;

  const parsed = new Date(text);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addUniqueValue(values: string[], value: string): void {
  if (value && !values.includes(value)) {
    values.push(value);
  }
}

function splitValues(value: unknown): string[] {
  const text = toText(value);

  if (!text) return [];

  return text
    .split(/[;,|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildInitialSitePoints(
  rows: SnapshotRow[],
): InitialSiteMapPoint[] {
  const sites = new Map<string, InitialSiteMapPoint>();
  const collectionsBySite = new Map<string, Set<string>>();

  for (const row of rows) {
    const latitude = toNumber(
      row.LatitudeDD ?? row.DownstreamLat,
    );
    const longitude = toNumber(
      row.LongitudeDD ?? row.DownstreamLong,
    );

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

    const siteName =
      toText(
        row.SiteName ??
          row.LocDescription ??
          row.SiteID ??
          row.SiteID_AccessDB ??
          row.SiteID_Previous,
      ) || "Unnamed site";

    const waterbody =
      toText(row.Waterbody ?? row.SiteName ?? row.LocDescription) ||
      "Unknown waterbody";

    const siteKey = [
      latitude.toFixed(6),
      longitude.toFixed(6),
      siteName,
      waterbody,
    ].join("|");

    let point = sites.get(siteKey);

    if (!point) {
      point = {
        siteKey,
        collectionCount: 0,
        collectionID: "",
        collectionIDs: [],
        surveyDate: "",
        timestamp: 0,
        latitude,
        longitude,
        siteName,
        waterbody,
        species: [],
        surveyors: [],
        projects: [],
        targetSpecies: [],
        surveyTypes: [],
        equipment: [],
      };

      sites.set(siteKey, point);
      collectionsBySite.set(siteKey, new Set<string>());
    }

    const collectionID = toText(row.CollectionID);
    if (collectionID) {
      const collectionIDs = collectionsBySite.get(siteKey)!;
      collectionIDs.add(collectionID);
      point.collectionCount = collectionIDs.size;
      point.collectionIDs = [...collectionIDs];

      if (!point.collectionID) {
        point.collectionID = collectionID;
      }
    }
  }

  return [...sites.values()];
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function buildCollectionPoints(rows: SnapshotRow[]): CollectionMapPoint[] {
  const pointsByCollection = new Map<string, CollectionMapPoint>();

  for (const row of rows) {
    const collectionID = toText(getValue(row, ["CollectionID"]));
    if (!collectionID) continue;

    const latitude = toNumber(
      getValue(row, ["LatitudeDD", "DownstreamLat"]),
    );
    const longitude = toNumber(
      getValue(row, ["LongitudeDD", "DownstreamLong"]),
    );

    const validCoordinates =
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180 &&
      latitude !== 0 &&
      longitude !== 0;

    if (!validCoordinates) continue;

    let point = pointsByCollection.get(collectionID);

    if (!point) {
      const surveyDate = parseSurveyDate(
        getValue(row, ["SurveyDate"]),
      );

      point = {
        collectionID,
        collectionIDs: [collectionID],
        surveyDate: surveyDate ? toDateInputValue(surveyDate) : "",
        timestamp: surveyDate?.getTime() ?? 0,
        latitude,
        longitude,
        siteName:
          toText(
            getValue(row, [
              "SiteName",
              "LocDescription",
              "SiteID",
              "SiteID_AccessDB",
              "SiteID_Previous",
            ]),
          ) || "Unnamed site",
        waterbody:
          toText(
            getValue(row, [
              "Waterbody",
              "SiteName",
              "LocDescription",
            ]),
          ) || "Unknown waterbody",
        species: [],
        surveyors: [],
        projects: [],
        targetSpecies: [],
        surveyTypes: [],
        equipment: [],
      };

      pointsByCollection.set(collectionID, point);
    }

    addUniqueValue(
      point.species,
      toText(getValue(row, ["ScientificName", "Taxa"])),
    );

    for (const collector of splitValues(
      getValue(row, ["Collectors"]),
    )) {
      addUniqueValue(point.surveyors, collector);
    }

    addUniqueValue(
      point.projects,
      toText(getValue(row, ["Project"])),
    );

    addUniqueValue(
      point.surveyTypes,
      toText(getValue(row, ["SamplingMethod"])),
    );
  }

  return [...pointsByCollection.values()];
}

function isPointInsidePolygon(
  point: CollectionMapPoint,
  polygon: QueryDataCoordinate[],
): boolean {
  if (polygon.length < 3) return true;

  let inside = false;
  const x = point.longitude;
  const y = point.latitude;

  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current++
  ) {
    const currentX = polygon[current].longitude;
    const currentY = polygon[current].latitude;
    const previousX = polygon[previous].longitude;
    const previousY = polygon[previous].latitude;

    const intersects =
      currentY > y !== previousY > y &&
      x <
        ((previousX - currentX) * (y - currentY)) /
          (previousY - currentY) +
          currentX;

    if (intersects) inside = !inside;
  }

  return inside;
}

type CustomFilterConfig = {
  field: QueryDataCustomFilterField;
  label: string;
  pointKey:
    | "collectionIDs"
    | "species"
    | "surveyors"
    | "projects"
    | "targetSpecies"
    | "surveyTypes"
    | "equipment";
  aliases: readonly string[];
  icon:
    | "collection"
    | "species"
    | "user"
    | "project"
    | "target"
    | "survey"
    | "equipment";
};

const CUSTOM_FILTER_OPTIONS: readonly CustomFilterConfig[] = [
  {
    field: "collectionID",
    label: "Collection ID",
    pointKey: "collectionIDs",
    icon: "collection",
    aliases: ["CollectionID"],
  },
  {
    field: "species",
    label: "Species",
    pointKey: "species",
    icon: "species",
    aliases: ["ScientificName", "Taxa"],
  },
  {
    field: "surveyor",
    label: "Collectors",
    pointKey: "surveyors",
    icon: "user",
    aliases: ["Collectors"],
  },
  {
    field: "project",
    label: "Project",
    pointKey: "projects",
    icon: "project",
    aliases: ["Project", "ProjectName"],
  },
  {
    field: "targetSpecies",
    label: "Target Species",
    pointKey: "targetSpecies",
    icon: "target",
    aliases: [
      "TargetSpeciesNew",
      "TargetSpecies_New",
      "Target Species New",
      "TargetSpecies",
      "Target_Species",
      "Target Species",
      "TargetSpeciesName",
      "Target_Species_Name",
      "TargetSpeciesCommonName",
      "TargetSpeciesScientificName",
      "Target_CommonName",
      "TargetSpeciesCode",
      "TargetSpecies_Code",
      "Target",
    ],
  },
  {
    field: "surveyType",
    label: "Survey Type",
    pointKey: "surveyTypes",
    icon: "survey",
    aliases: ["SamplingMethod"],
  },
  {
    field: "equipment",
    label: "Equipment",
    pointKey: "equipment",
    icon: "equipment",
    aliases: [
      "Equip",
      "Equipment",
      "EquipmentUsed",
      "Equipment_Used",
      "SamplingEquipment",
      "Sampling_Equipment",
      "Gear",
      "GearType",
      "Gear_Type",
    ],
  },
];

function getCustomFilterConfig(
  field: QueryDataCustomFilterField,
): CustomFilterConfig {
  const config = CUSTOM_FILTER_OPTIONS.find(
    (option) => option.field === field,
  );

  if (!config) {
    throw new Error(`Unsupported custom filter: ${field}`);
  }

  return config;
}

function getCustomFieldValues(
  point: CollectionMapPoint,
  field: QueryDataCustomFilterField,
): string[] {
  const config = getCustomFilterConfig(field);
  return point[config.pointKey];
}

function getCustomFilterIcon(field: QueryDataCustomFilterField) {
  const icon = getCustomFilterConfig(field).icon;

  switch (icon) {
    case "collection":
      return <ClipboardList size={20} />;
    case "species":
      return <Shell size={20} />;
    case "user":
      return <UserRound size={20} />;
    case "project":
      return <FolderKanban size={20} />;
    case "target":
      return <Target size={20} />;
    case "survey":
      return <ClipboardList size={20} />;
    case "equipment":
      return <Wrench size={20} />;
  }
}

function getCustomFilterLabel(
  field: QueryDataCustomFilterField,
): string {
  return getCustomFilterConfig(field).label;
}



function formatIsoDateForEntry(value: string): string {
  if (!value) return "";

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;

  return `${match[2]}/${match[3]}/${match[1]}`;
}

function formatDateDigits(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseDateEntry(value: string): string | null {
  const text = value.trim();
  if (!text) return "";

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slashMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);

  let year: number;
  let month: number;
  let day: number;

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (slashMatch) {
    month = Number(slashMatch[1]);
    day = Number(slashMatch[2]);
    year = Number(slashMatch[3]);
  } else {
    return null;
  }

  const candidate = new Date(year, month - 1, day);

  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0",
  )}-${String(day).padStart(2, "0")}`;
}

function QueryDateInput({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(() => formatIsoDateForEntry(value));
  const [invalid, setInvalid] = useState(false);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(formatIsoDateForEntry(value));
    setInvalid(false);
  }, [value]);

  function commitDraft(): void {
    const parsed = parseDateEntry(draft);

    if (parsed === null) {
      setInvalid(true);
      return;
    }

    if ((min && parsed && parsed < min) || (max && parsed && parsed > max)) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    onChange(parsed);
    setDraft(formatIsoDateForEntry(parsed));
  }

  function openPicker(): void {
    const picker = pickerRef.current;
    if (!picker || disabled) return;

    if (typeof picker.showPicker === "function") {
      picker.showPicker();
    } else {
      picker.focus();
      picker.click();
    }
  }

  return (
    <label className={invalid ? "query-data-date-entry invalid" : "query-data-date-entry"}>
      <span>{label}</span>

      <div className="query-data-date-input-shell">
        <input
          className="query-data-date-text-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={draft}
          placeholder="MM/DD/YYYY"
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(event) => {
            setDraft(formatDateDigits(event.target.value));
            setInvalid(false);
          }}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraft();
              event.currentTarget.blur();
            }
          }}
        />

        <button
          type="button"
          className="query-data-date-picker-button"
          onClick={openPicker}
          disabled={disabled}
          aria-label={`Open ${label.toLowerCase()} calendar`}
          title="Choose from calendar"
        >
          <CalendarDays size={17} />
        </button>

        <input
          ref={pickerRef}
          className="query-data-native-date-picker"
          type="date"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>

      <small className="query-data-date-format-hint">
        {invalid ? "Use MM/DD/YYYY." : "MM/DD/YYYY"}
      </small>
    </label>
  );
}



function buildRectanglePolygon(
  start: QueryDataCoordinate,
  end: QueryDataCoordinate,
): QueryDataCoordinate[] {
  return [
    { latitude: start.latitude, longitude: start.longitude },
    { latitude: start.latitude, longitude: end.longitude },
    { latitude: end.latitude, longitude: end.longitude },
    { latitude: end.latitude, longitude: start.longitude },
  ];
}

function haversineMeters(
  start: QueryDataCoordinate,
  end: QueryDataCoordinate,
): number {
  const earthRadius = 6371008.8;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(start.latitude);
  const lat2 = toRadians(end.latitude);
  const deltaLat = toRadians(end.latitude - start.latitude);
  const deltaLon = toRadians(end.longitude - start.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function destinationCoordinate(
  center: QueryDataCoordinate,
  distanceMeters: number,
  bearingDegrees: number,
): QueryDataCoordinate {
  const earthRadius = 6371008.8;
  const angularDistance = distanceMeters / earthRadius;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const latitude1 = (center.latitude * Math.PI) / 180;
  const longitude1 = (center.longitude * Math.PI) / 180;

  const latitude2 = Math.asin(
    Math.sin(latitude1) * Math.cos(angularDistance) +
      Math.cos(latitude1) *
        Math.sin(angularDistance) *
        Math.cos(bearing),
  );

  const longitude2 =
    longitude1 +
    Math.atan2(
      Math.sin(bearing) *
        Math.sin(angularDistance) *
        Math.cos(latitude1),
      Math.cos(angularDistance) -
        Math.sin(latitude1) * Math.sin(latitude2),
    );

  return {
    latitude: (latitude2 * 180) / Math.PI,
    longitude: (longitude2 * 180) / Math.PI,
  };
}

function buildCirclePolygon(
  center: QueryDataCoordinate,
  edge: QueryDataCoordinate,
  segments = 64,
): QueryDataCoordinate[] {
  const radiusMeters = haversineMeters(center, edge);

  return Array.from({ length: segments }, (_, index) =>
    destinationCoordinate(
      center,
      radiusMeters,
      (index / segments) * 360,
    ),
  );
}

function polygonAreaSquareMiles(
  coordinates: QueryDataCoordinate[],
): number {
  if (coordinates.length < 3) return 0;

  try {
    const ring = [
      ...coordinates.map((coordinate) => [
        coordinate.longitude,
        coordinate.latitude,
      ]),
      [coordinates[0].longitude, coordinates[0].latitude],
    ];

    return turfArea(turfPolygon([ring])) / 2_589_988.110336;
  } catch {
    return 0;
  }
}

function formatArea(squareMiles: number): string {
  if (!Number.isFinite(squareMiles) || squareMiles <= 0) return "";

  if (squareMiles < 1) {
    return `${(squareMiles * 640).toFixed(1)} acres`;
  }

  return `${squareMiles.toFixed(squareMiles < 10 ? 2 : 1)} sq mi`;
}



function areaVertexIcon(index: number) {
  return divIcon({
    className: "query-data-area-vertex-marker",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<span>${index + 1}</span>`,
  });
}


function isInitialSitePoint(
  point: CollectionMapPoint | InitialSiteMapPoint,
): point is InitialSiteMapPoint {
  return "siteKey" in point;
}

function QueryMapViewTracker() {
  const map = useMap();

  useEffect(() => {
    const saveView = () => {
      const center = map.getCenter();
      cachedQueryMapView = {
        center: [center.lat, center.lng],
        zoom: map.getZoom(),
      };
    };

    map.on("moveend", saveView);
    map.on("zoomend", saveView);

    return () => {
      map.off("moveend", saveView);
      map.off("zoomend", saveView);
    };
  }, [map]);

  return null;
}

function AreaDrawingController({
  mode,
  onAddPoint,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  mode: AreaDrawingMode;
  onAddPoint: (coordinate: QueryDataCoordinate) => void;
  onDragStart: (coordinate: QueryDataCoordinate) => void;
  onDragMove: (coordinate: QueryDataCoordinate) => void;
  onDragEnd: (coordinate: QueryDataCoordinate) => void;
}) {
  const map = useMap();
  const dragStartRef = useRef<QueryDataCoordinate | null>(null);

  useEffect(() => {
    const drawingShape = mode === "rectangle" || mode === "circle";

    if (drawingShape) {
      map.dragging.disable();
      map.boxZoom.disable();
      map.doubleClickZoom.disable();
      map.getContainer().classList.add("query-data-shape-drawing");
    } else {
      map.dragging.enable();
      map.boxZoom.enable();
      map.doubleClickZoom.enable();
      map.getContainer().classList.remove("query-data-shape-drawing");
    }

    return () => {
      map.dragging.enable();
      map.boxZoom.enable();
      map.doubleClickZoom.enable();
      map.getContainer().classList.remove("query-data-shape-drawing");
    };
  }, [map, mode]);

  useMapEvents({
    click(event) {
      if (mode !== "polygon") return;

      onAddPoint({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
    mousedown(event) {
      if (mode !== "rectangle" && mode !== "circle") return;

      const coordinate = {
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      };

      dragStartRef.current = coordinate;
      onDragStart(coordinate);
    },
    mousemove(event) {
      if (
        !dragStartRef.current ||
        (mode !== "rectangle" && mode !== "circle")
      ) {
        return;
      }

      onDragMove({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
    mouseup(event) {
      if (
        !dragStartRef.current ||
        (mode !== "rectangle" && mode !== "circle")
      ) {
        return;
      }

      dragStartRef.current = null;
      onDragEnd({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
    mouseout(event) {
      if (
        !dragStartRef.current ||
        (mode !== "rectangle" && mode !== "circle")
      ) {
        return;
      }

      onDragMove({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
  });

  return null;
}

function FitMapToBoundary({
  polygon,
  enabled,
}: {
  polygon: QueryDataCoordinate[];
  enabled: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || polygon.length < 3) return;

    const bounds = polygon.map(
      (coordinate) =>
        [coordinate.latitude, coordinate.longitude] as [number, number],
    ) as LatLngBoundsExpression;

    map.fitBounds(bounds, {
      padding: [30, 30],
      maxZoom: 11,
    });
  }, [enabled, map, polygon]);

  return null;
}

function FitMapToPoints({
  points,
  disabled = false,
}: {
  points: CollectionMapPoint[];
  disabled?: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (disabled) return;

    const collectionKey = points
      .map((point) => point.collectionID)
      .sort()
      .join("|");

    if (collectionKey === lastFittedCollectionKey) {
      return;
    }

    lastFittedCollectionKey = collectionKey;

    if (points.length === 0) {
      return;
    }

    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 13);
      return;
    }

    const bounds = points.map(
      (point) => [point.latitude, point.longitude] as [number, number],
    ) as LatLngBoundsExpression;

    map.fitBounds(bounds, {
      padding: [30, 30],
      maxZoom: 13,
    });
  }, [disabled, map, points]);

  return null;
}

export default function QueryDataPage() {
  const snapshotMeta = useMemo(() => getCachedSnapshotMetadata(), []);
  const initialSession = useMemo(() => loadQueryDataSession(), []);
  const snapshotCacheKey = useMemo(
    () => JSON.stringify(snapshotMeta ?? null),
    [snapshotMeta],
  );
  const hasReusableCollectionCache =
    cachedCollectionPoints !== null &&
    cachedCollectionPointsKey === snapshotCacheKey;

  const [startDate, setStartDate] = useState(initialSession.startDate);
  const [endDate, setEndDate] = useState(initialSession.endDate);
  const [areaPolygon, setAreaPolygon] = useState<QueryDataCoordinate[]>(
    initialSession.areaPolygon,
  );
  const [areaBoundaryType, setAreaBoundaryType] =
    useState<QueryDataBoundaryType>(initialSession.areaBoundaryType);
  const [areaBoundaryId, setAreaBoundaryId] = useState(
    initialSession.areaBoundaryId,
  );
  const [areaBoundaryLabel, setAreaBoundaryLabel] = useState(
    initialSession.areaBoundaryLabel,
  );
  const [boundaryFeatures, setBoundaryFeatures] = useState<BoundaryFeature[]>([]);
  const [boundaryLoadState, setBoundaryLoadState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [boundaryError, setBoundaryError] = useState("");
  const [showExistingBoundary, setShowExistingBoundary] = useState(false);
  const [boundarySearchText, setBoundarySearchText] = useState("");
  const [shouldFitBoundary, setShouldFitBoundary] = useState(false);
  const [selectedSiteNames, setSelectedSiteNames] = useState<string[]>(
    initialSession.selectedSiteNames,
  );
  const [siteSearchText, setSiteSearchText] = useState("");
  const [selectedWaterbodies, setSelectedWaterbodies] = useState<string[]>(
    initialSession.selectedWaterbodies,
  );
  const [waterbodySearchText, setWaterbodySearchText] = useState("");
  const [isAreaFilterCollapsed, setIsAreaFilterCollapsed] =
    useState(true);
  const [isSiteFilterCollapsed, setIsSiteFilterCollapsed] =
    useState(true);
  const [isWaterbodyFilterCollapsed, setIsWaterbodyFilterCollapsed] =
    useState(true);
  const [activeCustomFilterFields, setActiveCustomFilterFields] =
    useState<QueryDataCustomFilterField[]>(
      initialSession.activeCustomFilterFields,
    );
  const [customFilters, setCustomFilters] =
    useState<QueryDataCustomFilters>(initialSession.customFilters);
  const [customFilterSearch, setCustomFilterSearch] = useState<
    Partial<Record<QueryDataCustomFilterField, string>>
  >({});
  const [collapsedCustomFilters, setCollapsedCustomFilters] =
    useState<Partial<Record<QueryDataCustomFilterField, boolean>>>(
      () =>
        Object.fromEntries(
          initialSession.activeCustomFilterFields.map((field) => [
            field,
            true,
          ]),
        ),
    );
  const [showAddFilterMenu, setShowAddFilterMenu] = useState(false);
  const [savedQueries, setSavedQueries] = useState<SavedQueryData[]>(
    () => loadSavedQueryData(),
  );
  const [isSavedQueriesCollapsed, setIsSavedQueriesCollapsed] =
    useState(true);
  const [savedQueryName, setSavedQueryName] = useState("");
  const [selectedSavedQueryId, setSelectedSavedQueryId] = useState("");
  const [savedQueryNotice, setSavedQueryNotice] = useState("");
  const [appliedQuerySession, setAppliedQuerySession] =
    useState<QueryDataSession>(initialSession);
  const [shouldFitAppliedPoints, setShouldFitAppliedPoints] =
    useState(false);
  const [basemap, setBasemap] = useState<QueryBasemap>("satellite");
  const [mapRefreshKey, setMapRefreshKey] = useState(0);
  const [areaDrawingMode, setAreaDrawingMode] =
    useState<AreaDrawingMode>(null);
  const [areaDragStart, setAreaDragStart] =
    useState<QueryDataCoordinate | null>(null);
  const [areaDragCurrent, setAreaDragCurrent] =
    useState<QueryDataCoordinate | null>(null);
  const [collectionPoints, setCollectionPoints] = useState<
    CollectionMapPoint[]
  >(() =>
    hasReusableCollectionCache
      ? cachedCollectionPoints ?? []
      : [],
  );
  const [initialSitePoints, setInitialSitePoints] = useState<
    InitialSiteMapPoint[]
  >([]);
  const [hasAppliedMapQuery, setHasAppliedMapQuery] = useState(false);
  const [appliedMapPoints, setAppliedMapPoints] = useState<
    CollectionMapPoint[]
  >([]);
  const [queryIndexReady, setQueryIndexReady] = useState(
    hasReusableCollectionCache,
  );
  const [mapLoadState, setMapLoadState] = useState<MapLoadState>(
    hasReusableCollectionCache ? "ready" : "idle",
  );
  const [mapStatus, setMapStatus] = useState(
    hasReusableCollectionCache
      ? `${(cachedCollectionPoints?.length ?? 0).toLocaleString()} unique mapped collections restored.`
      : "Waiting for the cached snapshot.",
  );
  const baseSiteNames = useMemo(
    () =>
      [...new Set(collectionPoints.map((point) => point.siteName))]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [collectionPoints],
  );
  const baseWaterbodies = useMemo(
    () =>
      [...new Set(collectionPoints.map((point) => point.waterbody))]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [collectionPoints],
  );

  const snapshotAvailable = Boolean(snapshotMeta);

  const hasDateFilter = Boolean(startDate || endDate);
  const invalidDateRange =
    Boolean(startDate && endDate) && startDate > endDate;
  const isDrawingArea = areaDrawingMode !== null;
  const areaSquareMiles = useMemo(
    () => polygonAreaSquareMiles(areaPolygon),
    [areaPolygon],
  );
  const liveShapePolygon = useMemo(() => {
    if (!areaDragStart || !areaDragCurrent) return [];

    if (areaDrawingMode === "rectangle") {
      return buildRectanglePolygon(areaDragStart, areaDragCurrent);
    }

    if (areaDrawingMode === "circle") {
      return buildCirclePolygon(areaDragStart, areaDragCurrent);
    }

    return [];
  }, [areaDragCurrent, areaDragStart, areaDrawingMode]);

  const previewAreaSquareMiles = useMemo(
    () => polygonAreaSquareMiles(liveShapePolygon),
    [liveShapePolygon],
  );

  const liveCircleRadiusMeters = useMemo(
    () =>
      areaDrawingMode === "circle" && areaDragStart && areaDragCurrent
        ? haversineMeters(areaDragStart, areaDragCurrent)
        : 0,
    [areaDragCurrent, areaDragStart, areaDrawingMode],
  );

  const deferredStartDate = useDeferredValue(startDate);
  const deferredEndDate = useDeferredValue(endDate);
  const deferredAreaPolygon = useDeferredValue(areaPolygon);
  const deferredSelectedSiteNames = useDeferredValue(selectedSiteNames);
  const deferredSiteSearchText = useDeferredValue(siteSearchText);
  const deferredSelectedWaterbodies =
    useDeferredValue(selectedWaterbodies);
  const deferredWaterbodySearchText =
    useDeferredValue(waterbodySearchText);
  const deferredCustomFilters = useDeferredValue(customFilters);

  const visibleBoundaryFeatures = useMemo(() => {
    const normalizedSearch = boundarySearchText.trim().toLowerCase();

    return boundaryFeatures
      .filter(
        (feature) =>
          !normalizedSearch ||
          feature.label.toLowerCase().includes(normalizedSearch),
      )
      .slice(0, 250);
  }, [areaBoundaryType, boundaryFeatures, boundarySearchText]);


  useEffect(() => {
    if (!showExistingBoundary || !areaBoundaryType) {
      setBoundaryFeatures([]);
      setBoundaryLoadState("idle");
      setBoundaryError("");
      return;
    }

    let cancelled = false;
    setBoundaryLoadState("loading");
    setBoundaryError("");
    setBoundaryFeatures([]);

    void loadBoundaryFeatures(areaBoundaryType)
      .then((features) => {
        if (cancelled) return;
        setBoundaryFeatures(features);
        setBoundaryLoadState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setBoundaryLoadState("error");
        setBoundaryError(
          error instanceof Error
            ? error.message
            : "Unable to load existing boundaries.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [areaBoundaryType, showExistingBoundary]);

  useEffect(() => {
    saveQueryDataSession({
      startDate,
      endDate,
      areaPolygon,
      areaBoundaryType,
      areaBoundaryId,
      areaBoundaryLabel,
      selectedSiteNames,
      selectedWaterbodies,
      activeCustomFilterFields,
      customFilters,
    });
  }, [
    activeCustomFilterFields,
    areaBoundaryId,
    areaBoundaryLabel,
    areaBoundaryType,
    areaPolygon,
    customFilters,
    endDate,
    selectedSiteNames,
    selectedWaterbodies,
    startDate,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadMapAndQueryData() {
      if (!snapshotAvailable) {
        setMapLoadState("empty");
        setMapStatus("No cached NAIADD production snapshot is available.");
        return;
      }

      setMapLoadState("loading");
      setMapStatus("Reading mapped sites from the cached NAIADD snapshot...");

      try {
        const rows = await readSnapshotRows({
          columns: [...MAP_SNAPSHOT_COLUMNS],
        });

        if (cancelled) return;

        const sites = buildInitialSitePoints(rows);
        setInitialSitePoints(sites);

        if (sites.length === 0) {
          setMapLoadState("empty");
          setMapStatus(
            "No rows with valid LatitudeDD/LongitudeDD or downstream coordinates were found.",
          );
          return;
        }

        setMapLoadState("ready");
        setMapStatus(
          `${sites.length.toLocaleString()} mapped sites loaded.`,
        );

        // Let the lightweight site map render before building the full
        // collection/filter index.
        await nextPaint();
        await nextPaint();

        if (cancelled) return;

        if (
          cachedCollectionPoints !== null &&
          cachedCollectionPointsKey === snapshotCacheKey
        ) {
          setCollectionPoints(cachedCollectionPoints);
          setQueryIndexReady(true);
          return;
        }

        const points = buildCollectionPoints(rows);

        if (cancelled) return;

        cachedCollectionPoints = points;
        cachedCollectionPointsKey = snapshotCacheKey;
        setCollectionPoints(points);
        setQueryIndexReady(true);
      } catch (error) {
        if (cancelled) return;

        console.error("Unable to load Query Data map points.", error);
        setInitialSitePoints([]);
        setCollectionPoints([]);
        setQueryIndexReady(false);
        setMapLoadState("error");
        setMapStatus(
          error instanceof Error
            ? error.message
            : "Unable to read mapped sites from the cached NAIADD snapshot.",
        );
      }
    }

    void loadMapAndQueryData();

    return () => {
      cancelled = true;
    };
  }, [snapshotAvailable, snapshotCacheKey]);

  const areaAndDateFilteredPoints = useMemo(() => {
    if (invalidDateRange) return [];

    if (
      !deferredStartDate &&
      !deferredEndDate &&
      deferredAreaPolygon.length < 3
    ) {
      return collectionPoints;
    }

    const startTimestamp = deferredStartDate
      ? new Date(`${deferredStartDate}T00:00:00`).getTime()
      : Number.NEGATIVE_INFINITY;

    const endTimestamp = deferredEndDate
      ? new Date(`${deferredEndDate}T23:59:59.999`).getTime()
      : Number.POSITIVE_INFINITY;

    return collectionPoints.filter((point) => {
      const dateMatches =
        !deferredStartDate && !deferredEndDate
          ? true
          : point.timestamp > 0 &&
            point.timestamp >= startTimestamp &&
            point.timestamp <= endTimestamp;

      return (
        dateMatches &&
        isPointInsidePolygon(point, deferredAreaPolygon)
      );
    });
  }, [
    collectionPoints,
    deferredAreaPolygon,
    deferredEndDate,
    deferredStartDate,
    invalidDateRange,
  ]);

  const availableSiteNames = useMemo(() => {
    if (
      !deferredStartDate &&
      !deferredEndDate &&
      deferredAreaPolygon.length < 3
    ) {
      return baseSiteNames;
    }

    return [...new Set(areaAndDateFilteredPoints.map((point) => point.siteName))]
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }, [
    areaAndDateFilteredPoints,
    baseSiteNames,
    deferredAreaPolygon,
    deferredEndDate,
    deferredStartDate,
  ]);

  const visibleSiteNames = useMemo(() => {
    const normalizedSearch = deferredSiteSearchText.trim().toLowerCase();

    if (!normalizedSearch) {
      return availableSiteNames;
    }

    return availableSiteNames.filter((siteName) =>
      siteName.toLowerCase().includes(normalizedSearch),
    );
  }, [availableSiteNames, deferredSiteSearchText]);

  useEffect(() => {
    setSelectedSiteNames((current) =>
      current.filter((siteName) => availableSiteNames.includes(siteName)),
    );
  }, [availableSiteNames]);

  const siteFilteredPoints = useMemo(() => {
    if (deferredSelectedSiteNames.length === 0) {
      return areaAndDateFilteredPoints;
    }

    const selected = new Set(deferredSelectedSiteNames);

    return areaAndDateFilteredPoints.filter((point) =>
      selected.has(point.siteName),
    );
  }, [areaAndDateFilteredPoints, deferredSelectedSiteNames]);

  const availableWaterbodies = useMemo(() => {
    if (
      deferredSelectedSiteNames.length === 0 &&
      !deferredStartDate &&
      !deferredEndDate &&
      deferredAreaPolygon.length < 3
    ) {
      return baseWaterbodies;
    }

    return [...new Set(siteFilteredPoints.map((point) => point.waterbody))]
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }, [
    baseWaterbodies,
    deferredAreaPolygon,
    deferredEndDate,
    deferredSelectedSiteNames,
    deferredStartDate,
    siteFilteredPoints,
  ]);

  const visibleWaterbodies = useMemo(() => {
    const normalizedSearch =
      deferredWaterbodySearchText.trim().toLowerCase();

    if (!normalizedSearch) {
      return availableWaterbodies;
    }

    return availableWaterbodies.filter((waterbody) =>
      waterbody.toLowerCase().includes(normalizedSearch),
    );
  }, [availableWaterbodies, deferredWaterbodySearchText]);

  useEffect(() => {
    setSelectedWaterbodies((current) =>
      current.filter((waterbody) =>
        availableWaterbodies.includes(waterbody),
      ),
    );
  }, [availableWaterbodies]);

  const standardFilteredPoints = useMemo(() => {
    if (deferredSelectedWaterbodies.length === 0) {
      return siteFilteredPoints;
    }

    const selected = new Set(deferredSelectedWaterbodies);

    return siteFilteredPoints.filter((point) =>
      selected.has(point.waterbody),
    );
  }, [deferredSelectedWaterbodies, siteFilteredPoints]);

  const availableCustomValues = useMemo(() => {
    const result: Partial<
      Record<QueryDataCustomFilterField, string[]>
    > = {};

    for (const field of activeCustomFilterFields) {
      const eligiblePoints = standardFilteredPoints.filter((point) =>
        activeCustomFilterFields.every((otherField) => {
          if (otherField === field) return true;

          const selected = deferredCustomFilters[otherField] ?? [];
          if (selected.length === 0) return true;

          const pointValues = getCustomFieldValues(point, otherField);
          return selected.some((value) => pointValues.includes(value));
        }),
      );

      result[field] = [
        ...new Set(
          eligiblePoints.flatMap((point) =>
            getCustomFieldValues(point, field),
          ),
        ),
      ].sort((left, right) => left.localeCompare(right));
    }

    return result;
  }, [
    activeCustomFilterFields,
    deferredCustomFilters,
    standardFilteredPoints,
  ]);

  useEffect(() => {
    setCustomFilters((current) => {
      let changed = false;
      const next = { ...current };

      for (const field of activeCustomFilterFields) {
        const available = availableCustomValues[field] ?? [];
        const selected = current[field] ?? [];
        const valid = selected.filter((value) =>
          available.includes(value),
        );

        if (valid.length !== selected.length) {
          changed = true;
          next[field] = valid;
        }
      }

      return changed ? next : current;
    });
  }, [activeCustomFilterFields, availableCustomValues]);

  function filterCollectionPoints(
    session: QueryDataSession,
  ): CollectionMapPoint[] {
    if (
      session.startDate &&
      session.endDate &&
      session.startDate > session.endDate
    ) {
      return [];
    }

    const startTimestamp = session.startDate
      ? new Date(`${session.startDate}T00:00:00`).getTime()
      : Number.NEGATIVE_INFINITY;
    const endTimestamp = session.endDate
      ? new Date(`${session.endDate}T23:59:59.999`).getTime()
      : Number.POSITIVE_INFINITY;
    const selectedSites = new Set(session.selectedSiteNames);
    const selectedWaterbodiesSet = new Set(session.selectedWaterbodies);

    return collectionPoints.filter((point) => {
      const dateMatches =
        !session.startDate && !session.endDate
          ? true
          : point.timestamp > 0 &&
            point.timestamp >= startTimestamp &&
            point.timestamp <= endTimestamp;

      if (
        !dateMatches ||
        !isPointInsidePolygon(point, session.areaPolygon)
      ) {
        return false;
      }

      if (
        selectedSites.size > 0 &&
        !selectedSites.has(point.siteName)
      ) {
        return false;
      }

      if (
        selectedWaterbodiesSet.size > 0 &&
        !selectedWaterbodiesSet.has(point.waterbody)
      ) {
        return false;
      }

      return session.activeCustomFilterFields.every((field) => {
        const selected = session.customFilters[field] ?? [];
        if (selected.length === 0) return true;

        const pointValues = getCustomFieldValues(point, field);
        return selected.some((value) => pointValues.includes(value));
      });
    });
  }

  const appliedFilteredPoints = appliedMapPoints;

  const displayedMapPoints = hasAppliedMapQuery
    ? appliedFilteredPoints
    : initialSitePoints;

  const shouldFitDisplayedPoints =
    hasAppliedMapQuery ? shouldFitAppliedPoints : false;

  useEffect(() => {
    if (mapLoadState !== "ready" || !hasAppliedMapQuery) return;

    saveAppliedQueryData(
      appliedQuerySession,
      appliedFilteredPoints.map((point) => point.collectionID),
    );
  }, [
    appliedFilteredPoints,
    appliedQuerySession,
    hasAppliedMapQuery,
    mapLoadState,
  ]);

  const currentQuerySession = getCurrentQuerySession();
  const queryHasUnappliedChanges =
    JSON.stringify(currentQuerySession) !==
    JSON.stringify(appliedQuerySession);
  const displayedAreaPolygon =
    areaPolygon.length >= 2
      ? areaPolygon
      : appliedQuerySession.areaPolygon;


  function getCurrentQuerySession(): QueryDataSession {
    return {
      startDate,
      endDate,
      areaPolygon,
      areaBoundaryType,
      areaBoundaryId,
      areaBoundaryLabel,
      selectedSiteNames,
      selectedWaterbodies,
      activeCustomFilterFields,
      customFilters,
    };
  }

  function applyQuerySession(session: QueryDataSession) {
    setStartDate(session.startDate);
    setEndDate(session.endDate);
    setAreaPolygon(session.areaPolygon);
    setAreaDragStart(null);
    setAreaDragCurrent(null);
    setAreaBoundaryType(session.areaBoundaryType);
    setAreaBoundaryId(session.areaBoundaryId);
    setAreaBoundaryLabel(session.areaBoundaryLabel);
    setAreaDrawingMode(null);
    setShowExistingBoundary(false);
    setSelectedSiteNames(session.selectedSiteNames);
    setSiteSearchText("");
    setSelectedWaterbodies(session.selectedWaterbodies);
    setWaterbodySearchText("");
    setActiveCustomFilterFields(session.activeCustomFilterFields);
    setCustomFilters(session.customFilters);
    setCustomFilterSearch({});
    setCollapsedCustomFilters(
      Object.fromEntries(
        session.activeCustomFilterFields.map((field) => [field, true]),
      ),
    );
    setShowAddFilterMenu(false);
  }

  function saveCurrentQuery() {
    const name = savedQueryName.trim();

    if (!name) {
      setSavedQueryNotice("Enter a name before saving this query.");
      return;
    }

    const next = saveNamedQueryData(
      name,
      getCurrentQuerySession(),
      selectedSavedQueryId || undefined,
    );
    const saved = next.find(
      (query) => query.name.toLowerCase() === name.toLowerCase(),
    );

    setSavedQueries(next);
    setSelectedSavedQueryId(saved?.id ?? "");
    setSavedQueryName(saved?.name ?? name);
    setSavedQueryNotice(saved ? `Saved “${saved.name}”.` : "Query saved.");
  }

  function loadSelectedSavedQuery(id: string) {
    setSelectedSavedQueryId(id);

    const saved = savedQueries.find((query) => query.id === id);
    if (!saved) {
      setSavedQueryName("");
      setSavedQueryNotice("");
      return;
    }

    applyQuerySession(saved.session);
    setSavedQueryName(saved.name);
    setSavedQueryNotice(`Loaded “${saved.name}”.`);
  }

  function deleteSelectedSavedQuery() {
    if (!selectedSavedQueryId) return;

    const deleted = savedQueries.find(
      (query) => query.id === selectedSavedQueryId,
    );
    setSavedQueries(deleteSavedQueryData(selectedSavedQueryId));
    setSelectedSavedQueryId("");
    setSavedQueryName("");
    setSavedQueryNotice(
      deleted ? `Deleted “${deleted.name}”.` : "Saved query deleted.",
    );
  }

  function applyQueryToMap() {
    if (
      invalidDateRange ||
      !snapshotAvailable ||
      !queryIndexReady
    ) {
      return;
    }

    const nextSession = getCurrentQuerySession();
    const nextPoints = filterCollectionPoints(nextSession);

    setAppliedQuerySession(nextSession);
    setAppliedMapPoints(nextPoints);
    setHasAppliedMapQuery(true);
    setShouldFitAppliedPoints(true);
  }

  function refineQueryToSite(point: CollectionMapPoint): void {
    if (!snapshotAvailable || !queryIndexReady) {
      return;
    }

    const nextSession: QueryDataSession = {
      ...getCurrentQuerySession(),
      selectedSiteNames: [point.siteName],
    };
    const nextPoints = filterCollectionPoints(nextSession);

    applyQuerySession(nextSession);
    setAppliedQuerySession(nextSession);
    setAppliedMapPoints(nextPoints);
    setHasAppliedMapQuery(true);
    setShouldFitAppliedPoints(true);
    setIsSiteFilterCollapsed(true);
  }

  function clearDateFilter() {
    setStartDate("");
    setEndDate("");
  }

  function startAreaDrawing(mode: Exclude<AreaDrawingMode, null>) {
    if (areaDrawingMode === mode) {
      if (mode === "polygon" && areaPolygon.length >= 3) {
        setAreaDrawingMode(null);
        setAreaDragStart(null);
    setAreaDragCurrent(null);
        return;
      }

      setAreaPolygon([]);
      setAreaDragStart(null);
    setAreaDragCurrent(null);
      setAreaDrawingMode(null);
      return;
    }

    setAreaPolygon([]);
    setAreaDragStart(null);
    setAreaDragCurrent(null);
    setAreaBoundaryType("");
    setAreaBoundaryId("");
    setAreaBoundaryLabel("");
    setShowExistingBoundary(false);
    setAreaDrawingMode(mode);
  }

  function finishAreaShape(polygon: QueryDataCoordinate[]) {
    if (polygon.length < 3) {
      setAreaDragStart(null);
    setAreaDragCurrent(null);
      return;
    }

    setAreaPolygon(polygon);
    setAreaDragStart(null);
    setAreaDragCurrent(null);
    setAreaBoundaryType("");
    setAreaBoundaryId("");
    setAreaBoundaryLabel("");
    setShowExistingBoundary(false);
    setAreaDrawingMode(null);
  }

  function beginAreaDrag(coordinate: QueryDataCoordinate) {
    setAreaDragStart(coordinate);
    setAreaDragCurrent(coordinate);
  }

  function updateAreaDrag(coordinate: QueryDataCoordinate) {
    setAreaDragCurrent(coordinate);
  }

  function completeAreaDrag(coordinate: QueryDataCoordinate) {
    if (!areaDragStart) return;

    const polygon =
      areaDrawingMode === "rectangle"
        ? buildRectanglePolygon(areaDragStart, coordinate)
        : areaDrawingMode === "circle"
          ? buildCirclePolygon(areaDragStart, coordinate)
          : [];

    finishAreaShape(polygon);
  }

  function addAreaPoint(coordinate: QueryDataCoordinate) {
    setAreaPolygon((current) => [...current, coordinate]);
  }

  function selectExistingBoundary(id: string) {
    setAreaBoundaryId(id);

    const feature = boundaryFeatures.find((item) => item.id === id);

    if (!feature) {
      setAreaPolygon([]);
      setAreaBoundaryLabel("");
      return;
    }

    const polygon = simplifyBoundaryRing(
      featureOuterRing(feature.feature),
    );

    if (polygon.length < 3) {
      setAreaPolygon([]);
      setAreaBoundaryLabel("");
      setBoundaryError("The selected boundary did not contain usable geometry.");
      return;
    }

    setAreaBoundaryType(feature.type);
    setAreaBoundaryLabel(feature.label);
    setAreaPolygon(polygon);
    setAreaDrawingMode(null);
    setShouldFitBoundary(true);
  }

  function clearAreaFilter() {
    setAreaPolygon([]);
    setAreaDragStart(null);
    setAreaDragCurrent(null);
    setAreaBoundaryType("");
    setAreaBoundaryId("");
    setAreaBoundaryLabel("");
    setBoundarySearchText("");
    setShowExistingBoundary(false);
    setShouldFitBoundary(false);
    setAreaDrawingMode(null);
  }

  function toggleSiteName(siteName: string) {
    setSelectedSiteNames((current) =>
      current.includes(siteName)
        ? current.filter((value) => value !== siteName)
        : [...current, siteName],
    );
  }

  function clearSiteNameFilter() {
    setSelectedSiteNames([]);
  }

  function toggleWaterbody(waterbody: string) {
    setSelectedWaterbodies((current) =>
      current.includes(waterbody)
        ? current.filter((value) => value !== waterbody)
        : [...current, waterbody],
    );
  }

  function clearWaterbodyFilter() {
    setSelectedWaterbodies([]);
  }

  function hardRefreshMap() {
    setMapRefreshKey((current) => current + 1);
  }

  function clearAllFilters() {
    const resetSession: QueryDataSession = {
      startDate: "",
      endDate: "",
      areaPolygon: [],
      areaBoundaryType: "",
      areaBoundaryId: "",
      areaBoundaryLabel: "",
      selectedSiteNames: [],
      selectedWaterbodies: [],
      activeCustomFilterFields: [],
      customFilters: {},
    };

    setStartDate("");
    setEndDate("");
    setAreaPolygon([]);
    setAreaDragStart(null);
    setAreaDragCurrent(null);
    setAreaBoundaryType("");
    setAreaBoundaryId("");
    setAreaBoundaryLabel("");
    setBoundarySearchText("");
    setShowExistingBoundary(false);
    setShouldFitBoundary(false);
    setAreaDrawingMode(null);
    setSelectedSiteNames([]);
    setSiteSearchText("");
    setSelectedWaterbodies([]);
    setWaterbodySearchText("");
    setActiveCustomFilterFields([]);
    setCustomFilters({});
    setCustomFilterSearch({});
    setCollapsedCustomFilters({});
    setShowAddFilterMenu(false);
    setIsAreaFilterCollapsed(true);
    setIsSiteFilterCollapsed(true);
    setIsWaterbodyFilterCollapsed(true);

    // Reuse the already-loaded lightweight site overview immediately.
    setAppliedQuerySession(resetSession);
    setAppliedMapPoints([]);
    setHasAppliedMapQuery(false);
    setShouldFitAppliedPoints(false);
    lastFittedCollectionKey = "";

    // The large statewide site layer is already cached. Remount only Leaflet
    // so its Canvas renderer redraws that existing data immediately.
    setMapRefreshKey((current) => current + 1);
  }

  function addCustomFilter(field: QueryDataCustomFilterField) {
    setActiveCustomFilterFields((current) =>
      current.includes(field) ? current : [...current, field],
    );
    setCollapsedCustomFilters((current) => ({
      ...current,
      [field]: false,
    }));
    setShowAddFilterMenu(false);
  }

  function removeCustomFilter(field: QueryDataCustomFilterField) {
    setActiveCustomFilterFields((current) =>
      current.filter((value) => value !== field),
    );
    setCustomFilters((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setCustomFilterSearch((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function toggleCustomFilterValue(
    field: QueryDataCustomFilterField,
    value: string,
  ) {
    setCustomFilters((current) => {
      const selected = current[field] ?? [];

      return {
        ...current,
        [field]: selected.includes(value)
          ? selected.filter((item) => item !== value)
          : [...selected, value],
      };
    });
  }

  function clearCustomFilter(field: QueryDataCustomFilterField) {
    setCustomFilters((current) => ({
      ...current,
      [field]: [],
    }));
  }

  useEffect(() => {
    if (!shouldFitBoundary) return;

    const timer = window.setTimeout(() => {
      setShouldFitBoundary(false);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [shouldFitBoundary]);

  return (
    <section className="query-data-page">
      <header className="query-data-header">
        <div>
          <span className="query-data-eyebrow">Reports</span>
          <h1>Query Data</h1>
          <p>
            Build and review queries against the cached NAIADD production
            snapshot.
          </p>
        </div>
      </header>

      <section
        className={`query-data-snapshot-card ${
          snapshotAvailable ? "ready" : "empty"
        }`}
        aria-live="polite"
      >
        <div className="query-data-snapshot-icon" aria-hidden="true">
          <Database size={24} />
        </div>

        <div className="query-data-snapshot-copy">
          <span>NAIADD Production Database</span>
          <strong>
            {snapshotAvailable
              ? "Cached production snapshot is available."
              : "No cached NAIADD production snapshot is available."}
          </strong>
        </div>

        <div className="query-data-snapshot-stats">
          <div>
            <small>Version</small>
            <strong>{snapshotMeta?.version ?? "—"}</strong>
          </div>

          <div>
            <small>Snapshot size</small>
            <strong>
              {snapshotMeta?.sizeBytes
                ? formatMegabytes(snapshotMeta.sizeBytes)
                : "—"}
            </strong>
          </div>

          <div>
            <small>Cached</small>
            <strong>
              {snapshotMeta?.cachedAt
                ? new Date(snapshotMeta.cachedAt).toLocaleString()
                : "—"}
            </strong>
          </div>
        </div>
      </section>

      <div className="query-data-workspace">
        <aside className="query-data-filter-panel">
          <section
            className={`query-data-saved-queries ${
              isSavedQueriesCollapsed ? "collapsed" : ""
            }`}
          >
            <div className="query-data-saved-query-heading">
              <div>
                <span>Reusable filters</span>
                <strong>Saved Queries</strong>
              </div>

              <div className="query-data-saved-query-heading-actions">
                <SlidersHorizontal size={19} aria-hidden="true" />
                <button
                  type="button"
                  className="query-data-collapse-button"
                  onClick={() =>
                    setIsSavedQueriesCollapsed((current) => !current)
                  }
                  aria-expanded={!isSavedQueriesCollapsed}
                  aria-label={
                    isSavedQueriesCollapsed
                      ? "Expand saved queries"
                      : "Collapse saved queries"
                  }
                >
                  {isSavedQueriesCollapsed ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronUp size={18} />
                  )}
                </button>
              </div>
            </div>

            {!isSavedQueriesCollapsed && (
              <div className="query-data-saved-query-content">
                <div className="query-data-saved-query-controls">
                  <label>
                    <span>Query name</span>
                    <input
                      type="text"
                      value={savedQueryName}
                      onChange={(event) => {
                        setSavedQueryName(event.target.value);
                        setSavedQueryNotice("");
                      }}
                      placeholder="Example: Clinch River mussel surveys"
                      maxLength={80}
                    />
                  </label>

                  <button
                    type="button"
                    className="query-data-save-query-button"
                    onClick={saveCurrentQuery}
                  >
                    <Save size={17} />
                    Save Query
                  </button>
                </div>

                <div className="query-data-saved-query-picker">
                  <FolderOpen size={17} aria-hidden="true" />
                  <select
                    value={selectedSavedQueryId}
                    onChange={(event) =>
                      loadSelectedSavedQuery(event.target.value)
                    }
                    aria-label="My Saved Queries"
                  >
                    <option value="">My Saved Queries</option>
                    {savedQueries.map((query) => (
                      <option key={query.id} value={query.id}>
                        {query.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={deleteSelectedSavedQuery}
                    disabled={!selectedSavedQueryId}
                    aria-label="Delete selected saved query"
                    title="Delete selected saved query"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {savedQueryNotice && (
                  <p
                    className="query-data-saved-query-notice"
                    aria-live="polite"
                  >
                    {savedQueryNotice}
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="query-data-filter-directions">
            <div className="query-data-filter-directions-heading">
              <strong>Build your query</strong>
              <button
                type="button"
                className="query-data-clear-all"
                onClick={clearAllFilters}
              >
                <Trash2 size={15} />
                Clear All
              </button>
            </div>
            <span>
              Filters work together. Build or adjust the filters, then select Apply
              Query to Map when you are ready to redraw the results.
            </span>
          </section>

          <section className="query-data-apply-section query-data-apply-desktop">
            <button
              type="button"
              className="query-data-apply-button"
              onClick={applyQueryToMap}
              disabled={
                !snapshotAvailable ||
                invalidDateRange ||
                mapLoadState !== "ready"
              }
            >
              <Play size={19} fill="currentColor" />
              Apply Query to Map
            </button>
            <span
              className={`query-data-apply-status ${
                queryHasUnappliedChanges ? "pending" : "applied"
              }`}
            >
              {queryHasUnappliedChanges
                ? "Filter changes are staged. The current map has not changed."
                : "Filter changes are staged. The map changes only after Apply Query to Map is selected."}
            </span>
          </section>

          <section className="query-data-filter-card">
            <div className="query-data-filter-heading">
              <div className="query-data-filter-title">
                <span
                  className="query-data-filter-icon"
                  aria-hidden="true"
                >
                  <CalendarDays size={20} />
                </span>
                <div>
                  <span>Query filter</span>
                  <h2>Survey Date</h2>
                </div>
              </div>

              {hasDateFilter && (
                <button
                  type="button"
                  className="query-data-clear-filter"
                  onClick={clearDateFilter}
                >
                  <X size={16} />
                  Clear
                </button>
              )}
            </div>

            <div className="query-data-date-fields">
              <QueryDateInput
                label="Start date"
                value={startDate}
                max={endDate || undefined}
                disabled={!snapshotAvailable}
                onChange={setStartDate}
              />

              <QueryDateInput
                label="End date"
                value={endDate}
                min={startDate || undefined}
                disabled={!snapshotAvailable}
                onChange={setEndDate}
              />
            </div>

            {invalidDateRange && (
              <p className="query-data-filter-error">
                End date must be on or after the start date.
              </p>
            )}

            {!snapshotAvailable && (
              <p className="query-data-filter-note">
                Refresh the production snapshot from the Home Dashboard
                before building a query.
              </p>
            )}
          </section>

          <section className="query-data-filter-card query-data-area-filter-card">
            <div className="query-data-filter-heading">
              <div className="query-data-filter-title">
                <span
                  className="query-data-filter-icon"
                  aria-hidden="true"
                >
                  <Pentagon size={20} />
                </span>
                <div>
                  <span>Spatial filter</span>
                  <h2>Filter by Area</h2>
                </div>
              </div>

              <div className="query-data-filter-actions">
                {areaPolygon.length > 0 && (
                  <button
                    type="button"
                    className="query-data-clear-filter"
                    onClick={clearAreaFilter}
                  >
                    <Trash2 size={16} />
                    Clear
                  </button>
                )}

                <button
                  type="button"
                  className="query-data-collapse-button"
                  onClick={() =>
                    setIsAreaFilterCollapsed((current) => !current)
                  }
                  aria-expanded={!isAreaFilterCollapsed}
                  aria-label={
                    isAreaFilterCollapsed
                      ? "Expand area filter"
                      : "Collapse area filter"
                  }
                >
                  {isAreaFilterCollapsed ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronUp size={18} />
                  )}
                </button>
              </div>
            </div>

            {!isAreaFilterCollapsed && (
              <div className="query-data-collapsible-content">
                <div className="query-data-area-drawing-tools">
                  <span className="query-data-area-tools-label">
                    Draw a shape
                  </span>

                  <div className="query-data-area-mode-buttons">
                    <button
                      type="button"
                      className={`query-data-area-button ${
                        areaDrawingMode === "polygon" ? "active" : ""
                      }`}
                      onClick={() => startAreaDrawing("polygon")}
                      disabled={!snapshotAvailable}
                    >
                      <Pentagon size={18} />
                      {areaDrawingMode === "polygon"
                        ? areaPolygon.length >= 3
                          ? "Finish Polygon"
                          : "Cancel Polygon"
                        : "Polygon"}
                    </button>

                    <button
                      type="button"
                      className={`query-data-area-button ${
                        areaDrawingMode === "rectangle" ? "active" : ""
                      }`}
                      onClick={() => startAreaDrawing("rectangle")}
                      disabled={!snapshotAvailable}
                    >
                      <LandPlot size={18} />
                      Rectangle
                    </button>

                    <button
                      type="button"
                      className={`query-data-area-button ${
                        areaDrawingMode === "circle" ? "active" : ""
                      }`}
                      onClick={() => startAreaDrawing("circle")}
                      disabled={!snapshotAvailable}
                    >
                      <Target size={18} />
                      Circle
                    </button>
                  </div>

                  <button
                    type="button"
                    className={`query-data-area-button query-data-boundary-button ${
                      showExistingBoundary ? "active" : ""
                    }`}
                    onClick={() => {
                      setShowExistingBoundary((current) => !current);
                      setAreaDrawingMode(null);
                      setAreaDragStart(null);
    setAreaDragCurrent(null);
                    }}
                    disabled={!snapshotAvailable}
                  >
                    <LandPlot size={18} />
                    Use Existing Boundary
                  </button>
                </div>

                {showExistingBoundary && (
                  <div className="query-data-boundary-picker">
                    <label>
                      <span>Boundary type</span>
                      <select
                        value={areaBoundaryType}
                        onChange={(event) => {
                          setAreaBoundaryType(
                            event.target.value as QueryDataBoundaryType,
                          );
                          setAreaBoundaryId("");
                          setAreaBoundaryLabel("");
                          setBoundarySearchText("");
                          setBoundaryFeatures([]);
                          setBoundaryLoadState("idle");
                          setBoundaryError("");
                        }}
                      >
                        <option value="">Choose boundary type</option>
                        <option value="county">Virginia County</option>
                        <option value="huc8">HUC8 Watershed</option>
                      </select>
                    </label>

                    {areaBoundaryType && (
                      <>
                        <label>
                          <span>Search boundaries</span>
                          <div className="query-data-site-search-box">
                            <Search size={17} aria-hidden="true" />
                            <input
                              type="search"
                              value={boundarySearchText}
                              onChange={(event) =>
                                setBoundarySearchText(event.target.value)
                              }
                              placeholder={
                                areaBoundaryType === "county"
                                  ? "Type a county name"
                                  : "Type a HUC8 code or name"
                              }
                              disabled={boundaryLoadState !== "ready"}
                            />
                            {boundarySearchText && (
                              <button
                                type="button"
                                onClick={() => setBoundarySearchText("")}
                                aria-label="Clear boundary search"
                              >
                                <X size={15} />
                              </button>
                            )}
                          </div>
                        </label>

                        <label>
                          <span>Select boundary</span>
                          <select
                            value={areaBoundaryId}
                            onChange={(event) =>
                              selectExistingBoundary(event.target.value)
                            }
                            disabled={boundaryLoadState !== "ready"}
                          >
                            <option value="">
                              {boundaryLoadState === "loading"
                                ? areaBoundaryType === "county"
                                  ? "Loading Virginia counties..."
                                  : "Loading Virginia HUC8 watersheds..."
                                : boundaryLoadState === "ready"
                                  ? `Choose from ${boundaryFeatures.length} boundaries`
                                  : "Choose a boundary"}
                            </option>
                            {visibleBoundaryFeatures.map((feature) => (
                              <option
                                key={`${feature.type}:${feature.id}`}
                                value={feature.id}
                              >
                                {feature.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}

                    {boundaryLoadState === "loading" && (
                      <div className="query-data-boundary-loading">
                        <LoaderCircle
                          className="query-data-spinner"
                          size={17}
                          aria-hidden="true"
                        />
                        <span>
                          {areaBoundaryType === "county"
                            ? "Loading the small county layer..."
                            : "Loading and trimming HUC8s to Virginia..."}
                        </span>
                      </div>
                    )}

                    {boundaryLoadState === "ready" &&
                      areaBoundaryType &&
                      boundaryFeatures.length === 0 && (
                        <p className="query-data-filter-error">
                          No matching boundaries were found in this layer.
                        </p>
                      )}

                    {boundaryLoadState === "error" && (
                      <p className="query-data-filter-error">
                        {boundaryError}
                      </p>
                    )}
                  </div>
                )}

                <div className="query-data-area-status">
                  <p className="query-data-filter-note">
                    {areaDrawingMode === "polygon"
                      ? areaPolygon.length === 0
                        ? "Click the first map point. Each click will be marked so you can build the polygon."
                        : areaPolygon.length < 3
                          ? `${areaPolygon.length} point${areaPolygon.length === 1 ? "" : "s"} placed. Add at least ${3 - areaPolygon.length} more.`
                          : `${areaPolygon.length} vertices placed. Select Finish Polygon when the shape looks right.`
                      : areaDrawingMode === "rectangle"
                        ? "Click and drag across the map to size a rectangle."
                        : areaDrawingMode === "circle"
                          ? "Click at the center and drag outward to size a circle."
                          : areaBoundaryLabel
                            ? `${areaBoundaryLabel} is restricting the mapped collections.`
                            : areaPolygon.length >= 3
                              ? `Custom area selected${areaSquareMiles > 0 ? ` — ${formatArea(areaSquareMiles)}` : ""}.`
                              : "Draw a polygon, rectangle, circle, or select a county or HUC8 boundary."}
                  </p>

                  {(areaDrawingMode === "rectangle" ||
                    areaDrawingMode === "circle") &&
                    previewAreaSquareMiles > 0 && (
                      <span className="query-data-area-live-measure">
                        Preview area: {formatArea(previewAreaSquareMiles)}
                      </span>
                    )}

                  {!areaDrawingMode &&
                    areaPolygon.length >= 3 &&
                    areaSquareMiles > 0 && (
                      <span className="query-data-area-live-measure">
                        Selected area: {formatArea(areaSquareMiles)}
                      </span>
                    )}
                </div>
              </div>
            )}
          </section>

          <section className="query-data-filter-card query-data-site-filter-card">
            <div className="query-data-filter-heading">
              <div className="query-data-filter-title">
                <span
                  className="query-data-filter-icon"
                  aria-hidden="true"
                >
                  <CheckSquare size={20} />
                </span>
                <div>
                  <span>Selection filter</span>
                  <h2>Site Name</h2>
                </div>
              </div>

              <div className="query-data-filter-actions">
                {selectedSiteNames.length > 0 && (
                  <button
                    type="button"
                    className="query-data-clear-filter"
                    onClick={clearSiteNameFilter}
                  >
                    <X size={16} />
                    Clear
                  </button>
                )}

                <button
                  type="button"
                  className="query-data-collapse-button"
                  onClick={() =>
                    setIsSiteFilterCollapsed((current) => !current)
                  }
                  aria-expanded={!isSiteFilterCollapsed}
                  aria-label={
                    isSiteFilterCollapsed
                      ? "Expand site filter"
                      : "Collapse site filter"
                  }
                >
                  {isSiteFilterCollapsed ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronUp size={18} />
                  )}
                </button>
              </div>
            </div>

            {!isSiteFilterCollapsed && (
              <div className="query-data-collapsible-content">
                <label className="query-data-site-search">
              <span>Search available sites</span>
              <div className="query-data-site-search-box">
                <Search size={17} aria-hidden="true" />
                <input
                  type="search"
                  value={siteSearchText}
                  onChange={(event) =>
                    setSiteSearchText(event.target.value)
                  }
                  placeholder="Type part of a site name"
                  disabled={availableSiteNames.length === 0}
                />
                {siteSearchText && (
                  <button
                    type="button"
                    onClick={() => setSiteSearchText("")}
                    aria-label="Clear site search"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </label>

            <div className="query-data-site-summary">
              <strong>
                {selectedSiteNames.length > 0
                  ? `${selectedSiteNames.length} selected`
                  : "All available sites"}
              </strong>
              <span>
                {siteSearchText
                  ? `${visibleSiteNames.length.toLocaleString()} shown of ${availableSiteNames.length.toLocaleString()}`
                  : `${availableSiteNames.length.toLocaleString()} available`}
              </span>
            </div>

            <div className="query-data-site-list">
              {availableSiteNames.length === 0 ? (
                <p className="query-data-site-empty">
                  No sites are available within the current date and area filters.
                </p>
              ) : visibleSiteNames.length === 0 ? (
                <p className="query-data-site-empty">
                  No available sites match this search.
                </p>
              ) : (
                visibleSiteNames.map((siteName) => {
                  const selected = selectedSiteNames.includes(siteName);

                  return (
                    <label
                      key={siteName}
                      className={`query-data-site-option ${
                        selected ? "selected" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSiteName(siteName)}
                      />
                      <span>{siteName}</span>
                    </label>
                  );
                })
              )}
            </div>

                <p className="query-data-filter-note">
                  The list updates from the active date and polygon filters.
                  Leave all sites unselected to include every available site.
                </p>
              </div>
            )}
          </section>

          <section className="query-data-filter-card query-data-site-filter-card query-data-waterbody-filter-card">
            <div className="query-data-filter-heading">
              <div className="query-data-filter-title">
                <span
                  className="query-data-filter-icon"
                  aria-hidden="true"
                >
                  <Waves size={20} />
                </span>
                <div>
                  <span>Selection filter</span>
                  <h2>Waterbody</h2>
                </div>
              </div>

              <div className="query-data-filter-actions">
                {selectedWaterbodies.length > 0 && (
                  <button
                    type="button"
                    className="query-data-clear-filter"
                    onClick={clearWaterbodyFilter}
                  >
                    <X size={16} />
                    Clear
                  </button>
                )}

                <button
                  type="button"
                  className="query-data-collapse-button"
                  onClick={() =>
                    setIsWaterbodyFilterCollapsed((current) => !current)
                  }
                  aria-expanded={!isWaterbodyFilterCollapsed}
                  aria-label={
                    isWaterbodyFilterCollapsed
                      ? "Expand waterbody filter"
                      : "Collapse waterbody filter"
                  }
                >
                  {isWaterbodyFilterCollapsed ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronUp size={18} />
                  )}
                </button>
              </div>
            </div>

            {!isWaterbodyFilterCollapsed && (
              <div className="query-data-collapsible-content">
                <label className="query-data-site-search">
              <span>Search available waterbodies</span>
              <div className="query-data-site-search-box">
                <Search size={17} aria-hidden="true" />
                <input
                  type="search"
                  value={waterbodySearchText}
                  onChange={(event) =>
                    setWaterbodySearchText(event.target.value)
                  }
                  placeholder="Type part of a waterbody name"
                  disabled={availableWaterbodies.length === 0}
                />
                {waterbodySearchText && (
                  <button
                    type="button"
                    onClick={() => setWaterbodySearchText("")}
                    aria-label="Clear waterbody search"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </label>

            <div className="query-data-site-summary">
              <strong>
                {selectedWaterbodies.length > 0
                  ? `${selectedWaterbodies.length} selected`
                  : "All available waterbodies"}
              </strong>
              <span>
                {waterbodySearchText
                  ? `${visibleWaterbodies.length.toLocaleString()} shown of ${availableWaterbodies.length.toLocaleString()}`
                  : `${availableWaterbodies.length.toLocaleString()} available`}
              </span>
            </div>

            <div className="query-data-site-list">
              {availableWaterbodies.length === 0 ? (
                <p className="query-data-site-empty">
                  No waterbodies are available within the current date, area,
                  and site filters.
                </p>
              ) : visibleWaterbodies.length === 0 ? (
                <p className="query-data-site-empty">
                  No available waterbodies match this search.
                </p>
              ) : (
                visibleWaterbodies.map((waterbody) => {
                  const selected =
                    selectedWaterbodies.includes(waterbody);

                  return (
                    <label
                      key={waterbody}
                      className={`query-data-site-option ${
                        selected ? "selected" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleWaterbody(waterbody)}
                      />
                      <span>{waterbody}</span>
                    </label>
                  );
                })
              )}
            </div>

                <p className="query-data-filter-note">
                  The list updates from the active date, polygon, and site
                  filters. Leave all waterbodies unselected to include every
                  available waterbody.
                </p>
              </div>
            )}
          </section>

          {activeCustomFilterFields.map((field) => {
            const label = getCustomFilterLabel(field);
            const selectedValues = customFilters[field] ?? [];
            const availableValues = availableCustomValues[field] ?? [];
            const searchText = customFilterSearch[field] ?? "";
            const normalizedSearch = searchText.trim().toLowerCase();
            const visibleValues = normalizedSearch
              ? availableValues.filter((value) =>
                  value.toLowerCase().includes(normalizedSearch),
                )
              : availableValues;
            const collapsed = collapsedCustomFilters[field] ?? true;

            return (
              <section
                key={field}
                className="query-data-filter-card query-data-site-filter-card query-data-custom-filter-card"
              >
                <div className="query-data-filter-heading">
                  <div className="query-data-filter-title">
                    <span
                      className="query-data-filter-icon"
                      aria-hidden="true"
                    >
                      {getCustomFilterIcon(field)}
                    </span>
                    <div>
                      <span>Custom filter</span>
                      <h2>{label}</h2>
                    </div>
                  </div>

                  <div className="query-data-filter-actions">
                    {selectedValues.length > 0 && (
                      <button
                        type="button"
                        className="query-data-clear-filter"
                        onClick={() => clearCustomFilter(field)}
                      >
                        <X size={16} />
                        Clear
                      </button>
                    )}

                    <button
                      type="button"
                      className="query-data-remove-filter"
                      onClick={() => removeCustomFilter(field)}
                      aria-label={`Remove ${label} filter`}
                    >
                      <Trash2 size={16} />
                    </button>

                    <button
                      type="button"
                      className="query-data-collapse-button"
                      onClick={() =>
                        setCollapsedCustomFilters((current) => ({
                          ...current,
                          [field]: !collapsed,
                        }))
                      }
                      aria-expanded={!collapsed}
                      aria-label={
                        collapsed
                          ? `Expand ${label} filter`
                          : `Collapse ${label} filter`
                      }
                    >
                      {collapsed ? (
                        <ChevronDown size={18} />
                      ) : (
                        <ChevronUp size={18} />
                      )}
                    </button>
                  </div>
                </div>

                {!collapsed && (
                  <div className="query-data-collapsible-content">
                    <label className="query-data-site-search">
                      <span>Search available {label.toLowerCase()}</span>
                      <div className="query-data-site-search-box">
                        <Search size={17} aria-hidden="true" />
                        <input
                          type="search"
                          value={searchText}
                          onChange={(event) =>
                            setCustomFilterSearch((current) => ({
                              ...current,
                              [field]: event.target.value,
                            }))
                          }
                          placeholder={`Type part of a ${label.toLowerCase()} value`}
                          disabled={availableValues.length === 0}
                        />
                        {searchText && (
                          <button
                            type="button"
                            onClick={() =>
                              setCustomFilterSearch((current) => ({
                                ...current,
                                [field]: "",
                              }))
                            }
                            aria-label={`Clear ${label} search`}
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    </label>

                    <div className="query-data-site-summary">
                      <strong>
                        {selectedValues.length > 0
                          ? `${selectedValues.length} selected`
                          : `All available ${label.toLowerCase()}`}
                      </strong>
                      <span>
                        {searchText
                          ? `${visibleValues.length.toLocaleString()} shown of ${availableValues.length.toLocaleString()}`
                          : `${availableValues.length.toLocaleString()} available`}
                      </span>
                    </div>

                    <div className="query-data-site-list">
                      {availableValues.length === 0 ? (
                        <p className="query-data-site-empty">
                          No {label.toLowerCase()} values are available within
                          the active filters.
                        </p>
                      ) : visibleValues.length === 0 ? (
                        <p className="query-data-site-empty">
                          No available values match this search.
                        </p>
                      ) : (
                        visibleValues.map((value) => {
                          const selected = selectedValues.includes(value);

                          return (
                            <label
                              key={value}
                              className={`query-data-site-option ${
                                selected ? "selected" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() =>
                                  toggleCustomFilterValue(field, value)
                                }
                              />
                              <span>{value}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          <section className="query-data-add-filter-section">
            <button
              type="button"
              className="query-data-add-filter-button"
              onClick={() =>
                setShowAddFilterMenu((current) => !current)
              }
              disabled={
                activeCustomFilterFields.length ===
                CUSTOM_FILTER_OPTIONS.length
              }
            >
              <Plus size={19} />
              Add Filter
            </button>

            {showAddFilterMenu && (
              <div className="query-data-add-filter-menu">
                {CUSTOM_FILTER_OPTIONS.filter(
                  (option) =>
                    !activeCustomFilterFields.includes(option.field),
                ).map((option) => (
                  <button
                    key={option.field}
                    type="button"
                    onClick={() => addCustomFilter(option.field)}
                  >
                    <span aria-hidden="true">
                      {getCustomFilterIcon(option.field)}
                    </span>
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>

        <section className="query-data-map-card">
          <div className="query-data-map-header">
            <div>
              <span>Spatial results</span>
              <h2>Collections</h2>
            </div>

            <div className="query-data-map-header-actions">
              <div
                className="query-data-basemap-switcher"
                aria-label="Map baselayer"
              >
                <MapIcon size={16} aria-hidden="true" />

                <button
                  type="button"
                  className={basemap === "satellite" ? "active" : ""}
                  onClick={() => setBasemap("satellite")}
                >
                  Satellite
                </button>

                <button
                  type="button"
                  className={basemap === "street" ? "active" : ""}
                  onClick={() => setBasemap("street")}
                >
                  Street Map
                </button>
              </div>

              <div className="query-data-map-count">
              <MapPin size={16} aria-hidden="true" />
              <strong>{displayedMapPoints.length.toLocaleString()}</strong>
              <span>
                {hasAppliedMapQuery
                  ? displayedMapPoints.length === 1
                    ? "collection"
                    : "collections"
                  : displayedMapPoints.length === 1
                    ? "site"
                    : "sites"}
              </span>
              </div>
            </div>
          </div>

          <div className="query-data-map-shell">
            {mapLoadState === "loading" ? (
              <div className="query-data-map-message">
                <LoaderCircle
                  className="query-data-spinner"
                  size={30}
                  aria-hidden="true"
                />
                <strong>Loading Query Data map</strong>
                <span>{mapStatus}</span>
              </div>
            ) : mapLoadState === "error" ||
              mapLoadState === "empty" ? (
              <div className="query-data-map-message">
                <MapPin size={30} aria-hidden="true" />
                <strong>
                  {mapLoadState === "error"
                    ? "Map data unavailable"
                    : "No mapped collections"}
                </strong>
                <span>{mapStatus}</span>
              </div>
            ) : (
              <MapContainer
                key={`query-data-map-${mapRefreshKey}`}
                className="query-data-map"
                center={cachedQueryMapView.center}
                zoom={cachedQueryMapView.zoom}
                scrollWheelZoom
                attributionControl
                preferCanvas
              >
                {basemap === "street" ? (
                  <TileLayer
                    key="carto-street"
                    attribution="&copy; OpenStreetMap contributors &copy; CARTO"
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    subdomains={["a", "b", "c", "d"]}
                    maxZoom={20}
                  />
                ) : (
                  <TileLayer
                    key="esri-satellite"
                    attribution="Tiles &copy; Esri"
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={20}
                  />
                )}

                <QueryMapViewTracker />

                <FitMapToBoundary
                  polygon={areaPolygon}
                  enabled={shouldFitBoundary}
                />

                <FitMapToPoints
                  points={displayedMapPoints}
                  disabled={isDrawingArea || !shouldFitDisplayedPoints}
                />

                <AreaDrawingController
                  mode={areaDrawingMode}
                  onAddPoint={addAreaPoint}
                  onDragStart={beginAreaDrag}
                  onDragMove={updateAreaDrag}
                  onDragEnd={completeAreaDrag}
                />

                {areaDrawingMode === "rectangle" &&
                  areaDragStart &&
                  areaDragCurrent && (
                    <Rectangle
                      bounds={[
                        [
                          Math.min(
                            areaDragStart.latitude,
                            areaDragCurrent.latitude,
                          ),
                          Math.min(
                            areaDragStart.longitude,
                            areaDragCurrent.longitude,
                          ),
                        ],
                        [
                          Math.max(
                            areaDragStart.latitude,
                            areaDragCurrent.latitude,
                          ),
                          Math.max(
                            areaDragStart.longitude,
                            areaDragCurrent.longitude,
                          ),
                        ],
                      ]}
                      pathOptions={{
                        color: "var(--vadma-accent, #ff9f43)",
                        weight: 3,
                        fillColor: "var(--vadma-accent, #ff9f43)",
                        fillOpacity: 0.22,
                        dashArray: "6 4",
                      }}
                      interactive={false}
                    />
                  )}

                {areaDrawingMode === "circle" &&
                  areaDragStart &&
                  liveCircleRadiusMeters > 0 && (
                    <Circle
                      center={[
                        areaDragStart.latitude,
                        areaDragStart.longitude,
                      ]}
                      radius={liveCircleRadiusMeters}
                      pathOptions={{
                        color: "var(--vadma-accent, #ff9f43)",
                        weight: 3,
                        fillColor: "var(--vadma-accent, #ff9f43)",
                        fillOpacity: 0.22,
                        dashArray: "6 4",
                      }}
                      interactive={false}
                    />
                  )}

                {displayedAreaPolygon.length >= 3 && (
                  <Polygon
                    positions={displayedAreaPolygon.map((coordinate) => [
                      coordinate.latitude,
                      coordinate.longitude,
                    ])}
                    pathOptions={{
                      color: "var(--vadma-accent, #ff9f43)",
                      weight: 2,
                      fillColor: "var(--vadma-accent, #ff9f43)",
                      fillOpacity: 0.18,
                    }}
                  />
                )}

                {areaDrawingMode === "polygon" &&
                  areaPolygon.length >= 1 && (
                    <>
                      {areaPolygon.length >= 2 && (
                        <Polyline
                          positions={areaPolygon.map((coordinate) => [
                            coordinate.latitude,
                            coordinate.longitude,
                          ])}
                          pathOptions={{
                            color: "var(--vadma-accent, #ff9f43)",
                            weight: 2.5,
                            dashArray: "5 5",
                          }}
                        />
                      )}

                      {areaPolygon.map((coordinate, index) => (
                        <Marker
                          key={`area-vertex-${index}-${coordinate.latitude}-${coordinate.longitude}`}
                          position={[
                            coordinate.latitude,
                            coordinate.longitude,
                          ]}
                          icon={areaVertexIcon(index)}
                          interactive={false}
                          keyboard={false}
                        />
                      ))}
                    </>
                  )}

                {displayedMapPoints.map((point) => (
                  <CircleMarker
                    key={
                      isInitialSitePoint(point)
                        ? point.siteKey
                        : point.collectionID
                    }
                    center={[point.latitude, point.longitude]}
                    radius={4}
                    pathOptions={{
                      color: "rgba(255, 255, 255, 0.94)",
                      weight: 1.25,
                      fillColor: "var(--vadma-accent, #ff9f43)",
                      fillOpacity: 0.95,
                    }}
                  >
                    <Popup>
                      <div className="query-data-map-popup">
                        <strong>{point.siteName}</strong>
                        <span>{point.waterbody}</span>
                        {hasAppliedMapQuery ? (
                          <>
                            {point.surveyDate && (
                              <span>{point.surveyDate}</span>
                            )}
                            <small>{point.collectionID}</small>
                          </>
                        ) : (
                          <small>
                            {isInitialSitePoint(point)
                              ? `${point.collectionCount.toLocaleString()} ${
                                  point.collectionCount === 1
                                    ? "collection"
                                    : "collections"
                                }`
                              : "Mapped site"}
                          </small>
                        )}

                        <button
                          type="button"
                          className="query-data-popup-refine-button"
                          disabled={!queryIndexReady}
                          onClick={() => refineQueryToSite(point)}
                        >
                          <Target size={14} aria-hidden="true" />
                          Refine Query to this Site
                        </button>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            )}

            {mapLoadState === "ready" && (
              <button
                type="button"
                className="query-data-map-refresh-button"
                onClick={hardRefreshMap}
                aria-label="Refresh map"
                title="Refresh map"
              >
                <RotateCw size={17} aria-hidden="true" />
              </button>
            )}

            {mapLoadState === "ready" &&
              !isDrawingArea &&
              hasAppliedMapQuery &&
              appliedFilteredPoints.length === 0 && (
                <div className="query-data-map-empty-overlay">
                  <MapPin size={28} aria-hidden="true" />
                  <strong>No collections match the active filters</strong>
                  <span>
                    Change or clear the date, area, or site selections to
                    display collection points.
                  </span>
                </div>
              )}
          </div>

          <p className="query-data-map-status" aria-live="polite">
            {mapLoadState === "ready"
              ? hasAppliedMapQuery
                ? `${appliedFilteredPoints.length.toLocaleString()} of ${collectionPoints.length.toLocaleString()} mapped collections shown.`
                : queryIndexReady
                  ? `${initialSitePoints.length.toLocaleString()} mapped sites shown. Build filters, then select Apply Query to Map.`
                  : `${initialSitePoints.length.toLocaleString()} mapped sites shown. Preparing query filters in the background...`
              : mapStatus}
          </p>
        </section>
      </div>

      <div
        className={`query-data-mobile-apply ${
          queryHasUnappliedChanges ? "pending" : "applied"
        }`}
      >
        <span>
          {queryHasUnappliedChanges
            ? "Filter changes are ready to apply."
            : hasAppliedMapQuery
              ? `${appliedFilteredPoints.length.toLocaleString()} collections shown.`
              : `${initialSitePoints.length.toLocaleString()} sites shown.`}
        </span>

        <button
          type="button"
          className="query-data-apply-button"
          onClick={applyQueryToMap}
          disabled={
            !snapshotAvailable ||
            invalidDateRange ||
            mapLoadState !== "ready" ||
            !queryIndexReady
          }
        >
          <Play size={19} fill="currentColor" />
          Apply Query to Map
        </button>
      </div>
    </section>
  );
}
