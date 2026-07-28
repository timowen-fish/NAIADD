import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "../styles/CurrentConditions.css";

export type DashboardSite = {
  key: string;
  label: string;
  siteID: string;
  waterbody: string;
  siteName: string;
  locationDesc: string;
  county: string;
  searchText: string;
  lat: number;
  lng: number;
};

function normalizeSiteSearch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fuzzySiteScore(site: DashboardSite, query: string) {
  const normalizedQuery = normalizeSiteSearch(query);

  if (!normalizedQuery) return 0;

  const haystack = normalizeSiteSearch(site.searchText);

  if (!haystack) return 0;
  if (haystack === normalizedQuery) return 1000;
  if (haystack.includes(normalizedQuery))
    return 800 - haystack.indexOf(normalizedQuery);

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  let score = 0;
  let searchStart = 0;

  for (const token of tokens) {
    const tokenIndex = haystack.indexOf(token);

    if (tokenIndex >= 0) {
      score += 120;
      if (tokenIndex >= searchStart) score += 30;
      searchStart = tokenIndex + token.length;
      continue;
    }

    let cursor = searchStart;
    let matchedCharacters = 0;

    for (const char of token) {
      const nextIndex = haystack.indexOf(char, cursor);
      if (nextIndex < 0) break;
      matchedCharacters += 1;
      cursor = nextIndex + 1;
    }

    if (matchedCharacters >= Math.max(2, Math.ceil(token.length * 0.65))) {
      score += matchedCharacters * 7;
      searchStart = cursor;
    }
  }

  return score;
}

function parseWindSpeedMph(value: any): number | null {
  const text = String(value ?? "");
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map((match) =>
    Number(match[1]),
  );

  if (matches.length === 0) return null;

  const average = matches.reduce((sum, item) => sum + item, 0) / matches.length;
  return Number.isFinite(average) ? Math.round(average) : null;
}

function windDirectionToDegrees(value: any): number {
  const text = String(value ?? "")
    .trim()
    .toUpperCase();

  const directions: Record<string, number> = {
    N: 0,
    NNE: 22.5,
    NE: 45,
    ENE: 67.5,
    E: 90,
    ESE: 112.5,
    SE: 135,
    SSE: 157.5,
    S: 180,
    SSW: 202.5,
    SW: 225,
    WSW: 247.5,
    W: 270,
    WNW: 292.5,
    NW: 315,
    NNW: 337.5,
  };

  return directions[text] ?? 225;
}

function windArrowSymbol(direction: string): string {
  const degrees = windDirectionToDegrees(direction);

  if (degrees >= 337.5 || degrees < 22.5) return "↓";
  if (degrees < 67.5) return "↙";
  if (degrees < 112.5) return "←";
  if (degrees < 157.5) return "↖";
  if (degrees < 202.5) return "↑";
  if (degrees < 247.5) return "↗";
  if (degrees < 292.5) return "→";
  return "↘";
}

type WindVectorPoint = {
  x: number;
  y: number;
  speedMph: number;
  directionDegrees: number;
};

function cssFlowDegreesFromWindFrom(directionDegrees: number) {
  return (directionDegrees + 90 + 360) % 360;
}

function interpolateWindAt(
  vectors: WindVectorPoint[],
  x: number,
  y: number,
  fallbackDirectionDegrees: number,
  fallbackSpeedMph: number | null,
) {
  if (!vectors.length) {
    const wave = Math.sin(x * 0.115 + y * 0.041) * 28 + Math.cos(y * 0.09) * 16;
    return {
      cssDegrees: cssFlowDegreesFromWindFrom(fallbackDirectionDegrees + wave),
      speedMph: fallbackSpeedMph ?? 8,
    };
  }

  let weightedU = 0;
  let weightedV = 0;
  let weightedSpeed = 0;
  let totalWeight = 0;

  for (const vector of vectors) {
    const dx = vector.x - x;
    const dy = vector.y - y;
    const weight = 1 / Math.max(dx * dx + dy * dy, 18);
    const flowDegrees = vector.directionDegrees + 180;
    const radians = (flowDegrees * Math.PI) / 180;

    weightedU += Math.sin(radians) * vector.speedMph * weight;
    weightedV += -Math.cos(radians) * vector.speedMph * weight;
    weightedSpeed += vector.speedMph * weight;
    totalWeight += weight;
  }

  if (!totalWeight) {
    return {
      cssDegrees: cssFlowDegreesFromWindFrom(fallbackDirectionDegrees),
      speedMph: fallbackSpeedMph ?? 8,
    };
  }

  const u = weightedU / totalWeight;
  const v = weightedV / totalWeight;
  const angle = (Math.atan2(v, u) * 180) / Math.PI;

  return {
    cssDegrees: (angle + 360) % 360,
    speedMph: Math.max(1, weightedSpeed / totalWeight),
  };
}

function WindOverlay({
  enabled,
  speedMph,
  directionDegrees,
  vectors,
}: {
  enabled: boolean;
  speedMph: number | null;
  directionDegrees: number;
  vectors: WindVectorPoint[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<
    {
      x: number;
      y: number;
      age: number;
      maxAge: number;
      phase: number;
    }[]
  >([]);

  useEffect(() => {
    if (!enabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { alpha: true });

    if (!context) return;

    let animationFrame = 0;
    let lastFrame = performance.now();
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let compact = false;

    const random = (seed: number) => {
      const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
      return value - Math.floor(value);
    };

    const resetParticle = (particle: {
      x: number;
      y: number;
      age: number;
      maxAge: number;
      phase: number;
    }, seed: number, soft = false) => {
      particle.x = random(seed + 1) * Math.max(width, 1);
      particle.y = random(seed + 2) * Math.max(height, 1);
      particle.age = soft ? Math.floor(random(seed + 3) * particle.maxAge) : 0;
      particle.maxAge =
        (compact ? 48 : 54) +
        Math.floor(random(seed + 4) * (compact ? 42 : 52));
      particle.phase = random(seed + 5);
    };

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(box.width));
      height = Math.max(1, Math.floor(box.height));
      compact = width <= 760;
      pixelRatio = Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 2);

      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      const targetCount = compact
        ? Math.max(560, Math.min(760, Math.round((width * height) / 180)))
        : Math.max(900, Math.min(1200, Math.round((width * height) / 420)));

      if (particlesRef.current.length !== targetCount) {
        particlesRef.current = Array.from({ length: targetCount }, (_, index) => {
          const particle = {
            x: 0,
            y: 0,
            age: 0,
            maxAge: 60,
            phase: 0,
          };

          resetParticle(particle, index * 13.37, true);
          return particle;
        });
      } else {
        particlesRef.current.forEach((particle, index) => {
          resetParticle(particle, index * 13.37, true);
        });
      }
    };

    resize();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(resize)
        : null;

    resizeObserver?.observe(canvas);

    const colorForSpeed = (speed: number, alpha = 1) => {
      if (speed < 2) return `rgba(190, 225, 255, ${0.12 * alpha})`;
      if (speed < 7) return `rgba(68, 230, 130, ${0.48 * alpha})`;
      if (speed < 14) return `rgba(246, 222, 73, ${0.62 * alpha})`;
      if (speed < 24) return `rgba(255, 139, 40, ${0.72 * alpha})`;
      return `rgba(255, 56, 56, ${0.82 * alpha})`;
    };

    const draw = (now: number) => {
      const delta = Math.min(42, Math.max(8, now - lastFrame));
      lastFrame = now;

      context.save();
      context.globalCompositeOperation = "destination-out";
      context.fillStyle = compact
        ? "rgba(0, 0, 0, 0.125)"
        : "rgba(0, 0, 0, 0.105)";
      context.fillRect(0, 0, width, height);
      context.restore();

      context.save();
      context.globalCompositeOperation = "lighter";
      context.lineCap = "round";
      context.lineJoin = "round";

      particlesRef.current.forEach((particle, index) => {
        if (particle.age > particle.maxAge) {
          resetParticle(particle, now * 0.001 + index * 19.1);
        }

        const percentX = Math.min(100, Math.max(0, (particle.x / width) * 100));
        const percentY = Math.min(100, Math.max(0, (particle.y / height) * 100));
        const localWind = interpolateWindAt(
          vectors,
          percentX,
          percentY,
          directionDegrees,
          speedMph,
        );

        const direction =
          ((localWind.cssDegrees +
            Math.sin(particle.phase * 6.283 + now * 0.00035) * 5) *
            Math.PI) /
          180;

        const speed = Math.max(0.5, localWind.speedMph || speedMph || 8);
        const velocity =
          (compact ? 0.68 : 0.78) *
          (0.92 + Math.min(speed, 34) / 9) *
          (delta / 16.67);

        const previousX = particle.x;
        const previousY = particle.y;

        particle.x += Math.cos(direction) * velocity;
        particle.y += Math.sin(direction) * velocity;
        particle.age += 1;

        if (
          particle.x < -36 ||
          particle.x > width + 36 ||
          particle.y < -36 ||
          particle.y > height + 36
        ) {
          resetParticle(particle, now * 0.001 + index * 23.7);
          return;
        }

        const alpha =
          Math.min(0.86, Math.max(0.18, 0.18 + speed / 32)) *
          Math.sin(Math.min(1, particle.age / 14) * Math.PI * 0.5);

        context.strokeStyle = colorForSpeed(speed, alpha);
        context.lineWidth = compact
          ? Math.min(1.45, 0.72 + speed / 36)
          : Math.min(1.55, 0.62 + speed / 34);

        context.beginPath();
        context.moveTo(previousX, previousY);
        context.lineTo(particle.x, particle.y);
        context.stroke();

      });

      context.restore();
      animationFrame = window.requestAnimationFrame(draw);
    };

    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      context.clearRect(0, 0, width, height);
    };
  }, [enabled, vectors, directionDegrees, speedMph]);

  if (!enabled) return null;

  return (
    <div
      className={[
        "home-wind-overlay",
        "canvas-wind-field",
        speedMph && speedMph >= 12 ? "strong" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="home-wind-canvas" />
    </div>
  );
}

type TidePrediction = {
  time: string;
  value: number;
};

type TideStation = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type?: string;
  source?: string;
};

