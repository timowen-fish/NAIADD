import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  ZoomControl,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import type { LocationRecord } from "../../types/location";
import { saveCurrentLocation } from "../../services/siteService";
import { readSnapshotRows } from "../../services/snapshotService";

import "../../styles/ExistingSiteStep.css";

type LocationTable = LocationRecord & Record<string, unknown>;

type ExistingSiteStepProps = {
  onBack: () => void;
  onLocationSaved: (locationTable: LocationRecord) => void;
};

type BasemapType = "dark" | "satellite";

type ExistingSiteDataSource = "snapshot" | "cached" | "empty";

type SiteRecord = LocationTable & {
  SiteID: string;
  SiteName: string;
  Waterbody?: string;
  County?: string;
  DownstreamLat: number;
  DownstreamLong: number;
  DraftSource?: "snapshot" | "draft" | "pending" | "fallback";
  PendingSourceFileId?: string;
  PendingSourceFileName?: string;
};

const virginiaCenter: [number, number] = [37.55, -78.6];

const SITES_CACHE_KEY = "naiadd_existing_sites_cache_v1";
const SITES_CACHE_TIME_KEY = "naiadd_existing_sites_cached_at_v1";
const SITES_CACHE_VERSION = 1;

type CachedSitesPackage = {
  version: number;
  cachedAt: string;
  sites: LocationTable[];
};

const SNAPSHOT_SITE_COLUMNS = [
  "SiteID",
  "SiteID_AccessDB",
  "SiteID_Previous",
  "SiteName",
  "Waterbody",
  "County",
  "State",
  "RiverBasin",
  "HUC7",
  "PhysiographicProvince",
  "RoadName",
  "RoadNumber",
  "LocDescription",
  "LatitudeDD",
  "LongitudeDD",
  "DownstreamLat",
  "DownstreamLong",
  "UpstreamLat",
  "UpstreamLong",

  // Read-only migration aliases supported when older rows remain in the
  // unified snapshot. These are normalized into NAIADD fields below and are
  // never written back to the current-location cache.
  "Site_Id",
  "siteID",
  "siteId",
  "Site_Name",
  "Locality",
  "Station",
  "StationName",
  "Stream",
  "WaterbodyName",
  "CountyName",
  "LocationDesc",
  "LocationDescription",
  "Description",
  "DownstreamLatitude",
  "DownstreamLongitude",
  "UpstreamLatitude",
  "UpstreamLongitude",
  "Latitude",
  "Longitude",
  "Lat",
  "Long",
  "Lng",
  "Lat_Decimal_Degree",
  "Long_Decimal_Degree",
  "Y",
  "X",
] as const;

