import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FeatureGroup,
  GeoJSON,
  LayersControl,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { divIcon } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { booleanPointInPolygon, point } from "@turf/turf";
import {
  exportDistributionRecords,
  loadDistributionRecords,
  loadDistributionSpecies,
  type DistributionCondition,
  type DistributionRecord,
  type DistributionSpecies,
} from "../services/distributionService";
import "../styles/DistributionsPage.css";

const VIRGINIA_BOUNDS: [[number, number], [number, number]] = [
  [36.45, -83.8],
  [39.65, -74.9],
];

const CONDITION_OPTIONS: DistributionCondition[] = [
  "Live",
  "Shell",
  "Historic",
  "Unknown",
];

const DATASET_POINT_COLORS: Record<string, string> = {
  "NAIADD Snapshot": "#ff0000",
  "Brian Release Database": "#d80097",
  VAFWIS: "#38a800",
  "Alderman Dataset": "#00a98f",
  "Natural Heritage": "#a900e6",
  "Ortmann Historic Dataset": "#ffff00",
};

type CountyProperties = Record<string, unknown> & {
  __distributionCountyId?: string;
  __distributionCountyName?: string;
  __distributionPointCount?: number;
};

type CountyFeatureCollection = FeatureCollection<Geometry, CountyProperties>;

type Huc10Properties = Record<string, unknown> & {
  HUC10?: string;
  HUC10Name?: string;
  PolyName?: string;
  __distributionKnownCount?: number;
  __distributionHistoricCount?: number;
};

type Huc10FeatureCollection = FeatureCollection<Geometry, Huc10Properties>;

type Huc12Properties = Record<string, unknown> & {
  HUC12?: string;
  HUC12Name?: string;
  PolyName?: string;
  __distributionKnownCount?: number;
  __distributionHistoricCount?: number;
};

type Huc12FeatureCollection = FeatureCollection<Geometry, Huc12Properties>;

const HUC12_GEOJSON_URLS = [
  "/spatial/distributions/huc12.geojson",
  "/spatial/huc12.geojson",
  "/data/distributions/spatial/huc12.geojson",
];

async function fetchGeoJson<T>(url: string): Promise<T> {
  const response = await fetch(`${url}?v=2`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}.`);
  }

  const body = await response.text();
  const trimmed = body.trim();

  if (!trimmed) {
    throw new Error(`${url} was empty.`);
  }

  if (trimmed.startsWith("<")) {
    throw new Error(
      `${url} returned HTML instead of GeoJSON. Clear the browser cache and reload.`,
    );
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    throw new Error(
      `${url} contains invalid GeoJSON: ${
        error instanceof Error ? error.message : "parse failed"
      }`,
    );
  }
}

async function loadHuc12GeoJson(): Promise<Huc12FeatureCollection> {
  let lastError: Error | null = null;

  for (const url of HUC12_GEOJSON_URLS) {
    try {
      const value = await fetchGeoJson<Huc12FeatureCollection>(url);

      if (
        value?.type !== "FeatureCollection" ||
        !Array.isArray(value.features)
      ) {
        lastError = new Error(`${url} was not a GeoJSON FeatureCollection.`);
        continue;
      }

      return value;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Unable to read the HUC12 GeoJSON.");
    }
  }

  throw lastError ?? new Error("HUC12 GeoJSON was not found.");
}

const HUC10_GEOJSON_URLS = [
  "/spatial/distributions/huc10.geojson",
  "/spatial/huc10.geojson",
  "/data/distributions/spatial/huc10.geojson",
];

async function loadHuc10GeoJson(): Promise<Huc10FeatureCollection> {
  let lastError: Error | null = null;

  for (const url of HUC10_GEOJSON_URLS) {
    try {
      const value = await fetchGeoJson<Huc10FeatureCollection>(url);

      if (
        value?.type !== "FeatureCollection" ||
        !Array.isArray(value.features)
      ) {
        lastError = new Error(`${url} was not a GeoJSON FeatureCollection.`);
        continue;
      }

      return value;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Unable to read the HUC10 GeoJSON.");
    }
  }

  throw lastError ?? new Error("HUC10 GeoJSON was not found.");
}

const COUNTY_GEOJSON_URLS = [
  "/spatial/counties.geojson",
  "/spatial/distributions/va-counties.geojson",
  "/data/distributions/spatial/va-counties.geojson",
];

const HIDDEN_COUNTY_SEGMENT_IDS = new Set([
  "38",
  "45",
  "51",
  "83",
  "89",
  "93",
  "94",
  "99",
  "107",
  "123",
  "131",
  "135",
  "143",
  "146",
]);

function countySegmentIds(
  feature: Feature<Geometry, CountyProperties>,
): string[] {
  const properties = feature.properties ?? {};

  return [
    feature.id,
    properties.FID,
    properties.OBJECTID,
    properties.OBJECTID_1,
    properties.OBJECTID_2,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function shouldHideCountySegment(
  feature: Feature<Geometry, CountyProperties>,
  index: number,
): boolean {
  const explicitIds = countySegmentIds(feature);

  if (explicitIds.some((id) => HIDDEN_COUNTY_SEGMENT_IDS.has(id))) {
    return true;
  }

  const fallbackName = countyName(feature, index);
  const fallbackMatch = fallbackName.match(/^County\s+(\d+)$/i);

  return fallbackMatch
    ? HIDDEN_COUNTY_SEGMENT_IDS.has(fallbackMatch[1])
    : false;
}

function countyName(feature: Feature<Geometry, CountyProperties>, index: number): string {
  const properties = feature.properties ?? {};
  const candidates = [
    properties.County_Nam,
    properties.NAME,
    properties.Name,
    properties.NAMELSAD,
    properties.COUNTYNAME,
    properties.County,
  ];

  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }

  return `County ${index + 1}`;
}

async function loadCountyGeoJson(): Promise<CountyFeatureCollection> {
  let lastError: Error | null = null;

  for (const url of COUNTY_GEOJSON_URLS) {
    try {
      const value = await fetchGeoJson<CountyFeatureCollection>(url);

      if (
        value?.type !== "FeatureCollection" ||
        !Array.isArray(value.features)
      ) {
        lastError = new Error(`${url} was not a GeoJSON FeatureCollection.`);
        continue;
      }

      return {
        ...value,
        features: value.features
          .filter(
            (feature, index) => !shouldHideCountySegment(feature, index),
          )
          .map((feature, index) => ({
            ...feature,
            properties: {
              ...(feature.properties ?? {}),
              __distributionCountyId: String(
                feature.id ??
                  feature.properties?.FID ??
                  feature.properties?.OBJECTID ??
                  feature.properties?.GEOID ??
                  feature.properties?.FIPS ??
                  index,
              ),
              __distributionCountyName: countyName(feature, index),
            },
          })),
      };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Unable to read the county GeoJSON.");
    }
  }

  throw lastError ?? new Error("County GeoJSON was not found.");
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function earliestInputValue(): string {
  return "1825-01-01";
}

function pointShapeSvg(
  condition: DistributionCondition,
  color: string,
  size: number,
  releaseDataset: boolean,
): string {
  const px = Math.max(12, Math.min(34, Math.round(size * 3.5)));
  const stroke = "#111827";
  const strokeWidth = 1.5;

  let shape = "";

  if (releaseDataset) {
    shape = `<polygon points="16,2 19.8,11.1 29.8,11.1 21.7,17.1 24.8,27 16,21.1 7.2,27 10.3,17.1 2.2,11.1 12.2,11.1" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`;
  } else if (condition === "Shell") {
    shape = `<rect x="5" y="5" width="22" height="22" rx="1.5" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  } else if (condition === "Historic") {
    shape = `<line x1="16" y1="4" x2="16" y2="28" stroke="${stroke}" stroke-width="5" stroke-linecap="round"/><line x1="4" y1="16" x2="28" y2="16" stroke="${stroke}" stroke-width="5" stroke-linecap="round"/><line x1="16" y1="4" x2="16" y2="28" stroke="${color}" stroke-width="3" stroke-linecap="round"/><line x1="4" y1="16" x2="28" y2="16" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
  } else if (condition === "Unknown") {
    shape = `<polygon points="16,3.5 29,27.5 3,27.5" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`;
  } else {
    shape = `<circle cx="16" cy="16" r="11" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 32 32" aria-hidden="true">${shape}</svg>`;
}



