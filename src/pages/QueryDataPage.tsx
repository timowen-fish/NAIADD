import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Database,
  Fish,
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
  Waves,
  X,
} from "lucide-react";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  getCachedVadmaSnapshotMeta,
  readCachedVadmaSnapshotRows,
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

type MapLoadState = "idle" | "loading" | "ready" | "empty" | "error";

type QueryMapView = {
  center: [number, number];
  zoom: number;
};

type QueryBasemap = "satellite" | "street";

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
  "Collection_Id",
  "Survey_Date",
  "SampleDate",
  "CollectionDate",
  "Date",
  "FinalDate",
  "DownstreamLat",
  "downstreamLat",
  "DownstreamLatitude",
  "Latitude",
  "latitude",
  "Lat",
  "lat",
  "Lat_Decimal_Degree",
  "Y",
  "y",
  "DownstreamLong",
  "downstreamLong",
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
  "SiteName",
  "Locality",
  "SiteID",
  "Site_Id",
  "Waterbody",
  "Stream",
  "CommonName",
  "Species",
  "SpeciesName",
  "ScientificName",
  "Collectors",
  "Surveyor",
  "Surveyors",
  "LeadBiologist",
  "Lead_Biologist",
  "Project",
  "ProjectName",
  "TargetSpeciesNew",
  "TargetSpecies_New",
  "Target Species New",
  "TargetSpecies",
  "Target_Species",
  "Target Species",
  "TargetSpeciesName",
  "Target_Species_Name",
  "TargetSpeciesCommonName",
  "Target_CommonName",
  "Target",
  "SampleType_Gear",
  "SamplingMethod_Gear",
  "SurveyType",
  "Survey_Type",
  "Survey Type",
  "SurveyTypeName",
  "Survey_Type_Name",
  "Equip",
  "Equipment",
  "EquipmentUsed",
  "Equipment_Used",
  "SamplingEquipment",
  "Sampling_Equipment",
  "Gear",
  "GearType",
  "Gear_Type",
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