function loadCachedSitesData(): LocationTable[] | null {
  try {
    const raw = localStorage.getItem(SITES_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CachedSitesPackage>;

    if (
      parsed?.version !== SITES_CACHE_VERSION ||
      !Array.isArray(parsed.sites)
    ) {
      return null;
    }

    return parsed.sites as LocationTable[];
  } catch {
    return null;
  }
}

function cacheSitesData(data: LocationTable[]) {
  try {
    const cachedAt = new Date().toISOString();
    const payload: CachedSitesPackage = {
      version: SITES_CACHE_VERSION,
      cachedAt,
      sites: data,
    };

    localStorage.setItem(SITES_CACHE_KEY, JSON.stringify(payload));
    localStorage.setItem(SITES_CACHE_TIME_KEY, cachedAt);
  } catch (error) {
    console.warn("Unable to cache existing site data:", error);
  }
}

function getCachedSitesTime(): string {
  const raw = localStorage.getItem(SITES_CACHE_TIME_KEY);
  if (!raw) return "";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed.toLocaleString();
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function deriveSitesFromSnapshotRows(
  rows: Record<string, unknown>[],
): LocationTable[] {
  const bySiteId = new Map<string, LocationTable>();

  const siteIdKeys = [
    "SiteID",
    "Site_Id",
    "siteID",
    "siteId",
    "savedSiteID",
    "NewSiteID",
  ];
  const siteNameKeys = [
    "SiteName",
    "Site_Name",
    "siteName",
    "savedSiteName",
    "Locality",
    "Station",
    "StationName",
    "LocationName",
    "locationName",
  ];
  const waterbodyKeys = [
    "Waterbody",
    "waterbody",
    "Stream",
    "stream",
    "WaterbodyName",
    "waterbodyName",
  ];
  const countyKeys = ["County", "county", "CountyName"];
  const stateKeys = ["State", "state"];
  const riverBasinKeys = ["RiverBasin", "riverBasin", "Basin"];
  const huc7Keys = ["HUC7", "huc7", "HUC8", "huc8"];
  const provinceKeys = [
    "PhysiographicProvince",
    "physiographicProvince",
    "Province",
  ];
  const roadNameKeys = ["RoadName", "roadName"];
  const roadNumberKeys = ["RoadNumber", "roadNumber"];
  const locationDescKeys = [
    "LocDescription",
    "locDescription",
    "LocationDesc",
    "locationDesc",
    "LocationDescription",
    "locationDescription",
    "Description",
  ];
  const downstreamLatKeys = [
    "DownstreamLat",
    "downstreamLat",
    "DownstreamLatitude",
    "downstreamLatitude",
    "LatitudeDD",
    "latitudeDD",
    "Latitude",
    "latitude",
    "Lat",
    "lat",
    "Lat_Decimal_Degree",
    "Y",
    "y",
  ];
  const downstreamLongKeys = [
    "DownstreamLong",
    "downstreamLong",
    "DownstreamLongitude",
    "downstreamLongitude",
    "LongitudeDD",
    "longitudeDD",
    "Longitude",
    "longitude",
    "Long",
    "long",
    "Lng",
    "lng",
    "Long_Decimal_Degree",
    "X",
    "x",
  ];
  const upstreamLatKeys = [
    "UpstreamLat",
    "upstreamLat",
    "UpstreamLatitude",
    "upstreamLatitude",
  ];
  const upstreamLongKeys = [
    "UpstreamLong",
    "upstreamLong",
    "UpstreamLongitude",
    "upstreamLongitude",
  ];

  rows.forEach((row) => {
    const waterbody = getObjectString(row, waterbodyKeys);
    const rawSiteId = getObjectString(row, siteIdKeys);
    const siteName =
      getObjectString(row, siteNameKeys) || waterbody || rawSiteId;
    const county = getObjectString(row, countyKeys);
    const state = getObjectString(row, stateKeys);
    const riverBasin = getObjectString(row, riverBasinKeys);
    const huc7 = getObjectString(row, huc7Keys);
    const physiographicProvince = getObjectString(row, provinceKeys);
    const roadName = getObjectString(row, roadNameKeys);
    const roadNumber = getObjectString(row, roadNumberKeys);
    const locDescription = getObjectString(row, locationDescKeys);
    const downstreamLat = getObjectNumber(row, downstreamLatKeys);
    const downstreamLong = getObjectNumber(row, downstreamLongKeys);

    if (
      !Number.isFinite(downstreamLat) ||
      !Number.isFinite(downstreamLong) ||
      downstreamLat < 36.4 ||
      downstreamLat > 39.6 ||
      downstreamLong < -83.8 ||
      downstreamLong > -75.0
    ) {
      return;
    }

    if (!rawSiteId && !siteName && !waterbody) return;

    const siteId =
      rawSiteId ||
      `SITE-${Math.abs(
        Math.round(downstreamLat * 1000000) * 31 +
          Math.round(downstreamLong * 1000000),
      )}`;

    const existing = bySiteId.get(siteId);

    if (existing) {
      const existingSiteName = asString((existing as any).SiteName).trim();
      const existingWaterbody = asString((existing as any).Waterbody).trim();
      const existingCounty = asString((existing as any).County).trim();
      const existingLocationDesc = asString(
        (existing as any).LocDescription,
      ).trim();

      if (!existingSiteName && siteName) (existing as any).SiteName = siteName;
      if (!existingWaterbody && waterbody)
        (existing as any).Waterbody = waterbody;
      if (!existingCounty && county) (existing as any).County = county;
      if (!existingLocationDesc && locDescription)
        (existing as any).LocDescription = locDescription;

      return;
    }

    bySiteId.set(siteId, {
      ...(row as LocationTable),
      SiteID: siteId,
      SiteName: siteName || siteId,
      Waterbody: waterbody,
      County: county,
      State: state,
      RiverBasin: riverBasin,
      HUC7: huc7,
      PhysiographicProvince: physiographicProvince,
      RoadName: roadName,
      RoadNumber: roadNumber,
      LocDescription: locDescription,
      LatitudeDD: downstreamLat,
      LongitudeDD: downstreamLong,
      DownstreamLat: downstreamLat,
      DownstreamLong: downstreamLong,
      UpstreamLat: getObjectNumber(row, upstreamLatKeys),
      UpstreamLong: getObjectNumber(row, upstreamLongKeys),
    } as LocationTable);
  });

  return [...bySiteId.values()].sort((a, b) =>
    [
      asString((a as any).Waterbody),
      asString((a as any).SiteName),
      asString((a as any).SiteID),
    ]
      .join(" ")
      .localeCompare(
        [
          asString((b as any).Waterbody),
          asString((b as any).SiteName),
          asString((b as any).SiteID),
        ].join(" "),
      ),
  );
}



function getObjectValue(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return obj[key];
    }
  }

  const lowerKeyMap = new Map(
    Object.keys(obj).map((key) => [key.toLowerCase(), key]),
  );

  for (const key of keys) {
    const matchedKey = lowerKeyMap.get(key.toLowerCase());
    if (matchedKey) {
      return obj[matchedKey];
    }
  }

  return undefined;
}