type FlowHydroPoint = {
  time: string;
  value: number;
};

type FlowGage = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distanceMiles: number;
  agency?: string;
  flowCfs?: number | null;
  stageFt?: number | null;
  flowSeries?: FlowHydroPoint[];
  stageSeries?: FlowHydroPoint[];
  observedAt?: string;
  url: string;
};

type HourlyForecastPoint = {
  time: string;
  temperature: number;
  windMph: number | null;
  windDirection: string;
  windDegrees: number;
};

const TIDE_STATIONS: TideStation[] = [
  { id: "8631044", name: "Wachapreague, VA", lat: 37.6078, lng: -75.6858 },
  { id: "8632200", name: "Kiptopeke, VA", lat: 37.1652, lng: -75.9884 },
  { id: "8635150", name: "Colonial Beach, VA", lat: 38.2546, lng: -76.9636 },
  { id: "8635750", name: "Lewisetta, VA", lat: 37.9954, lng: -76.4646 },
  {
    id: "8636499",
    name: "Wakema (Fraziers Ferry), Mattaponi River, VA",
    lat: 37.5026,
    lng: -76.7828,
    type: "subordinate",
    source: "fallback",
  },
  { id: "8636580", name: "Windmill Point, VA", lat: 37.6155, lng: -76.2898 },
  {
    id: "8636941",
    name: "Richmond Deepwater Terminal, James River, VA",
    lat: 37.46,
    lng: -77.421,
  },
  {
    id: "8637689",
    name: "Yorktown USCG Training Center, VA",
    lat: 37.2265,
    lng: -76.4788,
  },
  {
    id: "8638449",
    name: "Claremont, James River, VA",
    lat: 37.2237,
    lng: -76.9644,
  },
  {
    id: "8638491",
    name: "Chester, James River, VA",
    lat: 37.3567,
    lng: -77.37,
  },
  {
    id: "8638495",
    name: "Richmond River Locks, James River, VA",
    lat: 37.524,
    lng: -77.416,
  },
  { id: "8638610", name: "Sewells Point, VA", lat: 36.9467, lng: -76.33 },
  {
    id: "8638863",
    name: "Chesapeake Bay Bridge Tunnel, VA",
    lat: 36.9667,
    lng: -76.1133,
  },
  { id: "8639348", name: "Money Point, VA", lat: 36.7782, lng: -76.3019 },

  /*
    Common Virginia tributary / river prediction stations used as a fallback
    when NOAA metadata is unavailable or filtered oddly by the public API.
  */
  {
    id: "8637611",
    name: "Lanexa, Chickahominy River, VA",
    lat: 37.397,
    lng: -76.904,
    type: "subordinate",
    source: "fallback",
  },
  {
    id: "8637624",
    name: "Walkers Landing, Chickahominy River, VA",
    lat: 37.288,
    lng: -76.852,
    type: "subordinate",
    source: "fallback",
  },
  {
    id: "8638614",
    name: "Jamestown Island, James River, VA",
    lat: 37.21,
    lng: -76.779,
    type: "subordinate",
    source: "fallback",
  },
  {
    id: "8638619",
    name: "Scotland, James River, VA",
    lat: 37.185,
    lng: -76.785,
    type: "subordinate",
    source: "fallback",
  },
  {
    id: "8638450",
    name: "Hopewell, James River, VA",
    lat: 37.315,
    lng: -77.287,
    type: "subordinate",
    source: "fallback",
  },
  {
    id: "8638489",
    name: "Puddledock, Appomattox River, VA",
    lat: 37.267,
    lng: -77.382,
    type: "subordinate",
    source: "fallback",
  },
  {
    id: "8637627",
    name: "West Point, York River, VA",
    lat: 37.532,
    lng: -76.797,
    type: "subordinate",
    source: "fallback",
  },
  {
    id: "8637682",
    name: "Gloucester Point, York River, VA",
    lat: 37.247,
    lng: -76.5,
    type: "subordinate",
    source: "fallback",
  },
  {
    id: "8635027",
    name: "Dahlgren, Upper Machodoc Creek, VA",
    lat: 38.319,
    lng: -77.037,
    type: "subordinate",
    source: "fallback",
  },
  {
    id: "8635028",
    name: "Aquia Creek, Potomac River, VA",
    lat: 38.418,
    lng: -77.351,
    type: "subordinate",
    source: "fallback",
  },
  {
    id: "8632837",
    name: "Tangier Island, Chesapeake Bay, VA",
    lat: 37.825,
    lng: -75.992,
    type: "subordinate",
    source: "fallback",
  },
];

const TIDE_STATION_CACHE_KEY = "vadma_noaa_tide_stations_v1";
const TIDE_STATION_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function coopsStationToTideStation(item: any): TideStation | null {
  const id = String(
    item?.id ?? item?.stationId ?? item?.station_id ?? "",
  ).trim();
  const name = String(item?.name ?? item?.stationName ?? "").trim();
  const lat = Number(item?.lat ?? item?.latitude);
  const lng = Number(item?.lng ?? item?.lon ?? item?.longitude);

  if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (lat < 35 || lat > 40.5 || lng < -84 || lng > -74) {
    return null;
  }

  return {
    id,
    name: name.endsWith(", VA") ? name : `${name}, VA`,
    lat,
    lng,
    type: String(item?.type ?? item?.stationType ?? item?.station_type ?? ""),
    source: "noaa",
  };
}

function readCachedTideStations(): TideStation[] | null {
  try {
    const raw = localStorage.getItem(TIDE_STATION_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      cachedAt?: string;
      stations?: TideStation[];
    };

    const cachedAt = parsed.cachedAt ? new Date(parsed.cachedAt).getTime() : 0;

    if (!cachedAt || Date.now() - cachedAt > TIDE_STATION_CACHE_MAX_AGE_MS) {
      localStorage.removeItem(TIDE_STATION_CACHE_KEY);
      return null;
    }

    if (!Array.isArray(parsed.stations) || parsed.stations.length === 0) {
      return null;
    }

    return parsed.stations;
  } catch {
    localStorage.removeItem(TIDE_STATION_CACHE_KEY);
    return null;
  }
}

function writeCachedTideStations(stations: TideStation[]) {
  try {
    localStorage.setItem(
      TIDE_STATION_CACHE_KEY,
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        stations,
      }),
    );
  } catch {
    // Best-effort cache only.
  }
}

async function loadNoaaTideStations(): Promise<TideStation[]> {
  const cached = readCachedTideStations();
  if (cached?.length) return cached;

  try {
    const metadataUrls = [
      "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions&units=english",
      "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels&units=english",
    ];

    const stationItems: any[] = [];

    for (const metadataUrl of metadataUrls) {
      const response = await fetch(metadataUrl, {
        cache: "no-store",
      });

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      stationItems.push(...(data?.stations ?? []));
    }

    if (stationItems.length === 0) {
      throw new Error("NOAA station metadata request failed.");
    }

    const stations = stationItems
      .map(coopsStationToTideStation)
      .filter(Boolean) as TideStation[];

    /*
      NOAA metadata should cover the smaller subordinate prediction stations.
      Keep our known stations merged in as a safety net.
    */
    const merged = new Map<string, TideStation>();

    [...stations, ...TIDE_STATIONS].forEach((station) => {
      merged.set(station.id, station);
    });

    const finalStations = [...merged.values()];

    if (finalStations.length > 0) {
      writeCachedTideStations(finalStations);
      return finalStations;
    }
  } catch (error) {
    console.warn("Unable to load NOAA tide station metadata:", error);
  }

  return TIDE_STATIONS;
}

