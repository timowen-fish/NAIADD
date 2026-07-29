"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SiteConditionsPage;
const react_1 = require("react");
const CurrentConditions_1 = __importDefault(require("../components/CurrentConditions"));
const siteService_1 = require("../services/siteService");
function toDashboardSite(site) {
    const lat = Number(site.DownstreamLat);
    const lng = Number(site.DownstreamLong);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }
    const siteID = String(site.SiteID ?? "").trim();
    const siteName = String(site.SiteName ?? "").trim();
    const waterbody = String(site.Waterbody ?? "").trim();
    const locationDesc = String(site.LocationDesc ?? "").trim();
    const county = String(site.County ?? "").trim();
    const label = [waterbody, siteName].filter(Boolean).join(" — ") || siteID;
    return {
        key: siteID || `${lat.toFixed(6)}_${lng.toFixed(6)}`,
        label,
        siteID,
        waterbody,
        siteName,
        locationDesc,
        county,
        searchText: [
            siteID,
            waterbody,
            siteName,
            locationDesc,
            county,
            site.State,
            site.PhysiographicProvince,
            site.HUC6,
            site.HUC8,
        ]
            .filter(Boolean)
            .join(" "),
        lat,
        lng,
    };
}
function SiteConditionsPage() {
    const [sites, setSites] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [error, setError] = (0, react_1.useState)("");
    (0, react_1.useEffect)(() => {
        let cancelled = false;
        async function loadSites() {
            try {
                setLoading(true);
                setError("");
                const nextSites = await (0, siteService_1.listSites)();
                if (!cancelled) {
                    setSites(nextSites);
                }
            }
            catch (loadError) {
                if (!cancelled) {
                    setError(loadError instanceof Error
                        ? loadError.message
                        : "Unable to load existing VADMA sites.");
                }
            }
            finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }
        void loadSites();
        return () => {
            cancelled = true;
        };
    }, []);
    const dashboardSites = (0, react_1.useMemo)(() => sites
        .map(toDashboardSite)
        .filter((site) => site !== null), [sites]);
    return (<div className="home-dashboard-page site-conditions-page">
      <section className="home-dashboard-intro">
        <div>
          <p className="home-eyebrow">LIVE FIELD INFORMATION</p>
          <h2>Site Conditions</h2>
          <p className="home-dashboard-datetime">
            Select an existing sampling site or click anywhere on the map.
          </p>
        </div>
      </section>

      {loading ? (<div className="app-loading">Loading existing sites…</div>) : null}

      {error ? (<div className="site-conditions-warning" role="status">
          {error} You can still click the map to load conditions for a point.
        </div>) : null}

      {!loading ? <CurrentConditions_1.default sites={dashboardSites}/> : null}
    </div>);
}
//# sourceMappingURL=SiteConditionsPage.js.map