function getObjectString(obj: Record<string, unknown>, keys: string[]): string {
  return asString(getObjectValue(obj, keys)).trim();
}

function getObjectNumber(obj: Record<string, unknown>, keys: string[]): number {
  return asNumber(getObjectValue(obj, keys));
}

function cleanSites(data: LocationTable[]): SiteRecord[] {
  return data
    .map((rawSite) => {
      const siteId = asString((rawSite as any).SiteID);
      const siteName = asString((rawSite as any).SiteName);
      const waterbody = asString((rawSite as any).Waterbody);
      const county = asString((rawSite as any).County);
      const lat = asNumber(
        (rawSite as any).DownstreamLat ?? (rawSite as any).LatitudeDD,
      );
      const lng = asNumber(
        (rawSite as any).DownstreamLong ?? (rawSite as any).LongitudeDD,
      );

      return {
        SiteID: siteId,
        SiteID_AccessDB: asString((rawSite as any).SiteID_AccessDB) || undefined,
        SiteID_Previous: asString((rawSite as any).SiteID_Previous) || undefined,
        SiteName: siteName,
        Waterbody: waterbody,
        County: county,
        State: asString((rawSite as any).State),
        RiverBasin: asString((rawSite as any).RiverBasin),
        HUC7: asString((rawSite as any).HUC7),
        PhysiographicProvince: asString(
          (rawSite as any).PhysiographicProvince,
        ),
        RoadName: asString((rawSite as any).RoadName),
        RoadNumber: asString((rawSite as any).RoadNumber),
        LocDescription: asString((rawSite as any).LocDescription),
        LatitudeDD: lat,
        LongitudeDD: lng,
        DownstreamLat: lat,
        DownstreamLong: lng,
        UpstreamLat: Number.isFinite(asNumber((rawSite as any).UpstreamLat))
          ? asNumber((rawSite as any).UpstreamLat)
          : null,
        UpstreamLong: Number.isFinite(asNumber((rawSite as any).UpstreamLong))
          ? asNumber((rawSite as any).UpstreamLong)
          : null,
        DraftSource: (rawSite as any).DraftSource,
        PendingSourceFileId: (rawSite as any).PendingSourceFileId,
        PendingSourceFileName: (rawSite as any).PendingSourceFileName,
      } as SiteRecord;
    })
    .filter(
      (site) =>
        site.SiteID.trim() &&
        site.SiteName.trim() &&
        Number.isFinite(site.DownstreamLat) &&
        Number.isFinite(site.DownstreamLong),
    )
    .filter(
      (site) =>
        site.DownstreamLat >= 36.4 &&
        site.DownstreamLat <= 39.6 &&
        site.DownstreamLong >= -83.8 &&
        site.DownstreamLong <= -75.0,
    );
}