function DistributionHeatmapLayer({
  records,
  visible,
}: {
  records: DistributionRecord[];
  visible: boolean;
}) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.className = "distribution-interpolated-heatmap";
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "240";

    map.getPanes().overlayPane.appendChild(canvas);
    canvasRef.current = canvas;

    function colorForIntensity(intensity: number): [number, number, number, number] {
      const stops: Array<[number, number, number, number]> = [
        [0.00, 32, 90, 180],
        [0.24, 50, 170, 120],
        [0.48, 226, 225, 70],
        [0.70, 250, 145, 45],
        [0.86, 239, 68, 68],
        [1.00, 145, 20, 38],
      ];

      for (let index = 1; index < stops.length; index += 1) {
        const left = stops[index - 1];
        const right = stops[index];

        if (intensity <= right[0]) {
          const span = right[0] - left[0] || 1;
          const ratio = (intensity - left[0]) / span;

          return [
            Math.round(left[1] + (right[1] - left[1]) * ratio),
            Math.round(left[2] + (right[2] - left[2]) * ratio),
            Math.round(left[3] + (right[3] - left[3]) * ratio),
            Math.round(70 + intensity * 150),
          ];
        }
      }

      return [145, 20, 38, 220];
    }

    function drawHeatmap() {
      if (!canvasRef.current) return;

      const size = map.getSize();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const canvasElement = canvasRef.current;

      canvasElement.width = Math.max(1, Math.round(size.x * pixelRatio));
      canvasElement.height = Math.max(1, Math.round(size.y * pixelRatio));
      canvasElement.style.width = `${size.x}px`;
      canvasElement.style.height = `${size.y}px`;

      const topLeft = map.containerPointToLayerPoint([0, 0]);
      canvasElement.style.transform = `translate(${topLeft.x}px, ${topLeft.y}px)`;

      const context = canvasElement.getContext("2d", {
        willReadFrequently: true,
      });

      if (!context) return;

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, size.x, size.y);

      if (!visible || records.length === 0) {
        canvasElement.style.display = "none";
        return;
      }

      canvasElement.style.display = "block";

      const aggregationSize = 10;
      const cells = new Map<
        string,
        { xTotal: number; yTotal: number; count: number }
      >();

      for (const record of records) {
        const projected = map.latLngToContainerPoint([
          record.latitude,
          record.longitude,
        ]);

        if (
          projected.x < -90 ||
          projected.y < -90 ||
          projected.x > size.x + 90 ||
          projected.y > size.y + 90
        ) {
          continue;
        }

        const gridX = Math.round(projected.x / aggregationSize);
        const gridY = Math.round(projected.y / aggregationSize);
        const key = `${gridX}:${gridY}`;
        const cell = cells.get(key) ?? {
          xTotal: 0,
          yTotal: 0,
          count: 0,
        };

        cell.xTotal += projected.x;
        cell.yTotal += projected.y;
        cell.count += 1;
        cells.set(key, cell);
      }

      if (cells.size === 0) return;

      const maxCount = Math.max(
        1,
        ...[...cells.values()].map((cell) => cell.count),
      );

      const intensityCanvas = document.createElement("canvas");
      intensityCanvas.width = canvasElement.width;
      intensityCanvas.height = canvasElement.height;

      const intensityContext = intensityCanvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!intensityContext) return;

      intensityContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      intensityContext.clearRect(0, 0, size.x, size.y);
      intensityContext.globalCompositeOperation = "lighter";

      const zoom = map.getZoom();
      const radius = Math.max(26, Math.min(58, 34 + (zoom - 6) * 3));

      for (const cell of cells.values()) {
        const x = cell.xTotal / cell.count;
        const y = cell.yTotal / cell.count;
        const weight =
          0.15 +
          0.85 * (Math.log1p(cell.count) / Math.log1p(maxCount));

        const gradient = intensityContext.createRadialGradient(
          x,
          y,
          0,
          x,
          y,
          radius,
        );

        gradient.addColorStop(0, `rgba(0,0,0,${Math.min(0.95, weight)})`);
        gradient.addColorStop(0.28, `rgba(0,0,0,${weight * 0.78})`);
        gradient.addColorStop(0.58, `rgba(0,0,0,${weight * 0.40})`);
        gradient.addColorStop(1, "rgba(0,0,0,0)");

        intensityContext.fillStyle = gradient;
        intensityContext.fillRect(
          x - radius,
          y - radius,
          radius * 2,
          radius * 2,
        );
      }

      const image = intensityContext.getImageData(
        0,
        0,
        intensityCanvas.width,
        intensityCanvas.height,
      );
      const pixels = image.data;

      for (let offset = 0; offset < pixels.length; offset += 4) {
        const intensity = pixels[offset + 3] / 255;

        if (intensity < 0.025) {
          pixels[offset + 3] = 0;
          continue;
        }

        const [red, green, blue, alpha] = colorForIntensity(intensity);
        pixels[offset] = red;
        pixels[offset + 1] = green;
        pixels[offset + 2] = blue;
        pixels[offset + 3] = alpha;
      }

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.putImageData(image, 0, 0);
    }

    function scheduleDraw() {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = window.requestAnimationFrame(drawHeatmap);
    }

    map.on("moveend zoomend resize", scheduleDraw);
    scheduleDraw();

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }

      map.off("moveend zoomend resize", scheduleDraw);
      canvas.remove();
      canvasRef.current = null;
    };
  }, [map, records, visible]);

  return null;
}

