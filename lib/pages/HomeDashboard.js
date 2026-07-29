"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = HomeDashboard;
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const react_leaflet_1 = require("react-leaflet");
require("leaflet/dist/leaflet.css");
const naiadd_shield_png_1 = __importDefault(require("../assets/naiadd-shield.png"));
const user_1 = require("../types/user");
const displayName_1 = require("../utils/displayName");
const surveySessionService_1 = require("../services/surveySessionService");
const snapshotService_1 = require("../services/snapshotService");
require("../styles/HomeDashboard.css");
const SCENERY_IMAGES = Array.from({ length: 14 }, (_, index) => `/images/scenery/Header_${index + 1}.jpg`);
const DASHBOARD_SNAPSHOT_COLUMNS = [
    "CollectionID",
    "Collection_Id",
    "SiteID",
    "Site_Id",
    "CommonName",
    "Common_Name",
    "Species",
    "Survey_Date",
    "SampleDate",
    "CollectionDate",
    "Date",
    "FinalDate",
    "Waterbody",
    "Stream",
    "SiteName",
    "Locality",
    "Sampling_Method",
    "SamplingMethod",
    "Survey_Type",
    "SurveyType",
    "GearType",
    "Geartype",
    "Quantity",
    "Count",
    "Qty",
    "Number",
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
];
const EMPTY_DASHBOARD_SUMMARY = {
    surveysCompleted: 0,
    sitesSampled: 0,
    speciesEncountered: 0,
    fishProcessed: 0,
    mostCommonSpecies: "—",
};
let dashboardSnapshotRowsCache = null;
let dashboardSnapshotRowsPromise = null;
async function readDashboardSnapshotRowsOnce() {
    if (dashboardSnapshotRowsCache) {
        return dashboardSnapshotRowsCache;
    }
    if (!dashboardSnapshotRowsPromise) {
        dashboardSnapshotRowsPromise = (0, snapshotService_1.readCachedVadmaSnapshotRows)({
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
function setDashboardSnapshotRowsCache(rows) {
    dashboardSnapshotRowsCache = rows;
    dashboardSnapshotRowsPromise = null;
}
function getValue(row, names) {
    for (const name of names) {
        const value = row[name];
        if (value !== undefined && value !== null && value !== "") {
            return value;
        }
    }
    const lowerCaseKeys = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]));
    for (const name of names) {
        const matchedKey = lowerCaseKeys.get(name.toLowerCase());
        if (!matchedKey)
            continue;
        const value = row[matchedKey];
        if (value !== undefined && value !== null && value !== "") {
            return value;
        }
    }
    return null;
}
function toText(value) {
    if (value === undefined || value === null)
        return "";
    return String(value).trim();
}
function toFishCount(value) {
    if (value === undefined || value === null || value === "")
        return 0;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return 0;
    return Math.round(parsed);
}
function formatWholeNumber(value) {
    const safeValue = Number.isFinite(value) ? Math.round(value) : 0;
    return safeValue.toLocaleString(undefined, {
        maximumFractionDigits: 0,
    });
}
function toNumber(value) {
    if (value === undefined || value === null || value === "")
        return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
function parseDate(value) {
    if (value === undefined || value === null || value === "")
        return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === "number") {
        const timestamp = value > 1_000_000_000
            ? value
            : Date.UTC(1970, 0, 1) + value * 86_400_000;
        const parsed = new Date(timestamp);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function formatDate(value) {
    const parsed = parseDate(value);
    if (!parsed)
        return "Unknown date";
    return parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}
function buildDashboardAnalytics(rows) {
    const collectionIDs = new Set();
    const siteIDs = new Set();
    const speciesNames = new Set();
    const speciesTotals = new Map();
    const sitePointMap = new Map();
    const surveyMap = new Map();
    for (const row of rows) {
        const collectionID = toText(getValue(row, ["CollectionID", "Collection_Id"])) ||
            "Unknown Collection";
        if (collectionID !== "Unknown Collection") {
            collectionIDs.add(collectionID);
        }
        const siteID = toText(getValue(row, ["SiteID", "Site_Id"])) || "Unknown Site";
        if (siteID !== "Unknown Site") {
            siteIDs.add(siteID);
        }
        const siteName = toText(getValue(row, ["SiteName", "Locality"])) || siteID;
        const waterbody = toText(getValue(row, ["Waterbody", "Stream", "SiteName", "Locality"])) || "Unknown Waterbody";
        const species = toText(getValue(row, ["CommonName", "Common_Name", "Species"])) ||
            "Unknown Species";
        const quantity = toFishCount(getValue(row, ["Quantity", "Count", "Qty", "Number"]));
        if (species !== "Unknown Species") {
            speciesNames.add(species);
            speciesTotals.set(species, (speciesTotals.get(species) ?? 0) + quantity);
        }
        const latitude = toNumber(getValue(row, [
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
        ]));
        const longitude = toNumber(getValue(row, [
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
        ]));
        if (siteID !== "Unknown Site" &&
            latitude >= -90 &&
            latitude <= 90 &&
            longitude >= -180 &&
            longitude <= 180 &&
            latitude !== 0 &&
            longitude !== 0 &&
            !sitePointMap.has(siteID)) {
            sitePointMap.set(siteID, {
                siteID,
                siteName,
                waterbody,
                latitude,
                longitude,
            });
        }
        const dateValue = getValue(row, [
            "Survey_Date",
            "SampleDate",
            "CollectionDate",
            "Date",
            "FinalDate",
        ]);
        const timestamp = parseDate(dateValue)?.getTime() ?? 0;
        const method = toText(getValue(row, [
            "Sampling_Method",
            "SamplingMethod",
            "Survey_Type",
            "SurveyType",
            "GearType",
            "Geartype",
        ])) || "Survey";
        if (!surveyMap.has(collectionID)) {
            surveyMap.set(collectionID, {
                collectionID,
                siteID,
                waterbody,
                dateLabel: formatDate(dateValue),
                timestamp,
                method,
                fishCount: 0,
                speciesCount: 0,
                species: new Set(),
            });
        }
        const survey = surveyMap.get(collectionID);
        if (timestamp > survey.timestamp) {
            survey.timestamp = timestamp;
            survey.dateLabel = formatDate(dateValue);
        }
        survey.fishCount += quantity;
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
            sitesSampled: siteIDs.size,
            speciesEncountered: speciesNames.size,
            fishProcessed: [...speciesTotals.values()].reduce((total, quantity) => total + quantity, 0),
            mostCommonSpecies: topSpecies[0]?.label ?? "—",
        },
        recentSurveys,
        topSpecies,
        sitePoints: [...sitePointMap.values()],
        totalRows: rows.length,
    };
}
function SceneryHeader({ profile, isOnline, }) {
    const [activeIndex, setActiveIndex] = (0, react_1.useState)(0);
    const [previousIndex, setPreviousIndex] = (0, react_1.useState)(null);
    const fadeTimeoutRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
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
    return (<section className="home-scenery-header">
      {previousIndex !== null && (<div className="home-scenery-image home-scenery-image-previous" style={{
                backgroundImage: `url(${SCENERY_IMAGES[previousIndex]})`,
            }}/>)}

      <div className="home-scenery-image home-scenery-image-active" style={{
            backgroundImage: `url(${SCENERY_IMAGES[activeIndex]})`,
        }}/>

      <div className="home-scenery-shade"/>

      <div className="home-scenery-brand">
        <img src={naiadd_shield_png_1.default} alt="NAIADD"/>

        <div>
          <p>WELCOME BACK</p>
          <h1>{(0, displayName_1.getDisplayName)(profile)}</h1>
          <div className="home-hero-status-row">
            <span>{user_1.USER_ROLE_LABELS[profile.role]}</span>

            <span className={`home-connection-status ${isOnline ? "online" : "offline"}`}>
              <i aria-hidden="true"/>
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </div>
    </section>);
}
function MetricCard({ title, value, subtitle, icon, isLoading, }) {
    return (<article className="home-metric-card">
      <div className="home-metric-card-top">
        <span>{title}</span>
        <div className="home-metric-icon">{icon}</div>
      </div>

      <strong className={isLoading ? "home-metric-value loading" : "home-metric-value"}>
        {isLoading ? "—" : value}
      </strong>

      <small>{subtitle}</small>
    </article>);
}
function ChartList({ rows, emptyText, }) {
    const maxValue = Math.max(...rows.map((row) => row.value), 1);
    if (rows.length === 0) {
        return <div className="home-chart-empty">{emptyText}</div>;
    }
    return (<div className="home-chart-list">
      {rows.map((row) => (<div className="home-chart-row" key={row.label}>
          <div className="home-chart-label">
            <span title={row.label}>{row.label}</span>
            <strong>{row.displayValue ?? formatWholeNumber(row.value)}</strong>
          </div>

          <div className="home-chart-track">
            <div className="home-chart-fill" style={{
                width: `${Math.max(4, (row.value / maxValue) * 100)}%`,
            }}/>
          </div>
        </div>))}
    </div>);
}
const VIRGINIA_BOUNDS = [
    [36.54, -83.68],
    [39.47, -75.24],
];
function FitMapToVirginia() {
    const map = (0, react_leaflet_1.useMap)();
    (0, react_1.useEffect)(() => {
        map.fitBounds(VIRGINIA_BOUNDS, {
            padding: [18, 18],
            animate: false,
        });
    }, [map]);
    return null;
}
function useVadmaAccentColor() {
    const readAccentColor = () => {
        const candidates = [
            document.documentElement,
            document.body,
            document.querySelector("#root"),
            document.querySelector(".app-shell"),
        ].filter((element) => Boolean(element));
        for (const element of candidates) {
            const value = getComputedStyle(element)
                .getPropertyValue("--vadma-accent")
                .trim();
            if (value)
                return value;
        }
        return "#ff9f43";
    };
    const [accentColor, setAccentColor] = (0, react_1.useState)(readAccentColor);
    (0, react_1.useEffect)(() => {
        let animationFrame = 0;
        const refreshAccentColor = () => {
            window.cancelAnimationFrame(animationFrame);
            animationFrame = window.requestAnimationFrame(() => {
                setAccentColor((current) => {
                    const next = readAccentColor();
                    return next === current ? current : next;
                });
            });
        };
        const observer = new MutationObserver(refreshAccentColor);
        const observedElements = [
            document.documentElement,
            document.body,
            document.querySelector("#root"),
            document.querySelector(".app-shell"),
        ].filter((element) => Boolean(element));
        observedElements.forEach((element) => {
            observer.observe(element, {
                attributes: true,
                attributeFilter: ["class", "style", "data-vadma-theme", "data-theme"],
            });
        });
        window.addEventListener("storage", refreshAccentColor);
        window.addEventListener("vadma-theme-change", refreshAccentColor);
        return () => {
            observer.disconnect();
            window.cancelAnimationFrame(animationFrame);
            window.removeEventListener("storage", refreshAccentColor);
            window.removeEventListener("vadma-theme-change", refreshAccentColor);
        };
    }, []);
    return accentColor;
}
function SiteDistributionMap({ points }) {
    const accentColor = useVadmaAccentColor();
    if (points.length === 0) {
        return (<div className="home-map-empty">
        No site coordinates are available in the cached snapshot.
      </div>);
    }
    return (<div className="home-site-map-shell">
      <react_leaflet_1.MapContainer className="home-site-map" center={[37.7, -78.4]} zoom={7} scrollWheelZoom={false} attributionControl>
        <react_leaflet_1.TileLayer attribution='&copy; OpenStreetMap contributors &copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"/>

        <FitMapToVirginia />

        {points.map((point) => (<react_leaflet_1.CircleMarker key={point.siteID} center={[point.latitude, point.longitude]} radius={3.5} pathOptions={{
                color: "rgba(255, 255, 255, 0.92)",
                weight: 1.25,
                fillColor: accentColor,
                fillOpacity: 0.95,
            }}>
            <react_leaflet_1.Popup>
              <div className="home-site-popup">
                <strong>{point.siteName}</strong>
                <span>{point.waterbody}</span>
                <small>{point.siteID}</small>
              </div>
            </react_leaflet_1.Popup>
          </react_leaflet_1.CircleMarker>))}
      </react_leaflet_1.MapContainer>

      <div className="home-map-count">
        <lucide_react_1.MapPin size={14} aria-hidden="true"/>
        {points.length.toLocaleString()} mapped sites
      </div>
    </div>);
}
function HomeDashboard({ profile }) {
    const [draftCount, setDraftCount] = (0, react_1.useState)(0);
    const [now, setNow] = (0, react_1.useState)(() => new Date());
    const [snapshotRows, setSnapshotRows] = (0, react_1.useState)(() => dashboardSnapshotRowsCache ?? []);
    const [snapshotState, setSnapshotState] = (0, react_1.useState)(() => (dashboardSnapshotRowsCache ? "ready" : "loading"));
    const [snapshotStatus, setSnapshotStatus] = (0, react_1.useState)(() => dashboardSnapshotRowsCache
        ? "Cached production snapshot loaded."
        : "Loading cached NAIADD production snapshot...");
    const [snapshotVersion, setSnapshotVersion] = (0, react_1.useState)(() => (0, snapshotService_1.getCachedVadmaSnapshotMeta)()?.version ?? null);
    const [isSyncing, setIsSyncing] = (0, react_1.useState)(false);
    const [isRecentActivityOpen, setIsRecentActivityOpen] = (0, react_1.useState)(false);
    const [isOnline, setIsOnline] = (0, react_1.useState)(() => navigator.onLine);
    const analytics = (0, react_1.useMemo)(() => snapshotRows.length > 0
        ? buildDashboardAnalytics(snapshotRows)
        : {
            summary: EMPTY_DASHBOARD_SUMMARY,
            recentSurveys: [],
            topSpecies: [],
            sitePoints: [],
            totalRows: 0,
        }, [snapshotRows]);
    (0, react_1.useEffect)(() => {
        const timer = window.setInterval(() => {
            setNow(new Date());
        }, 1000);
        return () => {
            window.clearInterval(timer);
        };
    }, []);
    (0, react_1.useEffect)(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);
    (0, react_1.useEffect)(() => {
        function refreshDraftCount() {
            const drafts = (0, surveySessionService_1.listSurveyDrafts)(profile.uid);
            setDraftCount(drafts.length);
        }
        refreshDraftCount();
        window.addEventListener(surveySessionService_1.WORKFLOW_SESSION_EVENT, refreshDraftCount);
        window.addEventListener("storage", refreshDraftCount);
        return () => {
            window.removeEventListener(surveySessionService_1.WORKFLOW_SESSION_EVENT, refreshDraftCount);
            window.removeEventListener("storage", refreshDraftCount);
        };
    }, [profile.uid]);
    (0, react_1.useEffect)(() => {
        const loadState = { cancelled: false };
        async function loadSnapshotFromCache() {
            try {
                if (dashboardSnapshotRowsCache) {
                    const meta = (0, snapshotService_1.getCachedVadmaSnapshotMeta)();
                    setSnapshotRows(dashboardSnapshotRowsCache);
                    setSnapshotVersion(meta?.version ?? null);
                    setSnapshotState(dashboardSnapshotRowsCache.length > 0 ? "ready" : "empty");
                    setSnapshotStatus(dashboardSnapshotRowsCache.length > 0
                        ? `Production snapshot${meta?.version ? ` ${meta.version}` : ""} loaded.`
                        : "The cached production snapshot contained no dashboard records.");
                    return;
                }
                setSnapshotState("loading");
                setSnapshotStatus("Loading cached NAIADD production snapshot...");
                const cachedMeta = (0, snapshotService_1.getCachedVadmaSnapshotMeta)();
                const rows = await readDashboardSnapshotRowsOnce();
                if (loadState.cancelled)
                    return;
                const meta = (0, snapshotService_1.getCachedVadmaSnapshotMeta)();
                setSnapshotRows(rows);
                setSnapshotVersion(meta?.version ?? null);
                setSnapshotState(rows.length > 0 ? "ready" : "empty");
                setSnapshotStatus(rows.length > 0
                    ? `Production snapshot${meta?.version ? ` ${meta.version}` : ""} loaded.`
                    : cachedMeta
                        ? "The cached production snapshot contained no dashboard records."
                        : 'No cached production snapshot is available. Click "Refresh Snapshot" to download one.');
            }
            catch (error) {
                if (loadState.cancelled)
                    return;
                console.error("Unable to load cached NAIADD snapshot dashboard metrics:", error);
                setSnapshotRows([]);
                setSnapshotState("error");
                setSnapshotStatus(error instanceof Error
                    ? error.message
                    : "Unable to read the cached NAIADD production snapshot.");
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
            setSnapshotStatus("Syncing NAIADD production snapshot...");
            const result = await (0, snapshotService_1.forceSyncVadmaSnapshot)();
            const rows = await (0, snapshotService_1.readCachedVadmaSnapshotRows)({
                columns: [...DASHBOARD_SNAPSHOT_COLUMNS],
            });
            const meta = (0, snapshotService_1.getCachedVadmaSnapshotMeta)();
            setDashboardSnapshotRowsCache(rows);
            setSnapshotRows(rows);
            setSnapshotVersion(result.version ?? meta?.version ?? null);
            setSnapshotState(rows.length > 0 ? "ready" : "empty");
            setSnapshotStatus(result.message);
        }
        catch (error) {
            console.error("Unable to refresh NAIADD production snapshot:", error);
            setSnapshotState(snapshotRows.length > 0 ? "ready" : "error");
            setSnapshotStatus(error instanceof Error
                ? error.message
                : "Unable to refresh the NAIADD production snapshot.");
        }
        finally {
            setIsSyncing(false);
        }
    }
    const isSnapshotLoading = snapshotState === "loading";
    const snapshotSubtitle = snapshotState === "ready"
        ? snapshotVersion
            ? `Production snapshot ${snapshotVersion}`
            : "Production snapshot"
        : snapshotState === "loading"
            ? "Loading production snapshot"
            : "Snapshot data unavailable";
    return (<div className="home-dashboard-page">
      <SceneryHeader profile={profile} isOnline={isOnline}/>

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
          <lucide_react_1.Database size={18} aria-hidden="true"/>

          <div>
            <strong>NAIADD Production Database</strong>
            <span>{snapshotStatus}</span>
          </div>
        </div>

        <button type="button" className="home-snapshot-refresh" onClick={() => void handleSnapshotRefresh()} disabled={isSyncing}>
          <lucide_react_1.RefreshCw size={17} aria-hidden="true" className={isSyncing ? "spinning" : ""}/>
          {isSyncing ? "Syncing" : "Refresh Snapshot"}
        </button>
      </section>

      <section className="home-metrics-grid">
        <MetricCard title="Surveys Completed" value={analytics.summary.surveysCompleted.toLocaleString()} subtitle={snapshotSubtitle} icon={<lucide_react_1.ClipboardList size={30}/>} isLoading={isSnapshotLoading}/>

        <MetricCard title="Sites Sampled" value={analytics.summary.sitesSampled.toLocaleString()} subtitle="Unique SiteID values" icon={<lucide_react_1.MapPin size={30}/>} isLoading={isSnapshotLoading}/>

        <MetricCard title="Species Encountered" value={analytics.summary.speciesEncountered.toLocaleString()} subtitle="Unique common names" icon={<lucide_react_1.Fish size={30}/>} isLoading={isSnapshotLoading}/>

        <MetricCard title="Fish Processed" value={formatWholeNumber(analytics.summary.fishProcessed)} subtitle="Summed specimen quantity" icon={<lucide_react_1.Ruler size={30}/>} isLoading={isSnapshotLoading}/>

        <MetricCard title="Most Common Species" value={analytics.summary.mostCommonSpecies} subtitle="By total quantity" icon={<lucide_react_1.BarChart3 size={30}/>} isLoading={isSnapshotLoading}/>
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
        <button type="button" className="home-activity-toggle" onClick={() => setIsRecentActivityOpen((current) => !current)} aria-expanded={isRecentActivityOpen} aria-controls="home-recent-surveys-panel">
          <div>
            <p>DATABASE ACTIVITY</p>
            <h3>Recent Surveys</h3>
          </div>

          <div className="home-activity-toggle-meta">
            <span>{analytics.recentSurveys.length} newest surveys</span>
            <b className={isRecentActivityOpen ? "open" : ""} aria-hidden="true">▾</b>
          </div>
        </button>

        <div id="home-recent-surveys-panel" className={isRecentActivityOpen ? "home-activity-collapse open" : "home-activity-collapse"}>
          <div className="home-activity-collapse-inner">
            <div className="home-recent-list">
              {isSnapshotLoading ? (<div className="home-panel-empty">Loading recent surveys...</div>) : analytics.recentSurveys.length === 0 ? (<div className="home-panel-empty">No recent survey records are available.</div>) : (analytics.recentSurveys.map((survey) => (<article className="home-recent-survey" key={survey.collectionID}>
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
                      <span><b>{formatWholeNumber(survey.fishCount)}</b> fish</span>
                      <span><b>{survey.speciesCount.toLocaleString()}</b> species</span>
                    </div>
                  </article>)))}
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

          <ChartList rows={analytics.topSpecies} emptyText="No species totals are available."/>
        </article>

        <article className="home-panel home-map-panel">
          <div className="home-panel-heading">
            <div>
              <p>SURVEY COVERAGE</p>
              <h3>Sampled Sites</h3>
            </div>
          </div>

          <SiteDistributionMap points={analytics.sitePoints}/>
        </article>
      </section>
    </div>);
}
//# sourceMappingURL=HomeDashboard.js.map