function MapSizeInvalidator({
  basemap,
  siteCount,
}: {
  basemap: BasemapType;
  siteCount: number;
}) {
  const map = useMap();

  useEffect(() => {
    const invalidate = () => {
      map.invalidateSize();
    };

    const timers = [0, 120, 300, 650, 1000].map((delay) =>
      window.setTimeout(invalidate, delay),
    );

    const container = map.getContainer();
    const parent = container.parentElement;

    let resizeObserver: ResizeObserver | null = null;

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => invalidate());

      resizeObserver.observe(container);

      if (parent) {
        resizeObserver.observe(parent);
      }
    }

    window.addEventListener("resize", invalidate);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", invalidate);

      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [map, basemap, siteCount]);

  return null;
}

function FlyToSelectedSite({ site }: { site: SiteRecord | undefined }) {
  const map = useMap();

  useEffect(() => {
    if (!site) return;

    map.flyTo([site.DownstreamLat, site.DownstreamLong], 15, {
      duration: 1.1,
    });
  }, [map, site]);

  return null;
}


function FlyToCurrentLocation({
  latitude,
  longitude,
  trigger,
}: {
  latitude: number | null;
  longitude: number | null;
  trigger: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (
      latitude === null ||
      longitude === null ||
      trigger === 0
    ) {
      return;
    }

    map.flyTo([latitude, longitude], 15, {
      duration: 1.1,
    });
  }, [latitude, longitude, trigger, map]);

  return null;
}

