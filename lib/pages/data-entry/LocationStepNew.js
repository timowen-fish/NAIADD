"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = LocationStepNew;
const react_1 = require("react");
const react_leaflet_1 = require("react-leaflet");
const leaflet_1 = __importDefault(require("leaflet"));
const turf_1 = require("@turf/turf");
require("leaflet/dist/leaflet.css");
const referenceDataService_1 = require("../../services/referenceDataService");
const siteService_1 = require("../../services/siteService");
require("../../styles/LocationStepNew.css");
require("../../styles/ExistingSiteStep.css");
const center = [37.55, -78.6];
const icon = (label, className) => leaflet_1.default.divIcon({ className: `vadmaLeafletPin ${className}`, html: `<span>${label}</span>`, iconSize: [32, 32], iconAnchor: [16, 32] });
const downstreamIcon = icon("D", "vadmaLeafletPinDownstream");
const upstreamIcon = icon("U", "vadmaLeafletPinUpstream");
const geoJsonCache = {};
const spatialLayers = {
    county: {
        url: "/spatial/counties.geojson",
        fields: ["County_Nam", "County", "COUNTY", "NAME", "Name", "NAMELSAD"],
    },
    state: {
        url: "/spatial/states.geojson",
        fields: ["StateName", "STATE_NAME", "STATE", "NAME", "Name", "STUSPS"],
    },
    province: {
        url: "/spatial/physiographic_provinces.geojson",
        fields: ["PROVINCE", "Province", "PHYS_PROV", "NAME", "Name"],
    },
    huc6: {
        url: "/spatial/huc06.geojson",
        fields: ["HUC6Name", "HUC6", "huc6", "NAME", "Name", "BASIN_NAME"],
    },
    huc8: {
        url: "/spatial/huc08.geojson",
        fields: ["HUC8Name", "HUC8", "huc8", "NAME", "Name", "SUBBASIN"],
    },
};
async function loadGeoJson(url) {
    if (geoJsonCache[url])
        return geoJsonCache[url];
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
        throw new Error(`Could not load ${url} (${response.status})`);
    }
    const data = (await response.json());
    geoJsonCache[url] = data;
    return data;
}
function getFirstPropertyValue(properties, fields) {
    if (!properties)
        return "";
    for (const field of fields) {
        const exact = properties[field];
        if (exact !== null && exact !== undefined && String(exact).trim()) {
            return String(exact).trim();
        }
        const matchedKey = Object.keys(properties).find((key) => key.toLowerCase() === field.toLowerCase());
        const matched = matchedKey ? properties[matchedKey] : undefined;
        if (matched !== null && matched !== undefined && String(matched).trim()) {
            return String(matched).trim();
        }
    }
    return "";
}
async function findPolygonValue(url, fields, lat, lng) {
    const geojson = await loadGeoJson(url);
    const clickedPoint = (0, turf_1.point)([lng, lat]);
    const match = geojson.features.find((feature) => {
        if (!feature.geometry ||
            (feature.geometry.type !== "Polygon" &&
                feature.geometry.type !== "MultiPolygon")) {
            return false;
        }
        return (0, turf_1.booleanPointInPolygon)(clickedPoint, feature);
    });
    return getFirstPropertyValue(match?.properties, fields);
}
function ClickHandler({ mode, setPoint }) { (0, react_leaflet_1.useMapEvents)({ click: (e) => setPoint(mode, e.latlng.lat, e.latlng.lng) }); return null; }
function Fly({ target }) { const map = (0, react_leaflet_1.useMap)(); (0, react_1.useEffect)(() => { if (target)
    map.flyTo(target, 16, { duration: 1.1 }); }, [map, target]); return null; }