function buildCollectionPoints(rows: SnapshotRow[]): CollectionMapPoint[] {
  const pointsByCollection = new Map<string, CollectionMapPoint>();

  for (const row of rows) {
    const collectionID = toText(
      getValue(row, ["CollectionID", "Collection_Id"]),
    );

    if (!collectionID) continue;

    let point = pointsByCollection.get(collectionID);

    if (!point) {
      const surveyDate = parseSurveyDate(
        getValue(row, [
          "Survey_Date",
          "SampleDate",
          "CollectionDate",
          "Date",
          "FinalDate",
        ]),
      );

      if (!surveyDate) continue;

      const latitude = toNumber(
        getValue(row, [
          "DownstreamLat",
          "downstreamLat",
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

      point = {
        collectionID,
        surveyDate: toDateInputValue(surveyDate),
        timestamp: surveyDate.getTime(),
        latitude,
        longitude,
        siteName:
          toText(
            getValue(row, [
              "SiteName",
              "Locality",
              "SiteID",
              "Site_Id",
            ]),
          ) || "Unnamed site",
        waterbody:
          toText(getValue(row, ["Waterbody", "Stream"])) ||
          "Unknown waterbody",
        species: [],
        surveyors: [],
        projects: [],
        targetSpecies: [],
        surveyTypes: [],
        equipment: [],
      };

      pointsByCollection.set(collectionID, point);
    }

    for (const config of CUSTOM_FILTER_OPTIONS) {
      for (const value of splitValues(getValue(row, config.aliases))) {
        addUniqueValue(point[config.pointKey], value);
      }
    }
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
    | "species"
    | "surveyors"
    | "projects"
    | "targetSpecies"
    | "surveyTypes"
    | "equipment";
  aliases: readonly string[];
  icon: "fish" | "user" | "project" | "target" | "survey" | "equipment";
};

const CUSTOM_FILTER_OPTIONS: readonly CustomFilterConfig[] = [
  {
    field: "species",
    label: "Species",
    pointKey: "species",
    icon: "fish",
    aliases: [
      "CommonName",
      "Species",
      "SpeciesName",
      "ScientificName",
    ],
  },
  {
    field: "surveyor",
    label: "Surveyor",
    pointKey: "surveyors",
    icon: "user",
    aliases: [
      "Collectors",
      "Surveyors",
      "Surveyor",
      "LeadBiologist",
      "Lead_Biologist",
    ],
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
    aliases: [
      "SampleType_Gear",
      "SamplingMethod_Gear",
      "SurveyType",
      "Survey_Type",
      "Survey Type",
      "SurveyTypeName",
      "Survey_Type_Name",
    ],
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
    case "fish":
      return <Fish size={20} />;
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
  drawing,
  onAddPoint,
}: {
  drawing: boolean;
  onAddPoint: (coordinate: QueryDataCoordinate) => void;
}) {
  useMapEvents({
    click(event) {
      if (!drawing) return;

      onAddPoint({
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
  const snapshotMeta = useMemo(() => getCachedVadmaSnapshotMeta(), []);
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
  const [isDrawingArea, setIsDrawingArea] = useState(false);
  const [collectionPoints, setCollectionPoints] = useState<
    CollectionMapPoint[]
  >(() =>
    hasReusableCollectionCache
      ? cachedCollectionPoints ?? []
      : [],
  );
  const [mapLoadState, setMapLoadState] = useState<MapLoadState>(
    hasReusableCollectionCache ? "ready" : "idle",
  );
  const [mapStatus, setMapStatus] = useState(
    hasReusableCollectionCache
      ? `${(cachedCollectionPoints?.length ?? 0).toLocaleString()} unique mapped collections restored.`
      : "Waiting for the cached snapshot.",
  );

  const snapshotAvailable =
    Boolean(snapshotMeta) && Number(snapshotMeta?.sizeBytes ?? 0) > 0;

  const hasDateFilter = Boolean(startDate || endDate);
  const invalidDateRange =
    Boolean(startDate && endDate) && startDate > endDate;

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

    async function loadCollectionPoints() {
      if (
        cachedCollectionPoints !== null &&
        cachedCollectionPointsKey === snapshotCacheKey
      ) {
        setCollectionPoints(cachedCollectionPoints);
        setMapLoadState("ready");
        setMapStatus(
          `${cachedCollectionPoints.length.toLocaleString()} unique mapped collections restored.`,
        );
        return;
      }

      if (!snapshotAvailable) {
        setMapLoadState("empty");
        setMapStatus("No cached production snapshot is available.");
        return;
      }

      setMapLoadState("loading");
      setMapStatus("Reading collection locations from the cached snapshot...");

      try {
        const rows = await readCachedVadmaSnapshotRows({
          columns: [...MAP_SNAPSHOT_COLUMNS],
        });

        if (cancelled) return;

        const points = buildCollectionPoints(rows);
        cachedCollectionPoints = points;
        cachedCollectionPointsKey = snapshotCacheKey;
        setCollectionPoints(points);

        if (points.length === 0) {
          setMapLoadState("empty");
          setMapStatus(
            "No collections with valid dates and coordinates were found.",
          );
          return;
        }

        setMapLoadState("ready");
        setMapStatus(
          `${points.length.toLocaleString()} unique mapped collections loaded.`,
        );
      } catch (error) {
        if (cancelled) return;

        console.error("Unable to load Query Data map points.", error);
        setCollectionPoints([]);
        setMapLoadState("error");
        setMapStatus(
          error instanceof Error
            ? error.message
            : "Unable to read collection locations from the snapshot.",
        );
      }
    }

    void loadCollectionPoints();

    return () => {
      cancelled = true;
    };
  }, [snapshotAvailable, snapshotCacheKey]);

  const areaAndDateFilteredPoints = useMemo(() => {
    if (invalidDateRange) return [];

    const startTimestamp = deferredStartDate
      ? new Date(`${deferredStartDate}T00:00:00`).getTime()
      : Number.NEGATIVE_INFINITY;

    const endTimestamp = deferredEndDate
      ? new Date(`${deferredEndDate}T23:59:59.999`).getTime()
      : Number.POSITIVE_INFINITY;

    return collectionPoints.filter(
      (point) =>
        point.timestamp >= startTimestamp &&
        point.timestamp <= endTimestamp &&
        isPointInsidePolygon(point, deferredAreaPolygon),
    );
  }, [
    collectionPoints,
    deferredAreaPolygon,
    deferredEndDate,
    deferredStartDate,
    invalidDateRange,
  ]);

  const availableSiteNames = useMemo(
    () =>
      [...new Set(areaAndDateFilteredPoints.map((point) => point.siteName))]
        .sort((left, right) => left.localeCompare(right)),
    [areaAndDateFilteredPoints],
  );

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

  const availableWaterbodies = useMemo(
    () =>
      [...new Set(siteFilteredPoints.map((point) => point.waterbody))]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [siteFilteredPoints],
  );

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

  const appliedFilteredPoints = useMemo(() => {
    const session = appliedQuerySession;

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
      if (
        point.timestamp < startTimestamp ||
        point.timestamp > endTimestamp ||
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
  }, [appliedQuerySession, collectionPoints]);

  useEffect(() => {
    if (mapLoadState !== "ready") return;

    saveAppliedQueryData(
      appliedQuerySession,
      appliedFilteredPoints.map((point) => point.collectionID),
    );
  }, [appliedFilteredPoints, appliedQuerySession, mapLoadState]);

  const currentQuerySession = getCurrentQuerySession();
  const queryHasUnappliedChanges =
    JSON.stringify(currentQuerySession) !==
    JSON.stringify(appliedQuerySession);
  const displayedAreaPolygon = isDrawingArea
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
    setAreaBoundaryType(session.areaBoundaryType);
    setAreaBoundaryId(session.areaBoundaryId);
    setAreaBoundaryLabel(session.areaBoundaryLabel);
    setIsDrawingArea(false);
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
    if (invalidDateRange || !snapshotAvailable) return;

    setAppliedQuerySession(getCurrentQuerySession());
    setShouldFitAppliedPoints(true);
  }

  function clearDateFilter() {
    setStartDate("");
    setEndDate("");
  }

  function toggleAreaDrawing() {
    if (isDrawingArea) {
      if (areaPolygon.length < 3) {
        setAreaPolygon([]);
      }

      setIsDrawingArea(false);
      return;
    }

    setAreaPolygon([]);
    setAreaBoundaryType("");
    setAreaBoundaryId("");
    setAreaBoundaryLabel("");
    setShowExistingBoundary(false);
    setIsDrawingArea(true);
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
    setIsDrawingArea(false);
    setShouldFitBoundary(true);
  }

  function clearAreaFilter() {
    setAreaPolygon([]);
    setAreaBoundaryType("");
    setAreaBoundaryId("");
    setAreaBoundaryLabel("");
    setBoundarySearchText("");
    setShowExistingBoundary(false);
    setShouldFitBoundary(false);
    setIsDrawingArea(false);
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

  function clearAllFilters() {
    setStartDate("");
    setEndDate("");
    setAreaPolygon([]);
    setAreaBoundaryType("");
    setAreaBoundaryId("");
    setAreaBoundaryLabel("");
    setBoundarySearchText("");
    setShowExistingBoundary(false);
    setShouldFitBoundary(false);
    setIsDrawingArea(false);
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
            Build and review queries against the cached VADMA production
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
          <span>VADMA Production Database</span>
          <strong>
            {snapshotAvailable
              ? "Cached production snapshot is available."
              : "No cached production snapshot is available."}
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
                      placeholder="Example: James River bass surveys"
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
                ? "Filter changes are staged and have not changed the map yet."
                : "The map reflects the current query filters."}
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
              <label>
                <span>Start date</span>
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(event) =>
                    setStartDate(event.target.value)
                  }
                  disabled={!snapshotAvailable}
                />
              </label>

              <label>
                <span>End date</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(event) =>
                    setEndDate(event.target.value)
                  }
                  disabled={!snapshotAvailable}
                />
              </label>
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
                <div className="query-data-area-mode-buttons">
                  <button
                    type="button"
                    className={`query-data-area-button ${
                      isDrawingArea ? "active" : ""
                    }`}
                    onClick={toggleAreaDrawing}
                    disabled={!snapshotAvailable}
                  >
                    <Pentagon size={18} />
                    {isDrawingArea
                      ? areaPolygon.length >= 3
                        ? "Finish Drawing"
                        : "Cancel Drawing"
                      : areaBoundaryId
                        ? "Draw Custom Area"
                        : areaPolygon.length >= 3
                          ? "Redraw Area"
                          : "Draw Area on Map"}
                  </button>

                  <button
                    type="button"
                    className={`query-data-area-button ${
                      showExistingBoundary ? "active" : ""
                    }`}
                    onClick={() => {
                      setShowExistingBoundary((current) => !current);
                      setIsDrawingArea(false);
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

                <p className="query-data-filter-note">
                  {isDrawingArea
                    ? areaPolygon.length >= 3
                      ? "Continue clicking to refine the polygon, then select Finish Drawing."
                      : "Click at least three locations on the map to create the filter polygon."
                    : areaBoundaryLabel
                      ? `${areaBoundaryLabel} is restricting the mapped collections.`
                      : areaPolygon.length >= 3
                        ? `${areaPolygon.length} polygon vertices are restricting the mapped collections.`
                        : "Draw a custom polygon or select a county or HUC8 boundary."}
                </p>
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
              <strong>{appliedFilteredPoints.length.toLocaleString()}</strong>
              <span>
                {appliedFilteredPoints.length === 1
                  ? "collection"
                  : "collections"}
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
                <strong>Loading collection locations</strong>
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
                className="query-data-map"
                center={cachedQueryMapView.center}
                zoom={cachedQueryMapView.zoom}
                scrollWheelZoom
                attributionControl
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
                  points={appliedFilteredPoints}
                  disabled={isDrawingArea || !shouldFitAppliedPoints}
                />

                <AreaDrawingController
                  drawing={isDrawingArea}
                  onAddPoint={addAreaPoint}
                />

                {displayedAreaPolygon.length >= 2 && (
                  <Polygon
                    positions={displayedAreaPolygon.map((coordinate) => [
                      coordinate.latitude,
                      coordinate.longitude,
                    ])}
                    pathOptions={{
                      color: "var(--vadma-accent, #ff9f43)",
                      weight: 2,
                      fillColor: "var(--vadma-accent, #ff9f43)",
                      fillOpacity: displayedAreaPolygon.length >= 3 ? 0.18 : 0.05,
                      dashArray:
                        displayedAreaPolygon.length >= 3 ? undefined : "6 6",
                    }}
                  />
                )}

                {appliedFilteredPoints.map((point) => (
                  <CircleMarker
                    key={point.collectionID}
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
                        <span>{point.surveyDate}</span>
                        <small>{point.collectionID}</small>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            )}

            {mapLoadState === "ready" &&
              !isDrawingArea &&
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
              ? `${appliedFilteredPoints.length.toLocaleString()} of ${collectionPoints.length.toLocaleString()} unique mapped collections shown.`
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
            : `${appliedFilteredPoints.length.toLocaleString()} collections shown.`}
        </span>

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
      </div>
    </section>
  );
}