function ExistingSiteStep({
  onBack,
  onLocationSaved,
}: ExistingSiteStepProps) {
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshingSites, setRefreshingSites] = useState(false);
  const [siteStatusMessage, setSiteStatusMessage] = useState("");
  const [dataSource, setDataSource] =
    useState<ExistingSiteDataSource>("empty");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [basemap, setBasemap] = useState<BasemapType>("satellite");
  const [locatingUser, setLocatingUser] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number | null;
    longitude: number | null;
    trigger: number;
  }>({
    latitude: null,
    longitude: null,
    trigger: 0,
  });

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

  function loadCachedSiteIndex() {
    const cached = loadCachedSitesData();

    if (cached && cached.length > 0) {
      const cleaned = cleanSites(cached);
      setSites(cleaned);
      setDataSource("cached");
      setSiteStatusMessage(
        `Loaded ${cleaned.length.toLocaleString()} cached NAIADD site(s)${
          getCachedSitesTime() ? ` from ${getCachedSitesTime()}` : ""
        }.`,
      );
      return;
    }

    setSites([]);
    setDataSource("empty");
    setSiteStatusMessage(
      "No cached NAIADD snapshot site index is available yet. Use Refresh Sites once while online after syncing the NAIADD production snapshot.",
    );
  }

  useEffect(() => {
    loadCachedSiteIndex();
    setLoading(false);
  }, []);

  async function refreshSiteCache() {
    if (refreshingSites) return;

    setRefreshingSites(true);
    setSiteStatusMessage("Refreshing sites from the cached NAIADD production snapshot…");

    try {
      const snapshotRows = await readSnapshotRows({
        columns: [...SNAPSHOT_SITE_COLUMNS],
      });

      const snapshotSites = deriveSitesFromSnapshotRows(snapshotRows);

      if (snapshotSites.length === 0) {
        throw new Error(
          "The cached NAIADD production snapshot did not contain usable site records. Sync the NAIADD production snapshot from the Home Dashboard first.",
        );
      }

      const cleaned = cleanSites(
        snapshotSites.map(
          (site) =>
            ({
              ...site,
              DraftSource: "snapshot",
            }) as LocationTable,
        ),
      );

      cacheSitesData(cleaned);
      setSites(cleaned);
      setDataSource("snapshot");
      setSiteStatusMessage(
        `Refreshed ${cleaned.length.toLocaleString()} unique sites from the cached NAIADD production snapshot.`,
      );
    } catch (error) {
      console.warn("Unable to refresh existing site cache:", error);
      setSiteStatusMessage(
        error instanceof Error
          ? error.message
          : "Unable to refresh the site cache.",
      );
      loadCachedSiteIndex();
    } finally {
      setRefreshingSites(false);
      setLoading(false);
    }
  }

  const selectedSite = useMemo(
    () => sites.find((site) => site.SiteID === selectedSiteId),
    [sites, selectedSiteId],
  );

  const filteredSites = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) return sites.slice(0, 80);

    return sites
      .map((site) => {
        const siteId = site.SiteID.toLowerCase();
        const siteName = site.SiteName.toLowerCase();
        const waterbody = (site.Waterbody || "").toLowerCase();
        const county = (site.County || "").toLowerCase();

        let rank: number | null = null;

        if (siteId === query) rank = 0;
        else if (siteName === query) rank = 1;
        else if (waterbody === query) rank = 2;
        else if (siteId.startsWith(query)) rank = 3;
        else if (siteName.startsWith(query)) rank = 4;
        else if (waterbody.startsWith(query)) rank = 5;
        else if (siteName.includes(query)) rank = 6;
        else if (waterbody.includes(query)) rank = 7;
        else if (siteId.includes(query)) rank = 8;
        else if (county.startsWith(query)) rank = 9;
        else if (county.includes(query)) rank = 10;

        return { site, rank };
      })
      .filter(
        (item): item is { site: SiteRecord; rank: number } =>
          item.rank !== null,
      )
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;

        const waterbodyCompare = (a.site.Waterbody || "").localeCompare(
          b.site.Waterbody || "",
        );

        if (waterbodyCompare !== 0) return waterbodyCompare;

        return a.site.SiteName.localeCompare(b.site.SiteName);
      })
      .slice(0, 120)
      .map((item) => item.site);
  }, [sites, searchText]);

  function selectSite(site: SiteRecord) {
    setSelectedSiteId(site.SiteID);
  }

  function saveSiteAndContinue(site: SiteRecord) {
    saveCurrentLocation(site);
    onLocationSaved(site);
    setSiteStatusMessage(
      `${site.SiteName} saved as the current location.`,
    );
  }

  function saveSelectedSite() {
    if (!selectedSite) return;
    saveSiteAndContinue(selectedSite);
  }

  function zoomToCurrentLocation() {
    setLocationError("");

    if (!navigator.geolocation) {
      setLocationError(
        "Current location is not available on this device.",
      );
      return;
    }

    setLocatingUser(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation((current) => ({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          trigger: current.trigger + 1,
        }));
        setLocatingUser(false);
      },
      () => {
        setLocationError(
          "Unable to access your current location. Check browser location permissions.",
        );
        setLocatingUser(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      },
    );
  }

  return (
    <main className="app existingSitePage">
      {(dataSource === "cached" || !isOnline) && (
        <div className="existingSiteOfflineNotice">
          Using the locally cached NAIADD site index. Basemap tiles may be
          limited to areas previously viewed.
        </div>
      )}

      {dataSource === "empty" && !loading && (
        <div className="existingSiteOfflineNotice warning">
          Existing sites are not cached on this device yet. Sync the production
          snapshot, then use Refresh Sites.
        </div>
      )}

      <button type="button" className="backButton" onClick={onBack}>
        ← Back to Location Options
      </button>

      <section className="stepHeader">
        <div className="stepIcon">⧉</div>

        <div>
          <p className="stepKicker">Use Existing Sampling Site</p>
          <h1>Existing Site Location</h1>
          <p>
            Search by site name, waterbody, SiteID, or county, then confirm the
            site on the map.
          </p>
        </div>
      </section>

      <section className="existingSiteCard">
        <div className="mapHeaderRow">
          <div>
            <h2>Search Sites</h2>
            <p className="thinText">
              {sites.length.toLocaleString()} NAIADD site
              {sites.length === 1 ? "" : "s"} loaded.
            </p>
          </div>

          <button
            type="button"
            className="clearSearchButton"
            onClick={refreshSiteCache}
            disabled={refreshingSites}
          >
            {refreshingSites ? "Refreshing…" : "Refresh Sites"}
          </button>
        </div>

        <div className="siteSearchBox">
          <input
            className="input"
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
              setSelectedSiteId("");
            }}
            placeholder="Search site name, waterbody, SiteID, or county…"
          />

          {searchText && (
            <button
              type="button"
              className="clearSearchButton"
              onClick={() => {
                setSearchText("");
                setSelectedSiteId("");
              }}
            >
              Clear
            </button>
          )}
        </div>

        <div className="siteResultList">
          {filteredSites.map((site) => (
            <button
              key={site.SiteID}
              type="button"
              className={`siteResult ${
                site.SiteID === selectedSiteId ? "siteResultActive" : ""
              }`}
              onClick={() => selectSite(site)}
            >
              <strong>{site.SiteName}</strong>
              <span>{site.Waterbody || "Unknown Waterbody"}</span>
              <small>
                {site.SiteID}
                {site.County ? ` • ${site.County}` : ""}
              </small>
            </button>
          ))}
        </div>

        {siteStatusMessage && (
          <p className="thinText">{siteStatusMessage}</p>
        )}
      </section>

      <section className="existingSiteCard">
        <div className="mapHeaderRow">
          <div>
            <h2>Site Map</h2>
            <p className="thinText">
              All {sites.length.toLocaleString()} loaded sites are displayed.
              Select a site from the list or directly from the map.
            </p>
          </div>

          <div className="basemapOptionsGroup" aria-label="Basemap Options">
            <span className="basemapOptionsLabel">Basemap Options</span>

            <button
              type="button"
              className={`basemapOptionButton ${
                basemap === "dark" ? "active" : ""
              }`}
              onClick={() => setBasemap("dark")}
            >
              Dark
            </button>

            <button
              type="button"
              className={`basemapOptionButton ${
                basemap === "satellite" ? "active" : ""
              }`}
              onClick={() => setBasemap("satellite")}
            >
              Satellite
            </button>

            <button
              type="button"
              className="basemapOptionButton"
              onClick={zoomToCurrentLocation}
              disabled={locatingUser}
              aria-label="Zoom to my current location"
              title="Zoom to my current location"
            >
              {locatingUser ? "…" : "⌖"}
            </button>
          </div>
        </div>

        <div className="leafletMap modernLeafletMap">
          <MapContainer
            center={virginiaCenter}
            zoom={7}
            minZoom={6}
            maxZoom={18}
            scrollWheelZoom={true}
            preferCanvas={true}
            zoomControl={false}
            attributionControl={false}
            style={{
              height: "100%",
              width: "100%",
              background: "#111827",
            }}
          >
            <MapSizeInvalidator basemap={basemap} siteCount={sites.length} />

            {basemap === "dark" ? (
              <TileLayer
                key="dark-basemap"
                attribution="&copy; OpenStreetMap contributors &copy; CARTO"
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
            ) : (
              <TileLayer
                key="satellite-basemap"
                attribution="Tiles &copy; Esri"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            )}

            <ZoomControl position="bottomright" />
            <FlyToSelectedSite site={selectedSite} />
            <FlyToCurrentLocation
              latitude={currentLocation.latitude}
              longitude={currentLocation.longitude}
              trigger={currentLocation.trigger}
            />

            {currentLocation.latitude !== null &&
              currentLocation.longitude !== null && (
                <CircleMarker
                  center={[
                    currentLocation.latitude,
                    currentLocation.longitude,
                  ]}
                  radius={8}
                  pathOptions={{
                    color: "#ffffff",
                    fillColor: "#2563eb",
                    fillOpacity: 0.9,
                    opacity: 1,
                    weight: 3,
                  }}
                >
                  <Popup className="modernPopup">
                    <strong>Your Current Location</strong>
                  </Popup>
                </CircleMarker>
              )}

            {sites.map((site) => {
              const isSelected = site.SiteID === selectedSiteId;

              return (
                <CircleMarker
                  key={site.SiteID}
                  center={[site.DownstreamLat, site.DownstreamLong]}
                  radius={isSelected ? 7 : 3.25}
                  pathOptions={{
                    color: isSelected
                      ? "#ffd29a"
                      : "rgba(255, 255, 255, 0.78)",
                    fillColor: isSelected ? "#ff9f43" : "#6b7280",
                    fillOpacity: isSelected ? 0.98 : 0.78,
                    opacity: 1,
                    weight: isSelected ? 2.6 : 1.1,
                  }}
                  eventHandlers={{
                    click: () => selectSite(site),
                  }}
                >
                  <Popup className="modernPopup">
                    <strong>{site.SiteName}</strong>
                    <br />
                    Waterbody: {site.Waterbody || "Unknown"}
                    <br />
                    County: {site.County || "Unknown"}
                    <br />
                    SiteID: {site.SiteID}
                    <br />
                    <button
                      type="button"
                      className="popupButton"
                      onClick={() => saveSiteAndContinue(site)}
                    >
                      Select Site
                    </button>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        {locationError && (
          <p className="coordinateError">{locationError}</p>
        )}
      </section>

      {selectedSite && (
        <section className="existingSiteCard selectedSiteCard">
          <h2>Selected Site Details</h2>

          <div className="detailsGrid">
            <div>
              <small>Site Name</small>
              <strong>{selectedSite.SiteName}</strong>
            </div>

            <div>
              <small>Waterbody</small>
              <strong>{selectedSite.Waterbody || "—"}</strong>
            </div>

            <div>
              <small>SiteID</small>
              <strong>{selectedSite.SiteID}</strong>
            </div>

            <div>
              <small>County</small>
              <strong>{selectedSite.County || "—"}</strong>
            </div>

            <div>
              <small>State</small>
              <strong>{selectedSite.State || "—"}</strong>
            </div>

            <div>
              <small>River Basin</small>
              <strong>{selectedSite.RiverBasin || "—"}</strong>
            </div>

            <div>
              <small>Downstream</small>
              <strong>
                {selectedSite.DownstreamLat.toFixed(6)},{" "}
                {selectedSite.DownstreamLong.toFixed(6)}
              </strong>
            </div>
          </div>

          <div className="actionBar desktopStepActions">
            <button
              type="button"
              className="primaryActionBtn"
              onClick={saveSelectedSite}
            >
              Use This Site
            </button>
          </div>
        </section>
      )}

      {selectedSite && (
        <div className="mobileStepFooter mobileStepFooterSingle">
          <button
            type="button"
            className="mobileStepPrimaryAction"
            onClick={saveSelectedSite}
          >
            Use This Site
          </button>
        </div>
      )}
    </main>
  );
}

export default ExistingSiteStep;