function haversineMiles(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);

  const startLat = toRadians(aLat);
  const endLat = toRadians(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function tideStationScore(
  station: TideStation,
  lat: number,
  lng: number,
  label: string,
) {
  const distanceMiles = haversineMiles(lat, lng, station.lat, station.lng);
  const normalizedLabel = `${label}`.toLowerCase();
  const normalizedName = station.name.toLowerCase();

  let score = distanceMiles;

  /*
    Subordinate tide-prediction stations are often better for tributaries than
    the closest full harmonic ocean/bay station. Bias toward a direct name match
    when users click/select something like Chickahominy, Lanexa, Richmond, etc.
  */
  normalizedLabel
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
    .forEach((token) => {
      if (normalizedName.includes(token)) {
        score -= 25;
      }
    });

  if (station.type?.toLowerCase().includes("subordinate")) {
    score -= 2.5;
  }

  return {
    station,
    distanceMiles,
    score,
  };
}

function formatNoaaDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function parseUsgsRdbSites(
  text: string,
  originLat: number,
  originLng: number,
): FlowGage[] {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"));

  if (lines.length < 3) return [];

  const headerIndex = lines.findIndex(
    (line) => line.includes("site_no") && line.includes("dec_lat_va"),
  );
  if (headerIndex < 0 || headerIndex + 2 >= lines.length) return [];

  const headers = lines[headerIndex].split("\t");
  const dataLines = lines.slice(headerIndex + 2);

  const indexOf = (name: string) => headers.indexOf(name);

  const siteNoIndex = indexOf("site_no");
  const nameIndex = indexOf("station_nm");
  const latIndex = indexOf("dec_lat_va");
  const lngIndex = indexOf("dec_long_va");
  const agencyIndex = indexOf("agency_cd");

  return dataLines
    .map((line) => {
      const cols = line.split("\t");
      const id = String(cols[siteNoIndex] ?? "").trim();
      const name = String(cols[nameIndex] ?? "").trim();
      const lat = Number(cols[latIndex]);
      const lng = Number(cols[lngIndex]);
      const agency = String(cols[agencyIndex] ?? "USGS").trim() || "USGS";

      if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng))
        return null;

      return {
        id,
        name,
        lat,
        lng,
        agency,
        distanceMiles: haversineMiles(originLat, originLng, lat, lng),
        flowCfs: null,
        stageFt: null,
        flowSeries: [],
        stageSeries: [],
        url: `https://waterdata.usgs.gov/monitoring-location/${id}/`,
      } satisfies FlowGage;
    })
    .filter(Boolean) as FlowGage[];
}

function formatFlowNumber(value: number | null | undefined, suffix: string) {
  if (!Number.isFinite(Number(value))) return "Not reported";

  const rounded =
    Math.abs(Number(value)) >= 100
      ? Math.round(Number(value)).toLocaleString()
      : Number(value).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        });

  return `${rounded} ${suffix}`;
}

function formatObservedTime(value: string | undefined) {
  if (!value) return "Latest reading";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Latest reading";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getUsgsVariableCode(item: any): string {
  const rawCodes = item?.variable?.variableCode;
  if (Array.isArray(rawCodes)) {
    return String(rawCodes[0]?.value ?? rawCodes[0] ?? "").trim();
  }
  return String(rawCodes?.value ?? rawCodes ?? "").trim();
}