function distributionPointIcon(record: DistributionRecord, pointSize: number) {
  const color = DATASET_POINT_COLORS[record.datasetGroup] ?? "#111827";
  const releaseDataset = record.datasetGroup === "Brian Release Database";
  const px = Math.max(12, Math.min(34, Math.round(pointSize * 3.5)));

  return divIcon({
    className: "distribution-point-icon",
    html: pointShapeSvg(record.condition, color, pointSize, releaseDataset),
    iconSize: [px, px],
    iconAnchor: [px / 2, px / 2],
    popupAnchor: [0, -px / 2],
  });
}

export default function DistributionsPage() {
  const [records, setRecords] = useState<DistributionRecord[]>([]);
  const [species, setSpecies] = useState<DistributionSpecies[]>([]);
  const [selectedBova, setSelectedBova] = useState("");
  const [speciesSearch, setSpeciesSearch] = useState("");
  const [speciesPickerOpen, setSpeciesPickerOpen] = useState(false);
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] =
    useState<DistributionCondition[]>(CONDITION_OPTIONS);
  const [startDate, setStartDate] = useState(earliestInputValue());
  const [endDate, setEndDate] = useState(todayInputValue());
  const [pointSize, setPointSize] = useState(4);
  const [showPoints, setShowPoints] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showCounties, setShowCounties] = useState(true);
  const [counties, setCounties] = useState<CountyFeatureCollection | null>(null);
  const [countyError, setCountyError] = useState("");
  const [showHuc10Known, setShowHuc10Known] = useState(false);
  const [showHuc10Historic, setShowHuc10Historic] = useState(false);
  const [huc10, setHuc10] = useState<Huc10FeatureCollection | null>(null);
  const [huc10Error, setHuc10Error] = useState("");
  const [showHuc12Known, setShowHuc12Known] = useState(false);
  const [showHuc12Historic, setShowHuc12Historic] = useState(false);
  const [huc12, setHuc12] = useState<Huc12FeatureCollection | null>(null);
  const [huc12Error, setHuc12Error] = useState("");
  const [selectedRecord, setSelectedRecord] =
    useState<DistributionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const loadedRecords = await loadDistributionRecords();
        const loadedSpecies = await loadDistributionSpecies(loadedRecords);

        if (cancelled) return;

        const datasets = [...new Set(loadedRecords.map((row) => row.datasetGroup))]
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right));

        setRecords(loadedRecords);
        setSpecies(loadedSpecies);
        setSelectedDatasets(datasets);
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load distribution data.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadCountyGeoJson()
      .then((loadedCounties) => {
        if (!cancelled) {
          setCounties(loadedCounties);
          setCountyError("");
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setCounties(null);
          setCountyError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load county boundaries.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadHuc10GeoJson()
      .then((loadedHuc10) => {
        if (!cancelled) {
          setHuc10(loadedHuc10);
          setHuc10Error("");
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setHuc10(null);
          setHuc10Error(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load HUC10 boundaries.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadHuc12GeoJson()
      .then((loadedHuc12) => {
        if (!cancelled) {
          setHuc12(loadedHuc12);
          setHuc12Error("");
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setHuc12(null);
          setHuc12Error(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load HUC12 boundaries.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);


  const datasetOptions = useMemo(
    () =>
      [...new Set(records.map((row) => row.datasetGroup))]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [records],
  );

  const visibleSpecies = useMemo(() => {
    const query = speciesSearch.trim().toLowerCase();

    if (!query) return species.slice(0, 60);

    return species
      .filter(
        (item) =>
          item.label.toLowerCase().includes(query) ||
          item.bova.includes(query),
      )
      .slice(0, 120);
  }, [species, speciesSearch]);

  const filteredRecords = useMemo(() => {
    if (!selectedBova) return [];

    const startTimestamp = startDate
      ? new Date(`${startDate}T00:00:00`).getTime()
      : Number.NEGATIVE_INFINITY;
    const endTimestamp = endDate
      ? new Date(`${endDate}T23:59:59`).getTime()
      : Number.POSITIVE_INFINITY;

    return records.filter((row) => {
      if (row.bova !== selectedBova) return false;
      if (!selectedDatasets.includes(row.datasetGroup)) return false;
      if (!selectedConditions.includes(row.condition)) return false;

      return (
        row.surveyDateValue === null ||
        (row.surveyDateValue >= startTimestamp &&
          row.surveyDateValue <= endTimestamp)
      );
    });
  }, [
    endDate,
    records,
    selectedBova,
    selectedConditions,
    selectedDatasets,
    startDate,
  ]);

  const scoredCounties = useMemo<CountyFeatureCollection | null>(() => {
    if (!counties) return null;

    const countsByCountyName = new Map<string, number>();

    for (const record of filteredRecords) {
      const recordPoint = point([record.longitude, record.latitude]);

      for (const feature of counties.features) {
        const name =
          feature.properties?.__distributionCountyName ?? "Virginia county";

        try {
          if (booleanPointInPolygon(recordPoint, feature as never)) {
            countsByCountyName.set(
              name,
              (countsByCountyName.get(name) ?? 0) + 1,
            );
            break;
          }
        } catch {
          // Ignore malformed polygon features without blocking the map.
        }
      }
    }

    return {
      ...counties,
      features: counties.features.map((feature) => {
        const name =
          feature.properties?.__distributionCountyName ?? "Virginia county";

        return {
          ...feature,
          properties: {
            ...(feature.properties ?? {}),
            __distributionPointCount: countsByCountyName.get(name) ?? 0,
          },
        };
      }),
    };
  }, [counties, filteredRecords]);

  const detectedCountyCount = useMemo(
    () =>
      scoredCounties?.features.filter(
        (feature) =>
          Number(feature.properties?.__distributionPointCount ?? 0) > 0,
      ).length ?? 0,
    [scoredCounties],
  );

  const scoredHuc10 = useMemo<Huc10FeatureCollection | null>(() => {
    if (!huc10) return null;

    const knownCounts = new Map<number, number>();
    const historicCounts = new Map<number, number>();

    for (const record of filteredRecords) {
      const recordPoint = point([record.longitude, record.latitude]);
      const targetCounts =
        record.condition === "Historic" &&
        record.datasetGroup !== "Brian Release Database"
          ? historicCounts
          : knownCounts;

      for (let index = 0; index < huc10.features.length; index += 1) {
        const feature = huc10.features[index];

        try {
          if (booleanPointInPolygon(recordPoint, feature as never)) {
            targetCounts.set(index, (targetCounts.get(index) ?? 0) + 1);
            break;
          }
        } catch {
          // Ignore malformed polygon features without blocking the map.
        }
      }
    }

    return {
      ...huc10,
      features: huc10.features.map((feature, index) => ({
        ...feature,
        properties: {
          ...(feature.properties ?? {}),
          __distributionKnownCount: knownCounts.get(index) ?? 0,
          __distributionHistoricCount: historicCounts.get(index) ?? 0,
        },
      })),
    };
  }, [filteredRecords, huc10]);

  const huc10KnownFeatureCollection = useMemo<Huc10FeatureCollection | null>(
    () =>
      scoredHuc10
        ? {
            ...scoredHuc10,
            features: scoredHuc10.features.filter(
              (feature) =>
                Number(feature.properties?.__distributionKnownCount ?? 0) > 0,
            ),
          }
        : null,
    [scoredHuc10],
  );

  const huc10HistoricFeatureCollection = useMemo<Huc10FeatureCollection | null>(
    () =>
      scoredHuc10
        ? {
            ...scoredHuc10,
            features: scoredHuc10.features.filter(
              (feature) =>
                Number(feature.properties?.__distributionHistoricCount ?? 0) > 0,
            ),
          }
        : null,
    [scoredHuc10],
  );

  const scoredHuc12 = useMemo<Huc12FeatureCollection | null>(() => {
    if (!huc12) return null;

    const knownCounts = new Map<number, number>();
    const historicCounts = new Map<number, number>();

    for (const record of filteredRecords) {
      const recordPoint = point([record.longitude, record.latitude]);
      const targetCounts =
        record.condition === "Historic" &&
        record.datasetGroup !== "Brian Release Database"
          ? historicCounts
          : knownCounts;

      for (let index = 0; index < huc12.features.length; index += 1) {
        const feature = huc12.features[index];

        try {
          if (booleanPointInPolygon(recordPoint, feature as never)) {
            targetCounts.set(index, (targetCounts.get(index) ?? 0) + 1);
            break;
          }
        } catch {
          // Ignore malformed polygon features without blocking the map.
        }
      }
    }

    return {
      ...huc12,
      features: huc12.features.map((feature, index) => ({
        ...feature,
        properties: {
          ...(feature.properties ?? {}),
          __distributionKnownCount: knownCounts.get(index) ?? 0,
          __distributionHistoricCount: historicCounts.get(index) ?? 0,
        },
      })),
    };
  }, [filteredRecords, huc12]);

  const huc12KnownFeatureCollection = useMemo<Huc12FeatureCollection | null>(
    () =>
      scoredHuc12
        ? {
            ...scoredHuc12,
            features: scoredHuc12.features.filter(
              (feature) =>
                Number(feature.properties?.__distributionKnownCount ?? 0) > 0,
            ),
          }
        : null,
    [scoredHuc12],
  );

  const huc12HistoricFeatureCollection = useMemo<Huc12FeatureCollection | null>(
    () =>
      scoredHuc12
        ? {
            ...scoredHuc12,
            features: scoredHuc12.features.filter(
              (feature) =>
                Number(feature.properties?.__distributionHistoricCount ?? 0) > 0,
            ),
          }
        : null,
    [scoredHuc12],
  );

  function toggleDataset(dataset: string) {
    setSelectedDatasets((current) =>
      current.includes(dataset)
        ? current.filter((item) => item !== dataset)
        : [...current, dataset],
    );
  }

  function toggleCondition(condition: DistributionCondition) {
    setSelectedConditions((current) =>
      current.includes(condition)
        ? current.filter((item) => item !== condition)
        : [...current, condition],
    );
  }


  const visibleLegendDatasets = useMemo(
    () =>
      datasetOptions.filter(
        (dataset) =>
          selectedDatasets.includes(dataset) &&
          filteredRecords.some(
            (record) => record.datasetGroup === dataset,
          ),
      ),
    [datasetOptions, filteredRecords, selectedDatasets],
  );

  const visibleLegendShapes = useMemo(() => {
    if (!showPoints) return [];

    const shapes: Array<{
      id: string;
      label: string;
      className: string;
      symbol?: string;
    }> = [];

    const has = (condition: DistributionCondition) =>
      filteredRecords.some(
        (record) =>
          record.datasetGroup !== "Brian Release Database" &&
          record.condition === condition,
      );

    if (has("Live")) {
      shapes.push({ id: "live", label: "Live", className: "circle" });
    }
    if (has("Shell")) {
      shapes.push({ id: "shell", label: "Shell", className: "square" });
    }
    if (has("Historic")) {
      shapes.push({
        id: "historic",
        label: "Historic",
        className: "plus",
        symbol: "+",
      });
    }
    if (has("Unknown")) {
      shapes.push({ id: "unknown", label: "Unknown", className: "triangle" });
    }
    if (
      filteredRecords.some(
        (record) => record.datasetGroup === "Brian Release Database",
      )
    ) {
      shapes.push({
        id: "release",
        label: "Brian Release",
        className: "star",
        symbol: "★",
      });
    }

    return shapes;
  }, [filteredRecords, showPoints]);

  const selectedSpecies = species.find((item) => item.bova === selectedBova);


  const pointLayerKey = useMemo(
    () =>
      [
        selectedBova || "none",
        selectedDatasets.slice().sort().join("|"),
        selectedConditions.slice().sort().join("|"),
        startDate,
        endDate,
        pointSize,
        showPoints ? "shown" : "hidden",
        showHeatmap ? "heat" : "no-heat",
      ].join("::"),
    [
      endDate,
      pointSize,
      selectedBova,
      selectedConditions,
      selectedDatasets,
      showPoints,
      showHeatmap,
      startDate,
    ],
  );

  useEffect(() => {
    if (
      selectedRecord &&
      !filteredRecords.some((record) => record.id === selectedRecord.id)
    ) {
      setSelectedRecord(null);
    }
  }, [filteredRecords, selectedRecord]);


  return (
    <div className="ui-standard-page distributions-page">
      <header className="ui-page-header">
        <div>
          <p className="ui-page-eyebrow">Occurrence Mapping</p>
          <h1>Distributions</h1>
          <p>
            Combine the current NAIADD snapshot with fixed historical datasets
            to map species occurrence records. The map updates live as filters
            change.
          </p>
        </div>
      </header>

      {error && <div className="distribution-error">{error}</div>}

      <div className="distribution-layout">
        <aside className="ui-card distribution-controls">
          <section className="distribution-species-section">
            <div className="distribution-section-heading">
              <div>
                <h2>Species</h2>
                <small>Choose one species to map.</small>
              </div>

              {selectedSpecies && (
                <button
                  type="button"
                  className="distribution-clear-species"
                  onClick={() => {
                    setSelectedBova("");
                    setSpeciesSearch("");
                    setSpeciesPickerOpen(false);
                    setSelectedRecord(null);
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            <button
              type="button"
              className={
                selectedSpecies
                  ? "distribution-species-trigger selected"
                  : "distribution-species-trigger"
              }
              aria-expanded={speciesPickerOpen}
              onClick={() => setSpeciesPickerOpen((current) => !current)}
            >
              <span className="distribution-species-trigger-icon" aria-hidden="true">
                ⌕
              </span>

              <span className="distribution-species-trigger-copy">
                <strong>
                  {selectedSpecies?.scientificName ?? "Select a species"}
                </strong>
                <small>
                  {selectedSpecies
                    ? `BOVA ${selectedSpecies.bova}`
                    : "Scientific name or BOVA code"}
                </small>
              </span>

              <span className="distribution-species-trigger-chevron" aria-hidden="true">
                {speciesPickerOpen ? "⌃" : "⌄"}
              </span>
            </button>

            {speciesPickerOpen && (
              <div className="distribution-species-inline-picker">
                <div className="distribution-species-search-row">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="text"
                    value={speciesSearch}
                    placeholder="Search scientific name or BOVA..."
                    aria-label="Search scientific name or BOVA"
                    autoComplete="off"
                    onChange={(event) => setSpeciesSearch(event.target.value)}
                  />
                  {speciesSearch && (
                    <button
                      type="button"
                      aria-label="Clear species search"
                      onClick={() => setSpeciesSearch("")}
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="distribution-species-inline-meta">
                  <span>
                    {speciesSearch.trim() ? "Matching species" : "Species reference"}
                  </span>
                  <small>{visibleSpecies.length} shown</small>
                </div>

                <div className="distribution-species-inline-list">
                  {loading ? (
                    <div className="distribution-species-message">
                      Loading species…
                    </div>
                  ) : visibleSpecies.length === 0 ? (
                    <div className="distribution-species-message">
                      No matching species.
                    </div>
                  ) : (
                    visibleSpecies.map((item) => (
                      <button
                        type="button"
                        key={item.bova}
                        className={
                          selectedBova === item.bova
                            ? "distribution-species-option active"
                            : "distribution-species-option"
                        }
                        onClick={() => {
                          setSelectedBova(item.bova);
                          setSpeciesSearch("");
                          setSpeciesPickerOpen(false);
                          setSelectedRecord(null);
                        }}
                      >
                        <span className="distribution-species-option-copy">
                          <strong>{item.scientificName}</strong>
                          <small>BOVA {item.bova}</small>
                        </span>
                        <span className="distribution-species-option-check">
                          {selectedBova === item.bova ? "✓" : ""}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>

          <details open className="distribution-filter-group">
            <summary>
              <span>Dataset</span>
              <small>
                {selectedDatasets.length} of {datasetOptions.length}
              </small>
            </summary>
            <div className="distribution-dataset-list">
              {datasetOptions.map((dataset) => {
                const checked = selectedDatasets.includes(dataset);
                const count = records.filter(
                  (record) =>
                    record.datasetGroup === dataset &&
                    (!selectedBova || record.bova === selectedBova),
                ).length;

                return (
                  <label
                    key={dataset}
                    className={
                      checked
                        ? "distribution-dataset-row active"
                        : "distribution-dataset-row"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDataset(dataset)}
                    />

                    <span
                      className="distribution-color-dot"
                      style={{
                        background:
                          DATASET_POINT_COLORS[dataset] ?? "var(--ui-text)",
                      }}
                    />

                    <span className="distribution-dataset-copy">
                      <strong>{dataset}</strong>
                      <small>{count.toLocaleString()} records</small>
                    </span>

                    <span className="distribution-dataset-toggle" aria-hidden="true">
                      <span />
                    </span>
                  </label>
                );
              })}
            </div>
          </details>

          <details open className="distribution-filter-group">
            <summary>
              <span>Condition</span>
              <small>{selectedConditions.length} selected</small>
            </summary>
            <div className="distribution-condition-grid">
              {CONDITION_OPTIONS.map((condition) => {
                const checked = selectedConditions.includes(condition);
                const count = records.filter(
                  (record) =>
                    record.condition === condition &&
                    (!selectedBova || record.bova === selectedBova),
                ).length;

                return (
                  <label
                    key={condition}
                    className={
                      checked
                        ? "distribution-condition-chip active"
                        : "distribution-condition-chip"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCondition(condition)}
                    />
                    <span>{condition}</span>
                    <small>{count.toLocaleString()}</small>
                  </label>
                );
              })}
            </div>
          </details>

          <section>
            <h2>Date range</h2>
            <div className="distribution-date-grid">
              <label>
                Start
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label>
                End
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
            </div>
            <small>Records with unknown dates remain included.</small>
          </section>

          <section className="distribution-point-section">
            <div className="distribution-point-heading">
              <div>
                <h2>Map display</h2>
                <small>Choose how occurrence density is visualized.</small>
              </div>
            </div>

            <div className="distribution-display-modes">
              <label
                className={
                  showPoints
                    ? "distribution-display-mode points active"
                    : "distribution-display-mode points"
                }
              >
                <input
                  type="checkbox"
                  checked={showPoints}
                  onChange={(event) => setShowPoints(event.target.checked)}
                />
                <span className="distribution-display-mode-icon">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <strong>Points</strong>
                  <small>Dataset color and condition shape</small>
                </span>
                <em>{showPoints ? "On" : "Off"}</em>
              </label>

              <label
                className={
                  showHeatmap
                    ? "distribution-display-mode heat active"
                    : "distribution-display-mode heat"
                }
              >
                <input
                  type="checkbox"
                  checked={showHeatmap}
                  onChange={(event) => setShowHeatmap(event.target.checked)}
                />
                <span className="distribution-display-mode-icon">
                  <i />
                </span>
                <span>
                  <strong>Heatmap</strong>
                  <small>Glowing density across all filtered records</small>
                </span>
                <em>{showHeatmap ? "On" : "Off"}</em>
              </label>
            </div>

            <label className="distribution-range-control">
              <span>
                <strong>Point size</strong>
                <b>{pointSize}px</b>
              </span>
              <input
                type="range"
                min="2"
                max="10"
                step="1"
                value={pointSize}
                disabled={!showPoints}
                onChange={(event) => setPointSize(Number(event.target.value))}
              />
            </label>
          </section>

          <section className="distribution-polygon-section">
            <div className="distribution-point-heading">
              <div>
                <h2>County detection</h2>
                <small>Shade counties containing filtered records.</small>
              </div>
              <label className="distribution-switch">
                <input
                  type="checkbox"
                  checked={showCounties}
                  disabled={!counties}
                  onChange={(event) => setShowCounties(event.target.checked)}
                />
                <span aria-hidden="true" />
                <em>{showCounties ? "Shown" : "Hidden"}</em>
              </label>
            </div>

            <div className="distribution-county-summary">
              <span>
                <strong>{detectedCountyCount}</strong>
                detected counties
              </span>
              <span>
                <strong>{filteredRecords.length.toLocaleString()}</strong>
                filtered records
              </span>
            </div>

            {countyError && (
              <p className="distribution-county-error">{countyError}</p>
            )}
          </section>

          <section className="distribution-huc-section">
            <div className="distribution-point-heading">
              <div>
                <h2>VDCR Hydrounits</h2>
                <small>HUC10 NWDB presence polygons.</small>
              </div>
            </div>

            <div className="distribution-huc-options">
              <label
                className={
                  showHuc10Known
                    ? "distribution-huc-option known active"
                    : "distribution-huc-option known"
                }
              >
                <input
                  type="checkbox"
                  checked={showHuc10Known}
                  disabled={!huc10}
                  onChange={(event) => setShowHuc10Known(event.target.checked)}
                />
                <span className="distribution-huc-swatch" />
                <span>
                  <strong>Known</strong>
                  <small>
                    {huc10KnownFeatureCollection?.features.length ?? 0} hydrounits
                  </small>
                </span>
                <em>{showHuc10Known ? "✓" : ""}</em>
              </label>

              <label
                className={
                  showHuc10Historic
                    ? "distribution-huc-option historic active"
                    : "distribution-huc-option historic"
                }
              >
                <input
                  type="checkbox"
                  checked={showHuc10Historic}
                  disabled={!huc10}
                  onChange={(event) =>
                    setShowHuc10Historic(event.target.checked)
                  }
                />
                <span className="distribution-huc-swatch" />
                <span>
                  <strong>Historic</strong>
                  <small>
                    {huc10HistoricFeatureCollection?.features.length ?? 0} hydrounits
                  </small>
                </span>
                <em>{showHuc10Historic ? "✓" : ""}</em>
              </label>
            </div>

            {huc10Error && (
              <p className="distribution-county-error">{huc10Error}</p>
            )}
          </section>

          <section className="distribution-huc-section">
            <div className="distribution-point-heading">
              <div>
                <h2>Virginia Subwatersheds</h2>
                <small>HUC12 NWDB presence polygons.</small>
              </div>
            </div>

            <div className="distribution-huc-options">
              <label className={showHuc12Known ? "distribution-huc-option known active" : "distribution-huc-option known"}>
                <input
                  type="checkbox"
                  checked={showHuc12Known}
                  disabled={!huc12}
                  onChange={(event) => setShowHuc12Known(event.target.checked)}
                />
                <span className="distribution-huc-swatch" />
                <span>
                  <strong>Known</strong>
                  <small>{huc12KnownFeatureCollection?.features.length ?? 0} subwatersheds</small>
                </span>
                <em>{showHuc12Known ? "✓" : ""}</em>
              </label>

              <label className={showHuc12Historic ? "distribution-huc-option historic active" : "distribution-huc-option historic"}>
                <input
                  type="checkbox"
                  checked={showHuc12Historic}
                  disabled={!huc12}
                  onChange={(event) => setShowHuc12Historic(event.target.checked)}
                />
                <span className="distribution-huc-swatch" />
                <span>
                  <strong>Historic</strong>
                  <small>{huc12HistoricFeatureCollection?.features.length ?? 0} subwatersheds</small>
                </span>
                <em>{showHuc12Historic ? "✓" : ""}</em>
              </label>
            </div>

            {huc12Error && (
              <p className="distribution-county-error">{huc12Error}</p>
            )}
          </section>

          <div className="distribution-counts">
            <span>
              <strong>{filteredRecords.length.toLocaleString()}</strong>
              mapped records
            </span>
            <span>
              <strong>{selectedDatasets.length}</strong>
              active datasets
            </span>
          </div>
        </aside>

        <section className="distribution-map-column">
          <div className="ui-card distribution-map-card">
            <div className="distribution-map-heading">
              <div>
                <h2>{selectedSpecies?.scientificName || "Distribution map"}</h2>
                <p>
                  {selectedSpecies
                    ? `BOVA ${selectedSpecies.bova}`
                    : "Select a species to begin mapping."}
                </p>
              </div>

              <button
                type="button"
                className="ui-button ui-button-secondary"
                disabled={filteredRecords.length === 0}
                onClick={() =>
                  exportDistributionRecords(
                    filteredRecords,
                    `NAIADD_Distribution_${selectedBova || "Records"}.csv`,
                  )
                }
              >
                Export Records
              </button>
            </div>

            <div className="distribution-map-wrap">
              <MapContainer
                bounds={VIRGINIA_BOUNDS}
                boundsOptions={{ padding: [12, 12] }}
                scrollWheelZoom
              >
                <LayersControl position="bottomright">
                  <LayersControl.BaseLayer checked name="Light">
                    <TileLayer
                      attribution="&copy; OpenStreetMap contributors &copy; CARTO"
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Topographic">
                    <TileLayer
                      attribution="Tiles &copy; Esri"
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Satellite">
                    <TileLayer
                      attribution="Tiles &copy; Esri"
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    />
                  </LayersControl.BaseLayer>
                </LayersControl>

                {showHuc12Known &&
                  huc12KnownFeatureCollection &&
                  huc12KnownFeatureCollection.features.length > 0 && (
                    <GeoJSON
                      key={`huc12-known-${selectedBova}-${filteredRecords.length}`}
                      data={huc12KnownFeatureCollection}
                      style={() => ({
                        color: "#1f2937",
                        weight: 0.7,
                        opacity: 0.8,
                        fillColor: "#d9f6cf",
                        fillOpacity: 0.64,
                      })}
                      onEachFeature={(feature, layer) => {
                        const name =
                          feature.properties?.PolyName ??
                          feature.properties?.HUC12Name ??
                          feature.properties?.HUC12 ??
                          "HUC12 Subwatershed";
                        const count = Number(feature.properties?.__distributionKnownCount ?? 0);
                        layer.bindPopup(`<strong>${name}</strong><br/>Known records: ${count.toLocaleString()}`);
                      }}
                    />
                  )}

                {showHuc12Historic &&
                  huc12HistoricFeatureCollection &&
                  huc12HistoricFeatureCollection.features.length > 0 && (
                    <GeoJSON
                      key={`huc12-historic-${selectedBova}-${filteredRecords.length}`}
                      data={huc12HistoricFeatureCollection}
                      style={() => ({
                        color: "#111827",
                        weight: 1,
                        opacity: 0.95,
                        dashArray: "6 4",
                        fillColor: "#f28f8f",
                        fillOpacity: 0.56,
                      })}
                      onEachFeature={(feature, layer) => {
                        const name =
                          feature.properties?.PolyName ??
                          feature.properties?.HUC12Name ??
                          feature.properties?.HUC12 ??
                          "HUC12 Subwatershed";
                        const count = Number(feature.properties?.__distributionHistoricCount ?? 0);
                        layer.bindPopup(`<strong>${name}</strong><br/>Historic records: ${count.toLocaleString()}`);
                      }}
                    />
                  )}

                {showHuc10Known &&
                  huc10KnownFeatureCollection &&
                  huc10KnownFeatureCollection.features.length > 0 && (
                    <GeoJSON
                      key={`huc10-known-${selectedBova}-${filteredRecords.length}`}
                      data={huc10KnownFeatureCollection}
                      style={() => ({
                        color: "#1f2937",
                        weight: 0.8,
                        opacity: 0.8,
                        fillColor: "#ffebaf",
                        fillOpacity: 0.62,
                      })}
                      onEachFeature={(feature, layer) => {
                        const name =
                          feature.properties?.PolyName ??
                          feature.properties?.HUC10Name ??
                          feature.properties?.HUC10 ??
                          "HUC10 Hydrounit";
                        const count = Number(
                          feature.properties?.__distributionKnownCount ?? 0,
                        );

                        layer.bindPopup(
                          `<strong>${name}</strong><br/>Known records: ${count.toLocaleString()}`,
                        );
                      }}
                    />
                  )}

                {showHuc10Historic &&
                  huc10HistoricFeatureCollection &&
                  huc10HistoricFeatureCollection.features.length > 0 && (
                    <GeoJSON
                      key={`huc10-historic-${selectedBova}-${filteredRecords.length}`}
                      data={huc10HistoricFeatureCollection}
                      style={() => ({
                        color: "#111827",
                        weight: 1,
                        opacity: 0.9,
                        dashArray: "6 4",
                        fillColor: "#f28f8f",
                        fillOpacity: 0.5,
                      })}
                      onEachFeature={(feature, layer) => {
                        const name =
                          feature.properties?.PolyName ??
                          feature.properties?.HUC10Name ??
                          feature.properties?.HUC10 ??
                          "HUC10 Hydrounit";
                        const count = Number(
                          feature.properties?.__distributionHistoricCount ?? 0,
                        );

                        layer.bindPopup(
                          `<strong>${name}</strong><br/>Historic records: ${count.toLocaleString()}`,
                        );
                      }}
                    />
                  )}

                {showCounties && scoredCounties && (
                  <GeoJSON
                    key={`${selectedBova}-${filteredRecords.length}-${detectedCountyCount}`}
                    data={scoredCounties}
                    style={(feature) => {
                      const count = Number(
                        feature?.properties?.__distributionPointCount ?? 0,
                      );

                      return {
                        color: "#334155",
                        weight: 1,
                        opacity: 0.75,
                        fillColor: count > 0 ? "#b5a174" : "#d8cfb5",
                        fillOpacity: count > 0 ? 0.68 : 0.32,
                      };
                    }}
                    onEachFeature={(feature, layer) => {
                      const name =
                        feature.properties?.__distributionCountyName ??
                        "Virginia county";
                      const count = Number(
                        feature.properties?.__distributionPointCount ?? 0,
                      );

                      layer.bindPopup(
                        `<strong>${name}</strong><br/>Filtered records: ${count.toLocaleString()}`,
                      );
                    }}
                  />
                )}

                <DistributionHeatmapLayer
                  records={selectedBova ? filteredRecords : []}
                  visible={showHeatmap && Boolean(selectedBova)}
                />

                {selectedBova && showPoints && (
                  <FeatureGroup key={pointLayerKey}>
                    {filteredRecords.map((row, recordIndex) => (
                      <Marker
                        key={`${pointLayerKey}-${row.datasetGroup}-${row.sourceFile}-${row.sourceRow}-${row.id}-${recordIndex}`}
                        position={[row.latitude, row.longitude]}
                        icon={distributionPointIcon(row, pointSize)}
                        eventHandlers={{
                          click: () => setSelectedRecord(row),
                        }}
                      >
                        <Popup>
                        <strong>{row.datasetGroup}</strong>
                        <br />
                        Date: {row.surveyDate}
                        <br />
                        Condition: {row.condition}
                        <br />
                        BOVA: {row.bova || "Unknown"}
                        <br />
                        TableID:{" "}
                        {String(row.raw.TableID ?? row.id ?? "Unknown")}
                        </Popup>
                      </Marker>
                    ))}
                  </FeatureGroup>
                )}
              </MapContainer>


              <div className="distribution-map-legend">
                {(showHuc12Known || showHuc12Historic) && (
                  <>
                    <strong>Virginia HUC12</strong>
                    <div className="distribution-legend-counties">
                      {showHuc12Known && (
                        <span><i className="huc12 known" />Known</span>
                      )}
                      {showHuc12Historic && (
                        <span><i className="huc12 historic" />Historic</span>
                      )}
                    </div>
                  </>
                )}

                {(showHuc10Known || showHuc10Historic) && (
                  <>
                    <strong>VDCR HUC10</strong>
                    <div className="distribution-legend-counties">
                      {showHuc10Known && (
                        <span><i className="huc10 known" />Known</span>
                      )}
                      {showHuc10Historic && (
                        <span><i className="huc10 historic" />Historic</span>
                      )}
                    </div>
                  </>
                )}

                {showCounties && (
                  <>
                    <strong>County detection</strong>
                    <div className="distribution-legend-counties">
                      <span><i className="county present" />Presence</span>
                      <span><i className="county absent" />No records</span>
                    </div>
                  </>
                )}

                {showHeatmap && filteredRecords.length > 0 && (
                  <>
                    <strong>Heatmap density</strong>
                    <div className="distribution-legend-heat">
                      <span>Low</span>
                      <i />
                      <span>High</span>
                    </div>
                  </>
                )}

                {showPoints && visibleLegendDatasets.length > 0 && (
                  <>
                    <strong>Dataset color</strong>
                    <div className="distribution-legend-datasets">
                      {visibleLegendDatasets.map((dataset) => (
                        <span key={dataset}>
                          <i
                            style={{
                              background:
                                DATASET_POINT_COLORS[dataset] ??
                                "var(--ui-text)",
                            }}
                          />
                          {dataset}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {visibleLegendShapes.length > 0 && (
                  <>
                    <strong>Shape key</strong>
                    <div className="distribution-legend-shapes">
                      {visibleLegendShapes.map((shape) => (
                        <span key={shape.id}>
                          <b className={`legend-shape ${shape.className}`}>
                            {shape.symbol ?? ""}
                          </b>
                          {shape.label}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {!loading &&
                selectedBova &&
                filteredRecords.length === 0 && (
                  <div className="distribution-map-empty">
                    <strong>No mapped records yet</strong>
                    <small>
                      Adjust the species, dataset, condition, or date filters.
                    </small>
                  </div>
                )}

              {loading && (
                <div className="distribution-map-loading">
                  <span className="distribution-spinner" />
                  <strong>Loading distribution data</strong>
                  <small>
                    Reading the NAIADD snapshot and historical observations.
                  </small>
                </div>
              )}
            </div>
          </div>

          <div className="ui-card distribution-selected-card">
            <div className="distribution-map-heading">
              <div>
                <h2>Selected Record</h2>
                <p>Click a mapped point to review its standardized values.</p>
              </div>
            </div>

            {selectedRecord ? (
              <div className="distribution-record-grid">
                <span>
                  <small>Dataset</small>
                  <strong>{selectedRecord.datasetGroup}</strong>
                </span>
                <span>
                  <small>TableID</small>
                  <strong>
                    {String(
                      selectedRecord.raw.TableID ??
                        selectedRecord.id ??
                        "Unknown",
                    )}
                  </strong>
                </span>
                <span>
                  <small>Date</small>
                  <strong>{selectedRecord.surveyDate}</strong>
                </span>
                <span>
                  <small>Condition</small>
                  <strong>{selectedRecord.condition}</strong>
                </span>
                <span>
                  <small>Project</small>
                  <strong>{selectedRecord.project}</strong>
                </span>
                <span>
                  <small>Latitude</small>
                  <strong>{selectedRecord.latitude}</strong>
                </span>
                <span>
                  <small>Longitude</small>
                  <strong>{selectedRecord.longitude}</strong>
                </span>
              </div>
            ) : (
              <div className="distribution-record-empty">
                No point is currently selected.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