function makeSiteId(profile) { const raw = (profile.email.split("@")[0] || profile.displayName || "USER").replace(/[^a-z0-9]/gi, "").toUpperCase(); const d = new Date(); const pad = (n) => String(n).padStart(2, "0"); return `SITE_${raw}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${crypto.randomUUID().slice(0, 4).toUpperCase()}`; }
function LocationStepNew({ profile, onBack, onLocationSaved }) {
    const [record, setRecord] = (0, react_1.useState)({ SiteID: makeSiteId(profile), SiteName: "", Waterbody: "", DownstreamLat: NaN, DownstreamLong: NaN, UpstreamLat: null, UpstreamLong: null, PrivatePublic: "Public", County: "", State: "", PhysiographicProvince: "", HUC6: "", HUC8: "", createdBy: profile.uid });
    const [mode, setMode] = (0, react_1.useState)("downstream");
    const [basemap, setBasemap] = (0, react_1.useState)("satellite");
    const [message, setMessage] = (0, react_1.useState)("");
    const [harvestingSpatial, setHarvestingSpatial] = (0, react_1.useState)(false);
    const [saving, setSaving] = (0, react_1.useState)(false);
    const [showAdditional, setShowAdditional] = (0, react_1.useState)(false);
    const [waterbodies, setWaterbodies] = (0, react_1.useState)([]);
    const [waterbodySearch, setWaterbodySearch] = (0, react_1.useState)("");
    const [open, setOpen] = (0, react_1.useState)(false);
    const [flyTarget, setFlyTarget] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => { (0, referenceDataService_1.loadReferenceData)().then((data) => { setWaterbodies(data.generalLists.waterbody ?? data.generalLists.Waterbody ?? data.generalLists.Waterbodies ?? []); }).catch(() => setMessage("Waterbody reference data could not be loaded.")); }, []);
    const deferred = (0, react_1.useDeferredValue)(waterbodySearch);
    const options = (0, react_1.useMemo)(() => { const q = deferred.trim().toLowerCase(); if (q.length < 2)
        return []; return waterbodies.filter((v) => v.toLowerCase().includes(q)).sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q))).slice(0, 20); }, [deferred, waterbodies]);
    const downstream = Number.isFinite(record.DownstreamLat) && Number.isFinite(record.DownstreamLong) ? [record.DownstreamLat, record.DownstreamLong] : null;
    const upstream = Number.isFinite(record.UpstreamLat) && Number.isFinite(record.UpstreamLong) ? [record.UpstreamLat, record.UpstreamLong] : null;
    const update = (key, value) => setRecord((r) => ({ ...r, [key]: value }));
    async function harvestSpatialFields(lat, lng) {
        setHarvestingSpatial(true);
        setMessage("Harvesting county, state, physiographic province, HUC6, and HUC8…");
        try {
            const [county, state, province, huc6, huc8] = await Promise.all([
                findPolygonValue(spatialLayers.county.url, spatialLayers.county.fields, lat, lng),
                findPolygonValue(spatialLayers.state.url, spatialLayers.state.fields, lat, lng),
                findPolygonValue(spatialLayers.province.url, spatialLayers.province.fields, lat, lng),
                findPolygonValue(spatialLayers.huc6.url, spatialLayers.huc6.fields, lat, lng),
                findPolygonValue(spatialLayers.huc8.url, spatialLayers.huc8.fields, lat, lng),
            ]);
            setRecord((current) => ({
                ...current,
                County: county,
                State: state,
                PhysiographicProvince: province,
                HUC6: huc6,
                HUC8: huc8,
            }));
            const missing = [
                !county && "County",
                !state && "State",
                !province && "Physiographic Province",
                !huc6 && "HUC6",
                !huc8 && "HUC8",
            ].filter(Boolean);
            setMessage(missing.length
                ? `Coordinates saved. No polygon match was found for: ${missing.join(", ")}.`
                : "Spatial fields harvested from downstream coordinates.");
        }
        catch (error) {
            console.error("Spatial field harvesting failed:", error);
            setMessage("Coordinates were saved, but spatial files could not be loaded. Confirm the GeoJSON files are in public/spatial, then rebuild the app.");
        }
        finally {
            setHarvestingSpatial(false);
        }
    }
    async function setPoint(which, lat, lng) {
        if (which === "downstream") {
            setRecord(r => ({ ...r, DownstreamLat: +lat.toFixed(6), DownstreamLong: +lng.toFixed(6) }));
            await harvestSpatialFields(lat, lng);
        }
        else {
            setRecord(r => ({ ...r, UpstreamLat: +lat.toFixed(6), UpstreamLong: +lng.toFixed(6) }));
            setMessage("Upstream point set.");
        }
    }
    function gps(capture) { if (!navigator.geolocation) {
        setMessage("GPS is not supported on this device.");
        return;
    } setMessage("Requesting current GPS location…"); navigator.geolocation.getCurrentPosition((p) => { const t = [p.coords.latitude, p.coords.longitude]; setFlyTarget(t); if (capture)
        void setPoint(mode, ...t);
    else
        setMessage(`Map zoomed to current location. Accuracy approximately ${Math.round(p.coords.accuracy)} meters.`); }, () => setMessage("Unable to retrieve GPS location. Check location permission and try again."), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); }
    async function save() { if (!downstream) {
        setMessage("A downstream coordinate is required before saving.");
        return;
    } if (!record.Waterbody.trim() || !record.SiteName.trim()) {
        setMessage("Waterbody and Site Name are required before saving.");
        return;
    } setSaving(true); try {
        await (0, siteService_1.createSite)(record);
        (0, siteService_1.saveCurrentLocation)(record);
        onLocationSaved(record);
        setMessage("New site saved and selected as the current location.");
    }
    catch {
        setMessage("The site could not be saved. Check your connection and Firestore permissions.");
    }
    finally {
        setSaving(false);
    } }
    const messageIsError = message.toLowerCase().includes("required") ||
        message.toLowerCase().includes("could not") ||
        message.toLowerCase().includes("unable");
    return (<main className="app existingSitePage locationNewStep">
      <button type="button" className="backButton" onClick={onBack}>
        ← Back to Location Options
      </button>

      <section className="stepHeader">
        <div className="stepIcon">📍</div>

        <div>
          <p className="stepKicker">Create New Sampling Site</p>
          <h1>New Site Location</h1>
          <p>
            Place the downstream and optional upstream points, then enter the
            identifying information for the new site.
          </p>
        </div>
      </section>

      <section className="existingSiteCard newLocCard mapCard">
        <div className="mapHeaderRow">
          <div>
            <h2>Site Map</h2>
            <p className="thinText">
              Current placement mode:{" "}
              <strong>
                {mode === "downstream"
            ? "Downstream Point"
            : "Upstream Point"}
              </strong>
            </p>
          </div>

          <div className="basemapOptionsGroup" aria-label="Basemap Options">
            <span className="basemapOptionsLabel">Basemap Options</span>

            <button type="button" className={`basemapOptionButton ${basemap === "dark" ? "active" : ""}`} onClick={() => setBasemap("dark")}>
              Dark
            </button>

            <button type="button" className={`basemapOptionButton ${basemap === "satellite" ? "active" : ""}`} onClick={() => setBasemap("satellite")}>
              Satellite
            </button>

            <button type="button" className="basemapOptionButton" onClick={() => gps(false)} aria-label="Zoom to current location" title="Zoom to current location">
              ⌖
            </button>
          </div>
        </div>

        <div className="coordinateModeRow newSiteCoordinateControls">
          <button type="button" className={`coordinateModeButton ${mode === "downstream" ? "active" : ""}`} onClick={() => setMode("downstream")}>
            Downstream Point
          </button>

          <button type="button" className={`coordinateModeButton ${mode === "upstream" ? "active" : ""}`} onClick={() => setMode("upstream")}>
            Upstream Point
          </button>

          <button type="button" className="secondaryAction" onClick={() => gps(true)}>
            Use Device GPS for{" "}
            {mode === "downstream" ? "Downstream" : "Upstream"}
          </button>
        </div>

        <div className="leafletShell modernLeafletMap">
          <react_leaflet_1.MapContainer center={downstream || center} zoom={downstream ? 14 : 7} minZoom={6} maxZoom={18} className="newSiteLeafletMap" zoomControl={false} attributionControl={false}>
            {basemap === "dark" ? (<react_leaflet_1.TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"/>) : (<react_leaflet_1.TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"/>)}

            <react_leaflet_1.ZoomControl position="bottomright"/>

            <ClickHandler mode={mode} setPoint={(which, lat, lng) => void setPoint(which, lat, lng)}/>

            <Fly target={flyTarget}/>

            {downstream && (<react_leaflet_1.Marker position={downstream} icon={downstreamIcon}/>)}

            {upstream && (<react_leaflet_1.Marker position={upstream} icon={upstreamIcon}/>)}
          </react_leaflet_1.MapContainer>
        </div>

        <p className="mapHint">
          Click the map to assign the selected coordinate type. The downstream
          point is required and is used to harvest the spatial fields.
        </p>
      </section>

      <section className="existingSiteCard newLocCard">
        <div className="cardTitleRow">
          <div>
            <h2>Site Information</h2>
            <p className="thinText">
              Waterbody, site name, and downstream coordinates are required.
            </p>
          </div>
        </div>

        <div className="formGrid primarySite">
          <label>
            Site ID
            <input value={record.SiteID} disabled className="locked"/>
          </label>

          <label>
            Public / Private
            <select value={record.PrivatePublic} onChange={(event) => update("PrivatePublic", event.target.value)}>
              <option>Public</option>
              <option>Private</option>
            </select>
          </label>
        </div>

        <div className="formGrid primarySite">
          <label className="waterbodyPickListField">
            <span>Waterbody *</span>

            <div className="waterbodyPickListControl">
              <input value={waterbodySearch} onChange={(event) => {
            setWaterbodySearch(event.target.value);
            update("Waterbody", event.target.value);
            setOpen(true);
        }} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 160)} placeholder="Type at least 2 characters…"/>

              {open && (<div className="waterbodyPickListDropdown">
                  {waterbodySearch.trim().length < 2 ? (<div className="waterbodyPickListEmpty">
                      Type at least 2 characters to search Waterbody values.
                    </div>) : options.length ? (options.map((value) => (<button type="button" key={value} onMouseDown={(event) => event.preventDefault()} onClick={() => {
                    setWaterbodySearch(value);
                    update("Waterbody", value);
                    setOpen(false);
                }}>
                        {value}
                      </button>))) : (<div className="waterbodyPickListEmpty">
                      No matches. Custom text is allowed.
                    </div>)}
                </div>)}
            </div>
          </label>

          <label>
            <span>Site Name *</span>
            <input value={record.SiteName} onChange={(event) => update("SiteName", event.target.value)} placeholder="West Shoreline"/>
          </label>
        </div>

        <div className="formGrid coords">
          <label>
            Downstream Latitude *
            <input type="number" value={Number.isFinite(record.DownstreamLat)
            ? record.DownstreamLat
            : ""} onChange={(event) => update("DownstreamLat", Number(event.target.value))}/>
          </label>

          <label>
            Downstream Longitude *
            <input type="number" value={Number.isFinite(record.DownstreamLong)
            ? record.DownstreamLong
            : ""} onChange={(event) => update("DownstreamLong", Number(event.target.value))}/>
          </label>

          <label>
            Upstream Latitude
            <input type="number" value={record.UpstreamLat ?? ""} onChange={(event) => update("UpstreamLat", event.target.value
            ? Number(event.target.value)
            : null)}/>
          </label>

          <label>
            Upstream Longitude
            <input type="number" value={record.UpstreamLong ?? ""} onChange={(event) => update("UpstreamLong", event.target.value
            ? Number(event.target.value)
            : null)}/>
          </label>
        </div>

        <div className="formGrid textAreas">
          <label>
            Location Description
            <textarea value={record.LocationDesc ?? ""} onChange={(event) => update("LocationDesc", event.target.value)} placeholder="Describe the sampling reach or recognizable landmarks."/>
          </label>

          <label>
            Access Information
            <textarea value={record.AccessInfo ?? ""} onChange={(event) => update("AccessInfo", event.target.value)} placeholder="Parking, gate, landowner, or access instructions."/>
          </label>
        </div>

        <button type="button" className="additionalToggle" onClick={() => setShowAdditional((value) => !value)}>
          {showAdditional
            ? "Hide Additional Fields"
            : "Show Additional Fields"}
        </button>

        {showAdditional && (<div className="additionalFields">
            <div className="formGrid spatialGrid">
              {[
                "County",
                "State",
                "PhysiographicProvince",
                "HUC6",
                "HUC8",
            ].map((field) => (<label key={field}>
                  {field === "PhysiographicProvince"
                    ? "Physiographic Province"
                    : field}
                  <input value={record[field] || ""} onChange={(event) => update(field, event.target.value)}/>
                </label>))}
            </div>
          </div>)}
      </section>

      {message && (<div className={`locationPageMessage ${messageIsError ? "errorBanner" : "okBanner"}`}>
          {message}
        </div>)}

      <section className="existingSiteCard selectedSiteCard">
        <div className="mapHeaderRow">
          <div>
            <h2>Save New Site</h2>
            <p className="thinText">
              Saving creates the site and selects it as the current location
              for the survey.
            </p>
          </div>

          <div className="actionBar desktopStepActions">
            <button type="button" className="secondaryActionBtn" onClick={() => {
            setRecord({
                SiteID: makeSiteId(profile),
                SiteName: "",
                Waterbody: "",
                DownstreamLat: NaN,
                DownstreamLong: NaN,
                UpstreamLat: null,
                UpstreamLong: null,
                PrivatePublic: "Public",
                County: "",
                State: "",
                PhysiographicProvince: "",
                HUC6: "",
                HUC8: "",
                createdBy: profile.uid,
            });
            setWaterbodySearch("");
            setMessage("");
        }}>
              Clear Form
            </button>

            <button type="button" className="primaryActionBtn" onClick={() => void save()} disabled={saving || harvestingSpatial}>
              {saving
            ? "Saving…"
            : harvestingSpatial
                ? "Harvesting Spatial Data…"
                : "Save Location and Continue"}
            </button>
          </div>
        </div>
      </section>

      <div className={`mobileStepFooter mobileStepFooterSplit ${message ? "mobileStepFooterWithMessage" : ""}`}>
        {message && (<div className={`mobileStepFooterMessage ${messageIsError
                ? "mobileStepFooterMessageError"
                : "mobileStepFooterMessageOk"}`} role={messageIsError ? "alert" : "status"}>
            {message}
          </div>)}

        <button type="button" className="mobileStepSecondaryAction" onClick={() => {
            setRecord({
                SiteID: makeSiteId(profile),
                SiteName: "",
                Waterbody: "",
                DownstreamLat: NaN,
                DownstreamLong: NaN,
                UpstreamLat: null,
                UpstreamLong: null,
                PrivatePublic: "Public",
                County: "",
                State: "",
                PhysiographicProvince: "",
                HUC6: "",
                HUC8: "",
                createdBy: profile.uid,
            });
            setWaterbodySearch("");
            setMessage("");
        }}>
          Clear Form
        </button>

        <button type="button" className="mobileStepPrimaryAction" onClick={() => void save()} disabled={saving || harvestingSpatial}>
          {saving
            ? "Saving…"
            : harvestingSpatial
                ? "Harvesting…"
                : "Save Location"}
        </button>
      </div>
    </main>);
}
//# sourceMappingURL=LocationStepNew.js.map