function parseUsgsTimeSeriesValues(item: any): FlowHydroPoint[] {
  const valueBlocks = Array.isArray(item?.values) ? item.values : [];
  const rawValues = valueBlocks.flatMap((block: any) =>
    Array.isArray(block?.value) ? block.value : [],
  );

  const points = rawValues
    .map((reading: any) => {
      const value = Number(reading?.value);
      const time = String(reading?.dateTime ?? "");
      if (!Number.isFinite(value) || !time) return null;
      return { time, value } satisfies FlowHydroPoint;
    })
    .filter(Boolean) as FlowHydroPoint[];

  const seen = new Set<string>();
  return points
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    .filter((point) => {
      const key = `${point.time}|${point.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function fetchUsgsIvSeries(siteId: string, days = 7) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - days);

  const url = new URL("https://waterservices.usgs.gov/nwis/iv/");
  url.searchParams.set("format", "json");
  url.searchParams.set("sites", siteId);
  url.searchParams.set("parameterCd", "00060,00065");
  url.searchParams.set("siteStatus", "all");
  url.searchParams.set("startDT", start.toISOString());
  url.searchParams.set("endDT", end.toISOString());

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok)
    throw new Error(`USGS hydrograph request failed (${response.status}).`);

  const data = await response.json();
  const series = Array.isArray(data?.value?.timeSeries)
    ? data.value.timeSeries
    : [];

  const result: Pick<
    FlowGage,
    "flowCfs" | "stageFt" | "flowSeries" | "stageSeries" | "observedAt"
  > = {
    flowCfs: null,
    stageFt: null,
    flowSeries: [],
    stageSeries: [],
    observedAt: undefined,
  };

  series.forEach((item: any) => {
    const variableCode = getUsgsVariableCode(item);
    const parsedSeries = parseUsgsTimeSeriesValues(item);
    const latest = parsedSeries[parsedSeries.length - 1];
    if (!latest) return;

    if (variableCode === "00060") {
      result.flowCfs = latest.value;
      result.flowSeries = parsedSeries;
      result.observedAt = latest.time || result.observedAt;
    }

    if (variableCode === "00065") {
      result.stageFt = latest.value;
      result.stageSeries = parsedSeries;
      result.observedAt = latest.time || result.observedAt;
    }
  });

  return result;
}

async function fetchNearestUsgsFlowGage(
  lat: number,
  lng: number,
): Promise<FlowGage | null> {
  const searchRadii = [0.25, 0.5, 1, 2, 4, 8, 15, 30];

  for (const radius of searchRadii) {
    const url = new URL("https://waterservices.usgs.gov/nwis/site/");
    url.searchParams.set("format", "rdb");
    url.searchParams.set(
      "bBox",
      `${(lng - radius).toFixed(4)},${(lat - radius).toFixed(4)},${(lng + radius).toFixed(4)},${(lat + radius).toFixed(4)}`,
    );
    url.searchParams.set("siteType", "ST");
    url.searchParams.set("siteStatus", "active");
    url.searchParams.set("hasDataTypeCd", "iv");
    url.searchParams.set("parameterCd", "00060,00065");

    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) continue;

    const sites = parseUsgsRdbSites(await response.text(), lat, lng)
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, 8);

    for (const candidate of sites) {
      try {
        const values = await fetchUsgsIvSeries(candidate.id, 7);
        candidate.flowCfs = values.flowCfs ?? null;
        candidate.stageFt = values.stageFt ?? null;
        candidate.flowSeries = values.flowSeries ?? [];
        candidate.stageSeries = values.stageSeries ?? [];
        candidate.observedAt = values.observedAt;

        if (
          (candidate.flowSeries?.length ?? 0) >= 2 ||
          (candidate.stageSeries?.length ?? 0) >= 2
        ) {
          return candidate;
        }
      } catch (error) {
        console.warn(
          `Unable to load USGS hydrograph for ${candidate.id}:`,
          error,
        );
      }
    }

    if (sites.length > 0) {
      return sites[0];
    }
  }

  return null;
}

function TideChart({ predictions }: { predictions: TidePrediction[] }) {
  if (predictions.length < 2) {
    return (
      <div className="home-tide-empty">
        No tide predictions available for this location.
      </div>
    );
  }

  const width = 920;
  const height = 250;
  const paddingLeft = 74;
  const paddingRight = 24;
  const paddingTop = 30;
  const paddingBottom = 46;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const values = predictions.map((item) => item.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(rawMax - rawMin, 0.1);
  const pad = Math.max(spread * 0.12, 0.08);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const scaledSpread = Math.max(max - min, 0.1);

  const points = predictions.map((item, index) => {
    const x =
      paddingLeft + (index / Math.max(predictions.length - 1, 1)) * plotWidth;
    const y = paddingTop + ((max - item.value) / scaledSpread) * plotHeight;
    return { ...item, x, y };
  });

  const controlPoint = (
    current: (typeof points)[number],
    previous: (typeof points)[number],
    next: (typeof points)[number],
    reverse = false,
  ) => {
    const smoothing = 0.16;
    const opposedLineLength = Math.hypot(
      next.x - previous.x,
      next.y - previous.y,
    );
    const opposedLineAngle = Math.atan2(
      next.y - previous.y,
      next.x - previous.x,
    );
    const angle = opposedLineAngle + (reverse ? Math.PI : 0);
    const length = opposedLineLength * smoothing;

    return {
      x: current.x + Math.cos(angle) * length,
      y: current.y + Math.sin(angle) * length,
    };
  };

  const smoothLinePath = points.reduce((path, point, index, allPoints) => {
    if (index === 0) {
      return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    }

    const previous = allPoints[index - 1];
    const previousPrevious = allPoints[index - 2] || previous;
    const next = allPoints[index + 1] || point;
    const startControl = controlPoint(previous, previousPrevious, point);
    const endControl = controlPoint(point, previous, next, true);

    return `${path} C ${startControl.x.toFixed(1)} ${startControl.y.toFixed(1)}, ${endControl.x.toFixed(1)} ${endControl.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, "");

  const baselineY = height - paddingBottom;
  const areaPath = `${smoothLinePath} L ${points[points.length - 1].x.toFixed(1)} ${baselineY} L ${points[0].x.toFixed(1)} ${baselineY} Z`;

  const extrema = points
    .map((point, index, allPoints) => {
      if (index === 0 || index === allPoints.length - 1) return null;
      const previous = allPoints[index - 1];
      const next = allPoints[index + 1];
      if (point.value >= previous.value && point.value >= next.value)
        return { ...point, kind: "High" as const };
      if (point.value <= previous.value && point.value <= next.value)
        return { ...point, kind: "Low" as const };
      return null;
    })
    .filter(Boolean)
    .slice(0, 4) as Array<(typeof points)[number] & { kind: "High" | "Low" }>;

  const tickPoints = [
    points[0],
    points[Math.floor(points.length / 2)],
    points[points.length - 1],
  ].filter(Boolean);
  const gridValues = Array.from(
    { length: 5 },
    (_, index) => min + (scaledSpread * index) / 4,
  ).reverse();

  const formatTime = (time: string) =>
    new Date(time).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  const formatTickTime = (time: string) =>
    new Date(time).toLocaleTimeString([], { hour: "numeric" });

  return (
    <svg
      className="home-tide-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="24 hour tide prediction chart"
    >
      <defs>
        <linearGradient id="vadmaTideArea" x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="0%"
            stopColor="var(--vadma-cc-water)"
            stopOpacity="0.28"
          />
          <stop
            offset="100%"
            stopColor="var(--vadma-cc-water)"
            stopOpacity="0.02"
          />
        </linearGradient>
        <linearGradient id="vadmaTideLine" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="var(--vadma-cc-water-soft)" />
          <stop offset="52%" stopColor="var(--vadma-cc-water)" />
          <stop offset="100%" stopColor="var(--vadma-cc-accent)" />
        </linearGradient>
      </defs>

      <rect
        x={paddingLeft}
        y={paddingTop}
        width={plotWidth}
        height={plotHeight}
        rx="10"
        className="home-tide-plot-bg"
      />

      {gridValues.map((value) => {
        const y = paddingTop + ((max - value) / scaledSpread) * plotHeight;
        return (
          <g key={`tide-grid-${value.toFixed(3)}`}>
            <line
              x1={paddingLeft}
              x2={width - paddingRight}
              y1={y}
              y2={y}
              className="home-tide-grid-line"
            />
            <text
              x={paddingLeft - 12}
              y={y + 4}
              textAnchor="end"
              className="home-tide-axis-label"
            >
              {value.toFixed(1)} ft
            </text>
          </g>
        );
      })}

      <line
        x1={paddingLeft}
        x2={width - paddingRight}
        y1={baselineY}
        y2={baselineY}
        className="home-tide-axis"
      />
      <path d={areaPath} className="home-tide-area" />
      <path d={smoothLinePath} className="home-tide-line" />

      {extrema.map((point, index) => {
        const isHigh = point.kind === "High";
        const labelY = isHigh
          ? Math.max(paddingTop + 15, point.y - 12)
          : Math.min(baselineY - 18, point.y + 24);
        const labelX = Math.min(
          Math.max(point.x, paddingLeft + 46),
          width - paddingRight - 46,
        );
        const anchor =
          labelX < point.x - 2
            ? "end"
            : labelX > point.x + 2
              ? "start"
              : "middle";
        return (
          <g
            key={`${point.kind}-${point.time}-${index}`}
            className={isHigh ? "home-tide-peak high" : "home-tide-peak low"}
          >
            <line
              x1={point.x}
              x2={point.x}
              y1={point.y}
              y2={labelY - 5}
              className="home-tide-peak-leader"
            />
            <circle cx={point.x} cy={point.y} r="3.7" />
            <text
              x={labelX}
              y={labelY}
              textAnchor={anchor}
              className="home-tide-peak-label"
            >
              {point.kind} {formatTime(point.time)}
            </text>
            <text
              x={labelX}
              y={labelY + 11}
              textAnchor={anchor}
              className="home-tide-peak-value"
            >
              {point.value.toFixed(1)} ft
            </text>
          </g>
        );
      })}

      {tickPoints.map((point, index) => (
        <text
          key={`${point.time}-tick-${index}`}
          x={point.x}
          y={height - 15}
          textAnchor={
            index === 0
              ? "start"
              : index === tickPoints.length - 1
                ? "end"
                : "middle"
          }
          className="home-tide-tick"
        >
          {formatTickTime(point.time)}
        </text>
      ))}
    </svg>
  );
}

function FlowHydrograph({
  points,
  unit,
  label,
}: {
  points: FlowHydroPoint[];
  unit: string;
  label: string;
}) {
  if (!points || points.length < 2) {
    return null;
  }

  // Keep this SVG simple and fixed-height. The previous versions used a very wide
  // scrollable SVG, which made the actual line look like a tiny black strip.
  const width = 1000;
  const height = 250;
  const paddingLeft = unit === "cfs" ? 86 : 76;
  const paddingRight = 30;
  const paddingTop = 24;
  const paddingBottom = 44;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const values = points
    .map((point) => point.value)
    .filter((value) => Number.isFinite(value));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const latestRaw = points[points.length - 1];

  // A single bad USGS spike can flatten the whole hydrograph. Use the 5th/95th
  // percentile for the drawn scale, while still reporting the true min/max below.
  const sortedValues = [...values].sort((a, b) => a - b);
  const percentile = (fraction: number) => {
    const index = Math.min(
      sortedValues.length - 1,
      Math.max(0, Math.round((sortedValues.length - 1) * fraction)),
    );
    return sortedValues[index];
  };

  let scaleMin = percentile(0.05);
  let scaleMax = percentile(0.95);

  if (
    !Number.isFinite(scaleMin) ||
    !Number.isFinite(scaleMax) ||
    scaleMin === scaleMax
  ) {
    scaleMin = rawMin;
    scaleMax = rawMax;
  }

  const minimumRange =
    unit === "ft" ? 0.12 : Math.max(1, Math.abs(scaleMax) * 0.015);
  const range = Math.max(scaleMax - scaleMin, minimumRange);
  const paddedMin = Math.max(0, scaleMin - range * 0.18);
  const paddedMax = scaleMax + range * 0.18;
  const paddedRange = Math.max(paddedMax - paddedMin, minimumRange);

  const clampForScale = (value: number) =>
    Math.min(paddedMax, Math.max(paddedMin, value));
  const xFor = (index: number) =>
    paddingLeft + (index / Math.max(points.length - 1, 1)) * chartWidth;
  const yFor = (value: number) =>
    paddingTop +
    ((paddedMax - clampForScale(value)) / paddedRange) * chartHeight;

  const chartPoints = points.map((point, index) => ({
    ...point,
    x: xFor(index),
    y: yFor(point.value),
  }));

  const linePath = chartPoints
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
    )
    .join(" ");

  const chartBottom = height - paddingBottom;
  const chartTop = paddingTop;
  const chartRight = width - paddingRight;
  const areaPath = `${linePath} L${chartPoints[chartPoints.length - 1].x.toFixed(1)},${chartBottom.toFixed(1)} L${chartPoints[0].x.toFixed(1)},${chartBottom.toFixed(1)} Z`;

  const valueTicks = [0, 0.25, 0.5, 0.75, 1].map(
    (fraction) => paddedMin + fraction * paddedRange,
  );
  const tickIndexes = [0, 0.25, 0.5, 0.75, 1]
    .map((fraction) => Math.round(fraction * (points.length - 1)))
    .filter(
      (index, position, array) =>
        index >= 0 && array.indexOf(index) === position,
    );

  const latest = chartPoints[chartPoints.length - 1];
  const axisLabel = unit === "cfs" ? "Discharge (cfs)" : "Gage height (ft)";
  const gradientId =
    unit === "cfs" ? "vadmaFlowDischargeLine" : "vadmaFlowStageLine";
  const areaId =
    unit === "cfs" ? "vadmaFlowDischargeArea" : "vadmaFlowStageArea";

  return (
    <div className="home-flow-hydrograph-wrap">
      <div className="home-flow-hydrograph-title">
        <div>
          <strong>{label}</strong>
          <em>{axisLabel} over the last 72 hours</em>
        </div>
        <span>Latest: {formatFlowNumber(latestRaw.value, unit)}</span>
      </div>

      <svg
        className="home-flow-hydrograph"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label} hydrograph`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--vadma-cc-water-soft)" />
            <stop offset="55%" stopColor="var(--vadma-cc-water)" />
            <stop offset="100%" stopColor="var(--vadma-cc-accent-soft)" />
          </linearGradient>
          <linearGradient id={areaId} x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--vadma-cc-water-soft)"
              stopOpacity="0.28"
            />
            <stop
              offset="100%"
              stopColor="var(--vadma-cc-water)"
              stopOpacity="0.02"
            />
          </linearGradient>
        </defs>

        <rect
          className="home-flow-plot-bg"
          x={paddingLeft}
          y={chartTop}
          width={chartRight - paddingLeft}
          height={chartBottom - chartTop}
          rx="12"
        />

        {valueTicks.map((value, index) => {
          const y = yFor(value);
          return (
            <g key={`${label}-value-${index}`}>
              <line
                className="home-flow-grid-line"
                x1={paddingLeft}
                x2={chartRight}
                y1={y}
                y2={y}
              />
              <text
                className="home-flow-value-label"
                x={paddingLeft - 12}
                y={y + 4}
                textAnchor="end"
              >
                {formatCompactFlowValue(value, unit)}
              </text>
            </g>
          );
        })}

        {tickIndexes.map((index) => {
          const point = chartPoints[index];
          return (
            <g key={`${point.time}-${label}-tick`}>
              <line
                className="home-flow-time-grid"
                x1={point.x}
                x2={point.x}
                y1={chartTop}
                y2={chartBottom}
              />
              <text
                x={point.x}
                y={height - 15}
                textAnchor={
                  index === 0
                    ? "start"
                    : index === points.length - 1
                      ? "end"
                      : "middle"
                }
                className="home-flow-time-tick"
              >
                {new Date(point.time).toLocaleString([], {
                  weekday: "short",
                  hour: "numeric",
                })}
              </text>
            </g>
          );
        })}

        <line
          className="home-flow-axis-line"
          x1={paddingLeft}
          x2={chartRight}
          y1={chartBottom}
          y2={chartBottom}
        />
        <line
          className="home-flow-axis-line"
          x1={paddingLeft}
          x2={paddingLeft}
          y1={chartTop}
          y2={chartBottom}
        />
        <path
          className="home-flow-area"
          d={areaPath}
          fill={`url(#${areaId})`}
        />
        <path
          className="home-flow-line"
          d={linePath}
          stroke={`url(#${gradientId})`}
        />
        <circle
          className="home-flow-latest-dot"
          cx={latest.x}
          cy={latest.y}
          r="5"
        />
        <text className="home-flow-axis-title" x={paddingLeft} y="15">
          {axisLabel}
        </text>
      </svg>

      <div className="home-flow-hydrograph-stats">
        <span>Min {formatFlowNumber(rawMin, unit)}</span>
        <span>Max {formatFlowNumber(rawMax, unit)}</span>
        <span>Latest {formatFlowNumber(latestRaw.value, unit)}</span>
      </div>
    </div>
  );
}

function formatCompactFlowValue(value: number, unit?: string) {
  const formatted =
    Math.abs(value) >= 1000
      ? `${Math.round(value / 100) / 10}k`
      : Math.abs(value) >= 100
        ? `${Math.round(value)}`
        : value.toLocaleString(undefined, {
            maximumFractionDigits: unit === "ft" ? 2 : 1,
          });
  return unit ? `${formatted} ${unit}` : formatted;
}

function FlowGagePanel({
  loading,
  gage,
  error,
}: {
  loading: boolean;
  gage: FlowGage | null;
  error: string;
}) {
  return (
    <div className="home-flow-gage-panel">
      <div className="home-flow-gage-header">
        <strong>
          {loading ? "Loading nearest flow gage..." : "Nearest flow gage"}
        </strong>
        <span>
          {error ||
            "USGS streamflow/stage gage nearest the selected site or map click."}
        </span>
      </div>

      {gage ? (
        <div className="home-flow-gage-card">
          <div className="home-flow-gage-main">
            <strong>{gage.name}</strong>
            <span>
              {gage.agency || "USGS"} {gage.id} •{" "}
              {gage.distanceMiles.toFixed(1)} miles away •{" "}
              {formatObservedTime(gage.observedAt)}
            </span>
          </div>

          <div className="home-flow-gage-values">
            <div>
              <strong>{formatFlowNumber(gage.flowCfs, "cfs")}</strong>
              <span>Discharge</span>
            </div>
            <div>
              <strong>{formatFlowNumber(gage.stageFt, "ft")}</strong>
              <span>Gage height</span>
            </div>
          </div>

          <div className="home-flow-hydrographs">
            {gage.flowSeries && gage.flowSeries.length >= 2 ? (
              <FlowHydrograph
                points={gage.flowSeries}
                unit="cfs"
                label="Discharge hydrograph"
              />
            ) : null}
            {gage.stageSeries && gage.stageSeries.length >= 2 ? (
              <FlowHydrograph
                points={gage.stageSeries}
                unit="ft"
                label="Gage height hydrograph"
              />
            ) : null}
            {(!gage.flowSeries || gage.flowSeries.length < 2) &&
            (!gage.stageSeries || gage.stageSeries.length < 2) ? (
              <div className="home-flow-hydrograph-empty">
                No recent hydrograph values were returned for this gage.
              </div>
            ) : null}
          </div>

          <a
            className="home-flow-gage-link"
            href={gage.url}
            target="_blank"
            rel="noreferrer"
          >
            Open USGS gage
          </a>
        </div>
      ) : (
        <div className="home-flow-gage-empty">
          {loading
            ? "Searching nearby active USGS gages..."
            : error || "No nearby active USGS flow gage found."}
        </div>
      )}
    </div>
  );
}

function HourlyForecastChart({ points }: { points: HourlyForecastPoint[] }) {
  if (points.length < 2) {
    return null;
  }

  const width = Math.max(740, points.length * 28);
  const height = 250;
  const paddingLeft = 54;
  const paddingRight = 28;
  const paddingTop = 28;
  const chartWidth = width - paddingLeft - paddingRight;
  const tempHeight = 78;
  const windTop = 142;
  const windHeight = 62;

  const temps = points.map((point) => point.temperature);
  const winds = points
    .map((point) => point.windMph)
    .filter((value): value is number => Number.isFinite(Number(value)));

  const minTemp = Math.floor((Math.min(...temps) - 2) / 5) * 5;
  const maxTemp = Math.ceil((Math.max(...temps) + 2) / 5) * 5;
  const tempSpread = Math.max(maxTemp - minTemp, 1);
  const maxWind = Math.max(10, Math.ceil(Math.max(...winds, 0) / 5) * 5);

  const tempTicks = [maxTemp, Math.round((maxTemp + minTemp) / 2), minTemp];
  const windTicks = [maxWind, Math.round(maxWind / 2), 0];

  const plotted = points.map((point, index) => {
    const x =
      paddingLeft + (index / Math.max(points.length - 1, 1)) * chartWidth;

    const tempY =
      paddingTop + ((maxTemp - point.temperature) / tempSpread) * tempHeight;

    const windY =
      windTop +
      ((maxWind - (point.windMph ?? 0)) / Math.max(maxWind, 1)) * windHeight;

    return {
      ...point,
      x,
      tempY,
      windY,
    };
  });

  const tempPath = plotted
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.tempY.toFixed(1)}`,
    )
    .join(" ");

  const windPath = plotted
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.windY.toFixed(1)}`,
    )
    .join(" ");

  const tickEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div className="home-hourly-forecast-wrap">
      <div className="home-hourly-forecast-meta">
        <strong>48-hour weather graph</strong>
        <span>{points.length} hourly points loaded</span>
      </div>
      <svg
        className="home-hourly-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="48-hour temperature, wind speed, and wind direction forecast graph"
      >
        <defs>
          <linearGradient id="vadmaHourlyTemp" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--vadma-cc-accent)" />
            <stop offset="100%" stopColor="var(--vadma-cc-accent-soft)" />
          </linearGradient>
          <linearGradient id="vadmaHourlyWind" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--vadma-cc-water-soft)" />
            <stop offset="100%" stopColor="var(--vadma-cc-success)" />
          </linearGradient>
        </defs>

        <text x={paddingLeft} y="16" className="home-hourly-section-label">
          Temperature
        </text>
        <text
          x={paddingLeft}
          y={windTop - 16}
          className="home-hourly-section-label"
        >
          Wind speed / direction
        </text>

        {tempTicks.map((tick) => {
          const y = paddingTop + ((maxTemp - tick) / tempSpread) * tempHeight;
          return (
            <g key={`temp-${tick}`}>
              <line
                x1={paddingLeft}
                x2={width - paddingRight}
                y1={y}
                y2={y}
                className="home-hourly-grid-line"
              />
              <text
                x={paddingLeft - 10}
                y={y + 4}
                textAnchor="end"
                className="home-hourly-axis-label"
              >
                {tick}°
              </text>
            </g>
          );
        })}

        {windTicks.map((tick) => {
          const y =
            windTop + ((maxWind - tick) / Math.max(maxWind, 1)) * windHeight;
          return (
            <g key={`wind-${tick}`}>
              <line
                x1={paddingLeft}
                x2={width - paddingRight}
                y1={y}
                y2={y}
                className="home-hourly-grid-line"
              />
              <text
                x={paddingLeft - 10}
                y={y + 4}
                textAnchor="end"
                className="home-hourly-axis-label"
              >
                {tick} mph
              </text>
            </g>
          );
        })}

        <path d={tempPath} className="home-hourly-temp-line" />
        <path d={windPath} className="home-hourly-wind-line" />

        {plotted.map((point, index) =>
          index % tickEvery === 0 ? (
            <g key={`${point.time}-${index}`}>
              <circle
                cx={point.x}
                cy={point.tempY}
                r="3.5"
                className="home-hourly-temp-dot"
              />
              <circle
                cx={point.x}
                cy={point.windY}
                r="3.5"
                className="home-hourly-wind-dot"
              />
              <text
                x={point.x}
                y={height - 12}
                textAnchor="middle"
                className="home-hourly-tick"
              >
                {new Date(point.time).toLocaleTimeString([], {
                  hour: "numeric",
                })}
              </text>
              <text
                x={point.x}
                y={windTop + windHeight + 20}
                textAnchor="middle"
                className="home-hourly-wind-direction"
              >
                {windArrowSymbol(point.windDirection)} {point.windDirection}
              </text>
            </g>
          ) : null,
        )}
      </svg>
    </div>
  );
}

function createVadmaMapMarker(L: any, lat: number, lng: number) {
  const icon = L.divIcon({
    className: "vadma-leaflet-pin-icon",
    html: '<span class="vadma-leaflet-pin"></span>',
    iconSize: [28, 38],
    iconAnchor: [14, 36],
    popupAnchor: [0, -34],
  });

  return L.marker([lat, lng], { icon });
}

type BasemapMode = "dark" | "topo" | "satellite";

export default function CurrentConditions({
  sites,
}: {
  sites: DashboardSite[];
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const radarLayerRef = useRef<any>(null);
  const basemapLayerRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const windRequestControllerRef = useRef<AbortController | null>(null);
  const windRequestIdRef = useRef(0);
  const windRefreshTimerRef = useRef<number | null>(null);
  const [mapStatus, setMapStatus] = useState("Radar hidden. Toggle radar to view precipitation.");
  const [siteSearch, setSiteSearch] = useState("");
  const [selectedSiteKey, setSelectedSiteKey] = useState("");
  const [forecastTitle, setForecastTitle] = useState("Forecast");
  const [forecastText, setForecastText] = useState(
    "Click the map or choose a sampling site to pull today's nearest National Weather Service forecast.",
  );
  const [forecastLoading, setForecastLoading] = useState(false);
  const [showWind, setShowWind] = useState(true);
  const [mapReadyToken, setMapReadyToken] = useState(0);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("dark");
  const [showRadar, setShowRadar] = useState(false);
  const [windSpeedMph, setWindSpeedMph] = useState<number | null>(null);
  const [windDirectionDegrees, setWindDirectionDegrees] = useState(225);
  const [windVectors, setWindVectors] = useState<WindVectorPoint[]>([]);
  const [lastPoint, setLastPoint] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);
  const [tideLoading, setTideLoading] = useState(false);
  const [tideTitle, setTideTitle] = useState("Nearest tide station");
  const [tideText, setTideText] = useState(
    "Choose a sampling site or click the map to refresh the nearest 24-hour tide chart.",
  );
  const [tidePredictions, setTidePredictions] = useState<TidePrediction[]>([]);
  const [tideStations, setTideStations] =
    useState<TideStation[]>(TIDE_STATIONS);
  const [flowLoading, setFlowLoading] = useState(false);
  const [flowGage, setFlowGage] = useState<FlowGage | null>(null);
  const [flowError, setFlowError] = useState(
    "Choose a sampling site or click the map to search for the nearest USGS flow gage.",
  );

  const basemapLabel =
    basemapMode === "dark"
      ? "Carto dark"
      : basemapMode === "topo"
        ? "Topo"
        : "Satellite";

  const nextBasemapMode = () => {
    setBasemapMode((current) =>
      current === "dark" ? "topo" : current === "topo" ? "satellite" : "dark",
    );
  };
  const [hourlyForecast, setHourlyForecast] = useState<HourlyForecastPoint[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;

    loadNoaaTideStations().then((stations) => {
      if (!cancelled && stations.length > 0) {
        setTideStations(stations);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const getBasemapLayer = useCallback(
    (L: any) => {
      if (basemapMode === "topo") {
        return L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
          {
            maxNativeZoom: 19,
            maxZoom: 20,
            minZoom: 3,
            attribution: "ArcGIS topo",
            updateWhenZooming: false,
            keepBuffer: 3,
          },
        );
      }

      if (basemapMode === "satellite") {
        return L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            maxNativeZoom: 19,
            maxZoom: 20,
            minZoom: 3,
            attribution: "Esri World Imagery",
            updateWhenZooming: false,
            keepBuffer: 3,
          },
        );
      }

      return L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          subdomains: "abcd",
          maxNativeZoom: 20,
          maxZoom: 20,
          minZoom: 3,
          attribution: "© CARTO © OpenStreetMap contributors",
          updateWhenZooming: false,
          keepBuffer: 3,
        },
      );
    },
    [basemapMode],
  );


  const requestWindField = useCallback(async () => {
    const map = mapInstanceRef.current;

    if (!map) return;

    const requestId = windRequestIdRef.current + 1;
    windRequestIdRef.current = requestId;

    windRequestControllerRef.current?.abort();
    const controller = new AbortController();
    windRequestControllerRef.current = controller;

    try {
      const bounds = map.getBounds();
      const south = bounds.getSouth();
      const north = bounds.getNorth();
      const west = bounds.getWest();
      const east = bounds.getEast();

      if (![south, north, west, east].every(Number.isFinite)) return;

      const rows = 5;
      const cols = 7;
      const samples: Array<{ lat: number; lng: number; x: number; y: number }> =
        [];

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const y = (row / (rows - 1)) * 100;
          const x = (col / (cols - 1)) * 100;

          samples.push({
            lat: north - (y / 100) * (north - south),
            lng: west + (x / 100) * (east - west),
            x,
            y,
          });
        }
      }

      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set(
        "latitude",
        samples.map((sample) => sample.lat.toFixed(4)).join(","),
      );
      url.searchParams.set(
        "longitude",
        samples.map((sample) => sample.lng.toFixed(4)).join(","),
      );
      url.searchParams.set("current", "wind_speed_10m,wind_direction_10m");
      url.searchParams.set("wind_speed_unit", "mph");
      url.searchParams.set("timezone", "auto");
      url.searchParams.set("forecast_days", "1");

      const response = await fetch(url.toString(), {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Open-Meteo wind grid unavailable.");
      }

      const data = await response.json();

      if (
        controller.signal.aborted ||
        requestId !== windRequestIdRef.current
      ) {
        return;
      }

      const records = Array.isArray(data) ? data : [data];
      const nextVectors = records
        .map((record: any, index: number) => {
          const sample = samples[index];
          const speed = Number(record?.current?.wind_speed_10m);
          const direction = Number(record?.current?.wind_direction_10m);

          if (
            !sample ||
            !Number.isFinite(speed) ||
            !Number.isFinite(direction)
          ) {
            return null;
          }

          return {
            x: sample.x,
            y: sample.y,
            speedMph: speed,
            directionDegrees: direction,
          };
        })
        .filter(Boolean) as WindVectorPoint[];

      if (nextVectors.length > 0) {
        setWindVectors(nextVectors);
      }
    } catch (error) {
      if (controller.signal.aborted) return;

      console.warn("Unable to load gridded wind field:", error);

      if (requestId === windRequestIdRef.current) {
        setWindVectors([]);
      }
    } finally {
      if (windRequestControllerRef.current === controller) {
        windRequestControllerRef.current = null;
      }
    }
  }, []);

  const scheduleWindRefresh = useCallback(
    (delay = 200) => {
      if (!showWind) return;

      if (windRefreshTimerRef.current !== null) {
        window.clearTimeout(windRefreshTimerRef.current);
      }

      windRefreshTimerRef.current = window.setTimeout(() => {
        windRefreshTimerRef.current = null;

        const map = mapInstanceRef.current;
        if (!map) return;

        map.invalidateSize({ animate: false });

        window.requestAnimationFrame(() => {
          void requestWindField();
        });
      }, delay);
    },
    [requestWindField, showWind],
  );

  const matchingSites = useMemo(() => {
    const query = siteSearch.trim();

    if (!query) {
      return sites.slice(0, 12);
    }

    return sites
      .map((site) => ({
        site,
        score: fuzzySiteScore(site, query),
      }))
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.site.waterbody.localeCompare(b.site.waterbody) ||
          a.site.siteID.localeCompare(b.site.siteID),
      )
      .slice(0, 12)
      .map((item) => item.site);
  }, [siteSearch, sites]);

  const requestTides = useCallback(
    async (lat: number, lng: number, label = "Selected location") => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);

      try {
        setTideLoading(true);
        setTideTitle("Nearest tide station");
        setTideText(`Searching NOAA tide prediction stations near ${label}...`);

        const stationsForSearch = tideStations.length
          ? tideStations
          : await loadNoaaTideStations();
        const mergedStations = new Map<string, TideStation>();
        [...stationsForSearch, ...TIDE_STATIONS].forEach((station) =>
          mergedStations.set(station.id, station),
        );
        const sortedStations = [...mergedStations.values()]
          .map((station) => tideStationScore(station, lat, lng, label))
          .sort(
            (a, b) =>
              a.score - b.score ||
              a.distanceMiles - b.distanceMiles ||
              a.station.name.localeCompare(b.station.name),
          )
          .slice(0, 16);

        if (sortedStations.length === 0) {
          throw new Error("No nearby NOAA tide station was found.");
        }

        let selected: {
          station: TideStation;
          distanceMiles: number;
        } | null = null;
        let predictions: TidePrediction[] = [];

        for (const candidate of sortedStations) {
          const url = new URL(
            "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter",
          );
          url.searchParams.set("product", "predictions");
          url.searchParams.set("application", "VADMA");
          url.searchParams.set("begin_date", formatNoaaDate(now));
          url.searchParams.set("end_date", formatNoaaDate(tomorrow));
          url.searchParams.set("station", candidate.station.id);
          url.searchParams.set("time_zone", "lst_ldt");
          url.searchParams.set("units", "english");
          url.searchParams.set("format", "json");

          const tryPredictionRequest = async (
            interval: "dense" | "h" | "hilo",
            useDatum: boolean,
          ) => {
            const candidateUrl = new URL(url.toString());

            /*
              NOAA subordinate prediction stations commonly reject datum=MLLW,
              especially when interval=hilo. Keep datum optional and retry without
              it before moving on to the next nearby station.
            */
            if (useDatum) {
              candidateUrl.searchParams.set("datum", "MLLW");
            } else {
              candidateUrl.searchParams.delete("datum");
            }

            if (interval === "h") {
              candidateUrl.searchParams.set("interval", "h");
            } else if (interval === "hilo") {
              candidateUrl.searchParams.set("interval", "hilo");
              candidateUrl.searchParams.delete("datum");
            }

            try {
              const response = await fetch(candidateUrl.toString(), {
                cache: "no-store",
              });

              if (!response.ok) {
                console.warn(
                  "NOAA tide request failed",
                  candidate.station.id,
                  candidate.station.name,
                  interval,
                  useDatum ? "with datum" : "without datum",
                  response.status,
                );
                return [];
              }

              const data = await response.json();

              if (data?.error?.message) {
                console.warn(
                  "NOAA tide station returned no prediction data",
                  candidate.station.id,
                  candidate.station.name,
                  data.error.message,
                );
                return [];
              }

              return (data?.predictions ?? [])
                .map((item: any) => ({
                  time: String(item.t),
                  value: Number(item.v),
                  kind: typeof item.type === "string" ? item.type : undefined,
                }))
                .filter(
                  (item: TidePrediction) =>
                    item.time && Number.isFinite(item.value),
                )
                .slice(0, interval === "dense" ? 240 : 48);
            } catch (error) {
              console.warn(
                "NOAA tide request threw",
                candidate.station.id,
                candidate.station.name,
                error,
              );
              return [];
            }
          };

          let candidatePredictions = await tryPredictionRequest("dense", true);

          if (candidatePredictions.length < 2) {
            candidatePredictions = await tryPredictionRequest("dense", false);
          }

          if (candidatePredictions.length < 2) {
            candidatePredictions = await tryPredictionRequest("h", true);
          }

          if (candidatePredictions.length < 2) {
            candidatePredictions = await tryPredictionRequest("h", false);
          }

          if (candidatePredictions.length < 2) {
            candidatePredictions = await tryPredictionRequest("hilo", false);
          }

          if (candidatePredictions.length >= 2) {
            selected = candidate;
            predictions = candidatePredictions;
            break;
          }
        }

        if (!selected || predictions.length < 2) {
          throw new Error(
            "No tide predictions were returned for the nearest NOAA stations.",
          );
        }

        setTidePredictions(predictions);
        setTideTitle(selected.station.name);
        setTideText(
          `Nearest NOAA tide station with predictions, ${selected.distanceMiles.toFixed(1)} miles from ${label}.`,
        );
      } catch (error) {
        console.warn("Unable to fetch tide predictions:", error);
        setTideTitle("Tides unavailable");
        setTideText(
          error instanceof Error
            ? error.message
            : "Unable to load tide predictions for this location.",
        );
        setTidePredictions([]);
      } finally {
        setTideLoading(false);
      }
    },
    [tideStations],
  );

  const requestFlowGage = useCallback(
    async (lat: number, lng: number, label = "Selected location") => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setFlowGage(null);
        setFlowError("That point does not have valid coordinates.");
        return;
      }

      try {
        setFlowLoading(true);
        setFlowError(`Searching active USGS flow gages near ${label}...`);

        const gage = await fetchNearestUsgsFlowGage(lat, lng);

        if (!gage) {
          setFlowGage(null);
          setFlowError(
            "No active USGS streamflow or stage gage was found nearby.",
          );
          return;
        }

        setFlowGage(gage);
        setFlowError("");
      } catch (error) {
        console.warn("Unable to fetch nearest flow gage:", error);
        setFlowGage(null);
        setFlowError(
          error instanceof Error
            ? error.message
            : "Unable to load the nearest USGS flow gage.",
        );
      } finally {
        setFlowLoading(false);
      }
    },
    [],
  );

  const requestForecast = useCallback(
    async (lat: number, lng: number, label = "Selected location") => {
      const normalizedLat = Number(lat);
      const normalizedLng = Number(lng);

      if (!Number.isFinite(normalizedLat) || !Number.isFinite(normalizedLng)) {
        setForecastTitle("Forecast unavailable");
        setForecastText("That point does not have valid coordinates.");
        return;
      }

      setLastPoint({ lat: normalizedLat, lng: normalizedLng, label });

      void requestTides(normalizedLat, normalizedLng, label);
      void requestFlowGage(normalizedLat, normalizedLng, label);

      try {
        setForecastLoading(true);
        setForecastTitle(label);
        setForecastText("Loading forecast...");

        const pointResponse = await fetch(
          `https://api.weather.gov/points/${normalizedLat.toFixed(4)},${normalizedLng.toFixed(4)}`,
          {
            headers: {
              Accept: "application/geo+json, application/json",
            },
          },
        );

        if (!pointResponse.ok) {
          throw new Error(
            "The National Weather Service could not resolve that point.",
          );
        }

        const pointData = await pointResponse.json();
        const forecastUrl = pointData?.properties?.forecast;
        const forecastHourlyUrl = pointData?.properties?.forecastHourly;
        const city = pointData?.properties?.relativeLocation?.properties?.city;
        const state =
          pointData?.properties?.relativeLocation?.properties?.state;

        if (!forecastUrl) {
          throw new Error("No forecast endpoint was available for that point.");
        }

        const forecastResponse = await fetch(forecastUrl, {
          headers: {
            Accept: "application/geo+json, application/json",
          },
        });

        if (!forecastResponse.ok) {
          throw new Error("Forecast request failed.");
        }

        const forecastData = await forecastResponse.json();
        const periods = forecastData?.properties?.periods ?? [];
        const firstPeriod = periods[0];
        const secondPeriod = periods[1];

        if (!firstPeriod) {
          throw new Error("No forecast period was returned.");
        }

        setWindSpeedMph(parseWindSpeedMph(firstPeriod.windSpeed));
        setWindDirectionDegrees(
          windDirectionToDegrees(firstPeriod.windDirection),
        );

        const place = city && state ? `${city}, ${state}` : label;
        const tonight = secondPeriod
          ? ` ${secondPeriod.name}: ${secondPeriod.shortForecast}, ${secondPeriod.temperature}°${secondPeriod.temperatureUnit}.`
          : "";

        if (forecastHourlyUrl) {
          const hourlyResponse = await fetch(forecastHourlyUrl, {
            headers: {
              Accept: "application/geo+json, application/json",
            },
          });

          if (hourlyResponse.ok) {
            const hourlyData = await hourlyResponse.json();
            const hourlyPeriods = hourlyData?.properties?.periods ?? [];

            setHourlyForecast(
              hourlyPeriods
                .slice(0, 48)
                .map((period: any) => ({
                  time: String(period.startTime),
                  temperature: Number(period.temperature),
                  windMph: parseWindSpeedMph(period.windSpeed),
                  windDirection: String(period.windDirection ?? ""),
                  windDegrees: windDirectionToDegrees(period.windDirection),
                }))
                .filter(
                  (period: HourlyForecastPoint) =>
                    period.time && Number.isFinite(period.temperature),
                ),
            );
          }
        }

        setForecastTitle(place);
        setForecastText(
          `${firstPeriod.name}: ${firstPeriod.shortForecast}. ${firstPeriod.temperature}°${firstPeriod.temperatureUnit}. Wind ${firstPeriod.windSpeed} ${firstPeriod.windDirection}.${tonight}`,
        );

        scheduleWindRefresh(0);
      } catch (error) {
        console.warn("Unable to fetch point forecast:", error);
        setForecastTitle("Forecast unavailable");
        setHourlyForecast([]);
        setForecastText(
          error instanceof Error
            ? error.message
            : "Unable to load the forecast for that point.",
        );
      } finally {
        setForecastLoading(false);
      }
    },
    [requestFlowGage, requestTides, scheduleWindRefresh],
  );

  useEffect(() => {
    let cancelled = false;

    const ensureLeaflet = async () => {
      const win = window as any;

      if (win.L) return win.L;

      if (!document.querySelector('link[data-vadma-leaflet="true"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.dataset.vadmaLeaflet = "true";
        document.head.appendChild(link);
      }

      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(
          'script[data-vadma-leaflet="true"]',
        );

        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener(
            "error",
            () => reject(new Error("Leaflet failed to load.")),
            { once: true },
          );
          return;
        }

        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.async = true;
        script.dataset.vadmaLeaflet = "true";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Leaflet failed to load."));
        document.body.appendChild(script);
      });

      if (!win.L) throw new Error("Leaflet is unavailable.");
      return win.L;
    };

    const buildMap = async () => {
      try {
        const L = await ensureLeaflet();

        if (cancelled || !mapRef.current) return;

        if (!mapInstanceRef.current) {
          const map = L.map(mapRef.current, {
            zoomControl: false,
            attributionControl: false,
          }).setView([37.7, -78.3], 7);

          L.control.zoom({ position: "bottomright" }).addTo(map);

          basemapLayerRef.current = getBasemapLayer(L).addTo(map);

          map.on("click", (event: any) => {
            const { lat, lng } = event.latlng;

            if (markerRef.current) {
              markerRef.current.remove();
            }

            markerRef.current = createVadmaMapMarker(L, lat, lng).addTo(map);
            void requestForecast(lat, lng, "Selected map point");
          });

          mapInstanceRef.current = map;

          map.whenReady(() => {
            const finalizeMapLayout = () => {
              if (cancelled || !mapInstanceRef.current) return;
              map.invalidateSize({ animate: false });
              setMapReadyToken((current) => current + 1);
            };

            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(finalizeMapLayout);
            });

            window.setTimeout(finalizeMapLayout, 180);
            window.setTimeout(finalizeMapLayout, 420);
          });
        }

        const response = await fetch(
          "https://api.rainviewer.com/public/weather-maps.json",
          {
            cache: "no-store",
          },
        );

        if (!response.ok) throw new Error("Radar feed unavailable.");

        const radarData = await response.json();
        const radarFrames = radarData?.radar?.past ?? [];
        const latestFrame = radarFrames[radarFrames.length - 1];

        if (!latestFrame?.path)
          throw new Error("No radar frame was available.");

        if (radarLayerRef.current) {
          radarLayerRef.current.remove();
        }

        radarLayerRef.current = L.tileLayer(
          `https://tilecache.rainviewer.com${latestFrame.path}/256/{z}/{x}/{y}/2/1_1.png`,
          {
            opacity: 0.58,
            zIndex: 10,
            maxNativeZoom: 8,
            maxZoom: 10,
            tileSize: 256,
            updateWhenZooming: false,
            keepBuffer: 2,
            errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
          },
        );

        if (showRadar && mapInstanceRef.current.getZoom() <= 10) {
          radarLayerRef.current.addTo(mapInstanceRef.current);
        }

        mapInstanceRef.current.on("zoomend", () => {
          if (!radarLayerRef.current || !mapInstanceRef.current) return;

          const shouldShowRadar = showRadar && mapInstanceRef.current.getZoom() <= 10;
          const hasRadar = mapInstanceRef.current.hasLayer(
            radarLayerRef.current,
          );

          if (shouldShowRadar && !hasRadar) {
            radarLayerRef.current.addTo(mapInstanceRef.current);
          }

          if (!shouldShowRadar && hasRadar) {
            radarLayerRef.current.remove();
          }
        });

        if (!cancelled) {
          const updated = latestFrame.time
            ? new Date(latestFrame.time * 1000).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })
            : "now";

          setMapStatus(showRadar ? `Radar updated ${updated}. Radar hides above zoom 10.` : "Radar hidden. Toggle radar to view precipitation.");
        }
      } catch (error) {
        console.warn("Unable to load current conditions map:", error);

        if (!cancelled) {
          setMapStatus("Radar unavailable");
        }
      }
    };

    buildMap();

    return () => {
      cancelled = true;
    };
  }, [getBasemapLayer, requestForecast, showRadar]);

  useEffect(() => {
    const win = window as any;
    const L = win.L;
    const map = mapInstanceRef.current;

    if (!L || !map) return;

    if (basemapLayerRef.current) {
      basemapLayerRef.current.remove();
    }

    basemapLayerRef.current = getBasemapLayer(L).addTo(map);

    if (radarLayerRef.current) {
      radarLayerRef.current.bringToFront();
    }
  }, [getBasemapLayer]);
  useEffect(() => {
    const map = mapInstanceRef.current;
    const radarLayer = radarLayerRef.current;

    if (!map || !radarLayer) return;

    const hasRadar = map.hasLayer(radarLayer);
    const shouldShowRadar = showRadar && map.getZoom() <= 10;

    if (shouldShowRadar && !hasRadar) {
      radarLayer.addTo(map);
      radarLayer.bringToFront();
    }

    if (!shouldShowRadar && hasRadar) {
      radarLayer.remove();
    }
  }, [showRadar]);



  useEffect(() => {
    const map = mapInstanceRef.current;

    if (!showWind || !map || mapReadyToken === 0) return undefined;

    const refreshAfterInteraction = () => scheduleWindRefresh(200);
    const refreshAfterResize = () => scheduleWindRefresh(260);

    scheduleWindRefresh(0);

    map.on("moveend", refreshAfterInteraction);
    map.on("zoomend", refreshAfterInteraction);
    map.on("resize", refreshAfterResize);
    window.addEventListener("resize", refreshAfterResize);
    window.addEventListener("orientationchange", refreshAfterResize);

    const idleRefreshTimer = window.setInterval(
      () => scheduleWindRefresh(0),
      5 * 60 * 1000,
    );

    return () => {
      map.off("moveend", refreshAfterInteraction);
      map.off("zoomend", refreshAfterInteraction);
      map.off("resize", refreshAfterResize);
      window.removeEventListener("resize", refreshAfterResize);
      window.removeEventListener("orientationchange", refreshAfterResize);
      window.clearInterval(idleRefreshTimer);

      if (windRefreshTimerRef.current !== null) {
        window.clearTimeout(windRefreshTimerRef.current);
        windRefreshTimerRef.current = null;
      }

      windRequestControllerRef.current?.abort();
      windRequestControllerRef.current = null;
    };
  }, [showWind, mapReadyToken, basemapMode, scheduleWindRefresh]);

  function selectSite(site: DashboardSite) {
    setSelectedSiteKey(site.key);
    setSiteSearch(site.label);

    const win = window as any;
    const L = win.L;
    const map = mapInstanceRef.current;

    if (L && map) {
      map.setView([site.lat, site.lng], Math.max(map.getZoom(), 12), {
        animate: true,
      });

      if (markerRef.current) {
        markerRef.current.remove();
      }

      markerRef.current = createVadmaMapMarker(L, site.lat, site.lng).addTo(
        map,
      );
    }

    void requestForecast(site.lat, site.lng, site.label);
  }

  return (
    <div className="home-current-conditions">
      <div className="home-current-toolbar">
        <div className="home-site-search-wrap">
          <label
            className="home-site-search-label"
            htmlFor="home-site-forecast-search"
          >
            Forecast by sampling site
          </label>
          <input
            id="home-site-forecast-search"
            className="home-site-forecast-search"
            value={siteSearch}
            onChange={(event) => {
              setSiteSearch(event.target.value);
              setSelectedSiteKey("");
            }}
            placeholder="Type Boshers, Manchester, City Dock, SiteID, waterbody..."
            aria-label="Search sampling sites for forecast"
          />

          <div className="home-site-search-results">
            {matchingSites.length > 0 ? (
              matchingSites.map((site) => (
                <button
                  type="button"
                  className={
                    site.key === selectedSiteKey
                      ? "home-site-search-result active"
                      : "home-site-search-result"
                  }
                  key={site.key}
                  onClick={() => selectSite(site)}
                >
                  <span className="home-site-search-main">
                    <strong>{site.siteName || site.waterbody}</strong>
                    <em>{site.waterbody}</em>
                  </span>
                  <span className="home-site-search-id">{site.siteID}</span>
                </button>
              ))
            ) : (
              <div className="home-site-search-empty">
                No matching sampling sites
              </div>
            )}
          </div>
        </div>

        <div className="home-condition-buttons">
          <button
            type="button"
            className={
              showWind ? "home-wind-toggle active" : "home-wind-toggle"
            }
            onClick={() =>
              setShowWind((current) => {
                const next = !current;

                if (!next) {
                  windRequestControllerRef.current?.abort();
                  windRequestControllerRef.current = null;

                  if (windRefreshTimerRef.current !== null) {
                    window.clearTimeout(windRefreshTimerRef.current);
                    windRefreshTimerRef.current = null;
                  }
                }

                return next;
              })
            }
            aria-pressed={showWind}
          >
            {showWind ? "Hide wind" : "Show wind"}
            <span>
              {windSpeedMph ? `${windSpeedMph} mph` : "after forecast loads"}
            </span>
          </button>

          <button
            type="button"
            className={
              showRadar ? "home-wind-toggle active" : "home-wind-toggle"
            }
            onClick={() => setShowRadar((current) => !current)}
            aria-pressed={showRadar}
          >
            {showRadar ? "Hide radar" : "Show radar"}
            <span>RainViewer precipitation</span>
          </button>

          <button
            type="button"
            className="home-wind-toggle active"
            onClick={nextBasemapMode}
            aria-label="Change baselayer"
          >
            {basemapLabel} baselayer
            <span>Topo • Carto dark • Satellite</span>
          </button>
        </div>
      </div>

      <div className={`home-current-map-wrap ${basemapMode}-basemap`}>
        <div className="home-current-map" ref={mapRef} />
        <WindOverlay
          enabled={showWind}
          speedMph={windSpeedMph}
          directionDegrees={windDirectionDegrees}
          vectors={windVectors}
        />
        <div className="home-current-map-status">{mapStatus}</div>
      </div>

      <div className="home-forecast-panel">
        <div className="home-forecast-kicker">Today's nearest forecast</div>
        <div className="home-forecast-title">
          {forecastLoading ? "Loading forecast..." : forecastTitle}
        </div>
        <div className="home-forecast-text">{forecastText}</div>
        <HourlyForecastChart points={hourlyForecast} />
      </div>

      <div className="home-tide-panel">
        <button
          type="button"
          className="home-tide-toggle active"
          onClick={() => {
            if (lastPoint) {
              void requestTides(lastPoint.lat, lastPoint.lng, lastPoint.label);
            }
          }}
        >
          Refresh nearest tide chart
        </button>

        <div className="home-tide-content">
          <div className="home-tide-header">
            <strong>{tideLoading ? "Loading tides..." : tideTitle}</strong>
            <span>{tideText}</span>
          </div>
          <TideChart predictions={tidePredictions} />
        </div>
      </div>

      <FlowGagePanel loading={flowLoading} gage={flowGage} error={flowError} />
    </div>
  );
}
