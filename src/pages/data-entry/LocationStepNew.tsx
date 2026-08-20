import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { booleanPointInPolygon, point } from "@turf/turf";
import "leaflet/dist/leaflet.css";
import type { UserProfile } from "../../types/user";
import type { LocationRecord } from "../../types/location";
import { loadReferenceData } from "../../services/referenceDataService";
import { createSite, saveCurrentLocation } from "../../services/siteService";
import "../../styles/LocationStepNew.css";
import "../../styles/ExistingSiteStep.css";

type Props = {
  profile: UserProfile;
  savedLocation?: LocationRecord | null;
  onBack: () => void;
  onLocationSaved: (site: LocationRecord) => void;
};
type Mode = "downstream" | "upstream"; type Basemap = "dark" | "satellite";
const center: [number, number] = [37.55, -78.6];
const icon = (label: string, className: string) => L.divIcon({ className: `vadmaLeafletPin ${className}`, html: `<span>${label}</span>`, iconSize: [32,32], iconAnchor: [16,32] });
const downstreamIcon = icon("D", "vadmaLeafletPinDownstream"); const upstreamIcon = icon("U", "vadmaLeafletPinUpstream");

type GeoJsonFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  Record<string, unknown>
>;

const geoJsonCache: Record<string, GeoJsonFeatureCollection | undefined> = {};

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
  basin: {
    url: "/spatial/huc06.geojson",
    fields: [
      "HUC6Name",
      "HUC6_NAME",
      "BASIN_NAME",
      "BasinName",
      "RiverBasin",
      "NAME",
      "Name",
    ],
  },
  huc7: {
    url: "/spatial/huc08.geojson",
    fields: ["HUC8", "huc8", "HUC_8", "HUC08", "huc_8"],
  },
} as const;

async function loadGeoJson(url: string): Promise<GeoJsonFeatureCollection> {
  if (geoJsonCache[url]) return geoJsonCache[url]!;

  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Could not load ${url} (${response.status})`);
  }

  const data = (await response.json()) as GeoJsonFeatureCollection;
  geoJsonCache[url] = data;
  return data;
}

function getFirstPropertyValue(
  properties: Record<string, unknown> | null | undefined,
  fields: readonly string[],
): string {
  if (!properties) return "";

  for (const field of fields) {
    const exact = properties[field];
    if (exact !== null && exact !== undefined && String(exact).trim()) {
      return String(exact).trim();
    }

    const matchedKey = Object.keys(properties).find(
      (key) => key.toLowerCase() === field.toLowerCase(),
    );
    const matched = matchedKey ? properties[matchedKey] : undefined;
    if (matched !== null && matched !== undefined && String(matched).trim()) {
      return String(matched).trim();
    }
  }

  return "";
}

async function findPolygonValue(
  url: string,
  fields: readonly string[],
  lat: number,
  lng: number,
): Promise<string> {
  const geojson = await loadGeoJson(url);
  const clickedPoint = point([lng, lat]);

  const match = geojson.features.find((feature) => {
    if (
      !feature.geometry ||
      (feature.geometry.type !== "Polygon" &&
        feature.geometry.type !== "MultiPolygon")
    ) {
      return false;
    }

    return booleanPointInPolygon(
      clickedPoint,
      feature as GeoJSON.Feature<
        GeoJSON.Polygon | GeoJSON.MultiPolygon,
        Record<string, unknown>
      >,
    );
  });

  return getFirstPropertyValue(match?.properties, fields);
}


function ClickHandler({ mode, setPoint }: { mode: Mode; setPoint: (mode: Mode, lat: number, lng: number) => void }) { useMapEvents({ click: (e) => setPoint(mode, e.latlng.lat, e.latlng.lng) }); return null; }
function Fly({ target }: { target: [number, number] | null }) { const map = useMap(); useEffect(() => { if (target) map.flyTo(target, 16, {duration: 1.1}); }, [map, target]); return null; }
function makeSiteId(profile: UserProfile) { const raw = (profile.email.split("@")[0] || profile.displayName || "USER").replace(/[^a-z0-9]/gi, "").toUpperCase(); const d = new Date(); const pad=(n:number)=>String(n).padStart(2,"0"); return `SITE_${raw}_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${crypto.randomUUID().slice(0,4).toUpperCase()}`; }

export default function LocationStepNew({
  profile,
  savedLocation = null,
  onBack,
  onLocationSaved,
}: Props) {
  const [record, setRecord] = useState<LocationRecord>(() =>
    savedLocation?.EntryMode === "new"
      ? { ...savedLocation, EntryMode: "new" }
      : {
          EntryMode: "new",
          SiteID: makeSiteId(profile),
          SiteName: "",
          Waterbody: "",
          LatitudeDD: Number.NaN,
          LongitudeDD: Number.NaN,
          DownstreamLat: Number.NaN,
          DownstreamLong: Number.NaN,
          UpstreamLat: null,
          UpstreamLong: null,
          LocDescription: "",
          County: "",
          State: "",
          RiverBasin: "",
          HUC7: "",
          PhysiographicProvince: "",
          RoadName: "",
          RoadNumber: "",
          createdBy: profile.uid,
        },
  );
  const [mode,setMode]=useState<Mode>("downstream"); const [basemap,setBasemap]=useState<Basemap>("satellite"); const [message,setMessage]=useState(""); const [harvestingSpatial,setHarvestingSpatial]=useState(false); const [saving,setSaving]=useState(false); const [showAdditional,setShowAdditional]=useState(false); const [waterbodies,setWaterbodies]=useState<string[]>([]); const [waterbodySearch,setWaterbodySearch]=useState(
    savedLocation?.EntryMode === "new" ? savedLocation.Waterbody : "",
  ); const [open,setOpen]=useState(false); const [flyTarget,setFlyTarget]=useState<[number,number]|null>(null);
  useEffect(()=>{ loadReferenceData().then((data)=>{ setWaterbodies(data.generalLists.waterbody ?? data.generalLists.Waterbody ?? data.generalLists.Waterbodies ?? []); }).catch(()=>setMessage("Waterbody reference data could not be loaded.")); },[]);
  const deferred=useDeferredValue(waterbodySearch); const options=useMemo(()=>{ const q=deferred.trim().toLowerCase(); if(q.length<2)return[]; return waterbodies.filter((v)=>v.toLowerCase().includes(q)).sort((a,b)=>Number(!a.toLowerCase().startsWith(q))-Number(!b.toLowerCase().startsWith(q))).slice(0,20); },[deferred,waterbodies]);
  const downstream=Number.isFinite(record.DownstreamLat)&&Number.isFinite(record.DownstreamLong)?[record.DownstreamLat,record.DownstreamLong] as [number,number]:null; const upstream=Number.isFinite(record.UpstreamLat)&&Number.isFinite(record.UpstreamLong)?[record.UpstreamLat!,record.UpstreamLong!] as [number,number]:null;
  const update=<K extends keyof LocationRecord>(key:K,value:LocationRecord[K])=>setRecord((r)=>({...r,[key]:value}));
  async function harvestSpatialFields(lat: number, lng: number) {
    setHarvestingSpatial(true);
    setMessage("Harvesting county, state, river basin, physiographic province, and HUC 7…");

    try {
      const [county, stateValue, riverBasin, province, huc7] =
        await Promise.all([
          findPolygonValue(
            spatialLayers.county.url,
            spatialLayers.county.fields,
            lat,
            lng,
          ),
          findPolygonValue(
            spatialLayers.state.url,
            spatialLayers.state.fields,
            lat,
            lng,
          ),
          findPolygonValue(
            spatialLayers.basin.url,
            spatialLayers.basin.fields,
            lat,
            lng,
          ),
          findPolygonValue(
            spatialLayers.province.url,
            spatialLayers.province.fields,
            lat,
            lng,
          ),
          findPolygonValue(
            spatialLayers.huc7.url,
            spatialLayers.huc7.fields,
            lat,
            lng,
          ),
        ]);

      const stateAliases: Record<string, string> = {
        Virginia: "VA",
        Tennessee: "TN",
        "North Carolina": "NC",
        Maryland: "MD",
        "West Virginia": "WV",
        Kentucky: "KY",
        Pennsylvania: "PA",
        "District of Columbia": "DC",
      };
      const state = stateAliases[stateValue] ?? stateValue;

      setRecord((current) => ({
        ...current,
        County: county,
        State: state,
        RiverBasin: riverBasin,
        PhysiographicProvince: province,
        HUC7: huc7,
      }));

      const missing = [
        !county && "County",
        !state && "State",
        !riverBasin && "River Basin",
        !province && "Physiographic Province",
        !huc7 && "HUC 7",
      ].filter(Boolean);

      setMessage(
        missing.length
          ? `Coordinates saved. No polygon match was found for: ${missing.join(", ")}.`
          : "Spatial fields harvested from downstream coordinates.",
      );
    } catch (error) {
      console.error("Spatial field harvesting failed:", error);
      setMessage(
        "Coordinates were saved, but spatial files could not be loaded. Confirm the GeoJSON files are in public/spatial, then rebuild the app.",
      );
    } finally {
      setHarvestingSpatial(false);
    }
  }

  async function setPoint(which:Mode,lat:number,lng:number){
    if(which==="downstream") {
      const latitude = +lat.toFixed(6);
      const longitude = +lng.toFixed(6);
      setRecord((current) => ({
        ...current,
        LatitudeDD: latitude,
        LongitudeDD: longitude,
        DownstreamLat: latitude,
        DownstreamLong: longitude,
      }));
      await harvestSpatialFields(lat, lng);
    } else {
      setRecord(r=>({...r,UpstreamLat:+lat.toFixed(6),UpstreamLong:+lng.toFixed(6)}));
      setMessage("Upstream point set.");
    }
  }
  function gps(capture:boolean){ if(!navigator.geolocation){setMessage("GPS is not supported on this device.");return;} setMessage("Requesting current GPS location…"); navigator.geolocation.getCurrentPosition((p)=>{ const t:[number,number]=[p.coords.latitude,p.coords.longitude]; setFlyTarget(t); if(capture)void setPoint(mode,...t); else setMessage(`Map zoomed to current location. Accuracy approximately ${Math.round(p.coords.accuracy)} meters.`); },()=>setMessage("Unable to retrieve GPS location. Check location permission and try again."),{enableHighAccuracy:true,timeout:15000,maximumAge:0}); }
  async function save(){ if(!downstream){setMessage("A downstream coordinate is required before saving.");return;} if(!record.Waterbody.trim()||!record.SiteName.trim()){setMessage("Waterbody and Site Name are required before saving.");return;} setSaving(true); try{ const newSite: LocationRecord = { ...record, EntryMode: "new" }; await createSite(newSite); saveCurrentLocation(newSite); onLocationSaved(newSite); setMessage("New site saved and selected as the current location."); }catch{setMessage("The site could not be saved. Check your connection and Firestore permissions.");}finally{setSaving(false);} }

  const messageIsError =
    message.toLowerCase().includes("required") ||
    message.toLowerCase().includes("could not") ||
    message.toLowerCase().includes("unable");

  return (
    <main className="app existingSitePage locationNewStep">
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
              onClick={() => gps(false)}
              aria-label="Zoom to current location"
              title="Zoom to current location"
            >
              ⌖
            </button>
          </div>
        </div>

        <div className="coordinateModeRow newSiteCoordinateControls">
          <button
            type="button"
            className={`coordinateModeButton ${
              mode === "downstream" ? "active" : ""
            }`}
            onClick={() => setMode("downstream")}
          >
            Downstream Point
          </button>

          <button
            type="button"
            className={`coordinateModeButton ${
              mode === "upstream" ? "active" : ""
            }`}
            onClick={() => setMode("upstream")}
          >
            Upstream Point
          </button>

          <button
            type="button"
            className="secondaryAction"
            onClick={() => gps(true)}
          >
            Use Device GPS for{" "}
            {mode === "downstream" ? "Downstream" : "Upstream"}
          </button>
        </div>

        <div className="leafletShell modernLeafletMap">
          <MapContainer
            center={downstream || center}
            zoom={downstream ? 14 : 7}
            minZoom={6}
            maxZoom={18}
            className="newSiteLeafletMap"
            zoomControl={false}
            attributionControl={false}
          >
            {basemap === "dark" ? (
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            ) : (
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
            )}

            <ZoomControl position="bottomright" />

            <ClickHandler
              mode={mode}
              setPoint={(which, lat, lng) =>
                void setPoint(which, lat, lng)
              }
            />

            <Fly target={flyTarget} />

            {downstream && (
              <Marker position={downstream} icon={downstreamIcon} />
            )}

            {upstream && (
              <Marker position={upstream} icon={upstreamIcon} />
            )}
          </MapContainer>
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
            <input
              value={record.SiteID}
              disabled
              className="locked"
            />
          </label>
        </div>

        <div className="formGrid primarySite">
          <label className="waterbodyPickListField">
            <span>Waterbody *</span>

            <div className="waterbodyPickListControl">
              <input
                value={waterbodySearch}
                onChange={(event) => {
                  setWaterbodySearch(event.target.value);
                  update("Waterbody", event.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() =>
                  window.setTimeout(() => setOpen(false), 160)
                }
                placeholder="Type at least 2 characters…"
              />

              {open && (
                <div className="waterbodyPickListDropdown">
                  {waterbodySearch.trim().length < 2 ? (
                    <div className="waterbodyPickListEmpty">
                      Type at least 2 characters to search Waterbody values.
                    </div>
                  ) : options.length ? (
                    options.map((value) => (
                      <button
                        type="button"
                        key={value}
                        onMouseDown={(event) =>
                          event.preventDefault()
                        }
                        onClick={() => {
                          setWaterbodySearch(value);
                          update("Waterbody", value);
                          setOpen(false);
                        }}
                      >
                        {value}
                      </button>
                    ))
                  ) : (
                    <div className="waterbodyPickListEmpty">
                      No matches. Custom text is allowed.
                    </div>
                  )}
                </div>
              )}
            </div>
          </label>

          <label>
            <span>Site Name *</span>
            <input
              value={record.SiteName}
              onChange={(event) =>
                update("SiteName", event.target.value)
              }
              placeholder="West Shoreline"
            />
          </label>
        </div>

        <div className="formGrid coords">
          <label>
            Downstream Latitude *
            <input
              type="number"
              value={
                Number.isFinite(record.DownstreamLat)
                  ? record.DownstreamLat
                  : ""
              }
              onChange={(event) => {
                const value = Number(event.target.value);
                setRecord((current) => ({
                  ...current,
                  LatitudeDD: value,
                  DownstreamLat: value,
                }));
              }}
            />
          </label>

          <label>
            Downstream Longitude *
            <input
              type="number"
              value={
                Number.isFinite(record.DownstreamLong)
                  ? record.DownstreamLong
                  : ""
              }
              onChange={(event) => {
                const value = Number(event.target.value);
                setRecord((current) => ({
                  ...current,
                  LongitudeDD: value,
                  DownstreamLong: value,
                }));
              }}
            />
          </label>

          <label>
            Upstream Latitude
            <input
              type="number"
              value={record.UpstreamLat ?? ""}
              onChange={(event) =>
                update(
                  "UpstreamLat",
                  event.target.value
                    ? Number(event.target.value)
                    : null,
                )
              }
            />
          </label>

          <label>
            Upstream Longitude
            <input
              type="number"
              value={record.UpstreamLong ?? ""}
              onChange={(event) =>
                update(
                  "UpstreamLong",
                  event.target.value
                    ? Number(event.target.value)
                    : null,
                )
              }
            />
          </label>
        </div>

        <div className="formGrid textAreas">
          <label>
            Location Description
            <textarea
              value={record.LocDescription ?? ""}
              onChange={(event) =>
                update("LocDescription", event.target.value)
              }
              placeholder="Describe the sampling reach or recognizable landmarks."
            />
          </label>
        </div>

        <button
          type="button"
          className="additionalToggle"
          onClick={() => setShowAdditional((value) => !value)}
        >
          {showAdditional
            ? "Hide Additional Fields"
            : "Show Additional Fields"}
        </button>

        {showAdditional && (
          <div className="additionalFields">
            <div className="formGrid spatialGrid">
              {(
                [
                  "County",
                  "State",
                  "RiverBasin",
                  "HUC7",
                  "PhysiographicProvince",
                  "RoadName",
                  "RoadNumber",
                ] as const
              ).map((field) => (
                <label key={field}>
                  {field === "PhysiographicProvince"
                    ? "Physiographic Province"
                    : field === "RiverBasin"
                      ? "River Basin"
                      : field === "HUC7"
                        ? "HUC 7"
                        : field === "RoadName"
                          ? "Road Name"
                          : field === "RoadNumber"
                            ? "Road Number"
                            : field}
                  <input
                    value={(record[field] as string) || ""}
                    onChange={(event) =>
                      update(field, event.target.value)
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      {message && (
        <div
          className={`locationPageMessage ${
            messageIsError ? "errorBanner" : "okBanner"
          }`}
        >
          {message}
        </div>
      )}

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
            <button
              type="button"
              className="secondaryActionBtn"
              onClick={() => {
                setRecord({
                  EntryMode: "new",
                  SiteID: makeSiteId(profile),
                  SiteName: "",
                  Waterbody: "",
                  LatitudeDD: Number.NaN,
                  LongitudeDD: Number.NaN,
                  DownstreamLat: Number.NaN,
                  DownstreamLong: Number.NaN,
                  UpstreamLat: null,
                  UpstreamLong: null,
                  LocDescription: "",
                  County: "",
                  State: "",
                  RiverBasin: "",
                  HUC7: "",
                  PhysiographicProvince: "",
                  RoadName: "",
                  RoadNumber: "",
                  createdBy: profile.uid,
                });
                setWaterbodySearch("");
                setMessage("");
              }}
            >
              Clear Form
            </button>

            <button
              type="button"
              className="primaryActionBtn"
              onClick={() => void save()}
              disabled={saving || harvestingSpatial}
            >
              {saving
                ? "Saving…"
                : harvestingSpatial
                  ? "Harvesting Spatial Data…"
                  : "Save Location and Continue"}
            </button>
          </div>
        </div>
      </section>

      <div
        className={`mobileStepFooter mobileStepFooterSplit ${
          message ? "mobileStepFooterWithMessage" : ""
        }`}
      >
        {message && (
          <div
            className={`mobileStepFooterMessage ${
              messageIsError
                ? "mobileStepFooterMessageError"
                : "mobileStepFooterMessageOk"
            }`}
            role={messageIsError ? "alert" : "status"}
          >
            {message}
          </div>
        )}

        <button
          type="button"
          className="mobileStepSecondaryAction"
          onClick={() => {
            setRecord({
              EntryMode: "new",
              SiteID: makeSiteId(profile),
              SiteName: "",
              Waterbody: "",
              LatitudeDD: Number.NaN,
              LongitudeDD: Number.NaN,
              DownstreamLat: Number.NaN,
              DownstreamLong: Number.NaN,
              UpstreamLat: null,
              UpstreamLong: null,
              LocDescription: "",
              County: "",
              State: "",
              RiverBasin: "",
              HUC7: "",
              PhysiographicProvince: "",
              RoadName: "",
              RoadNumber: "",
              createdBy: profile.uid,
            });
            setWaterbodySearch("");
            setMessage("");
          }}
        >
          Clear Form
        </button>

        <button
          type="button"
          className="mobileStepPrimaryAction"
          onClick={() => void save()}
          disabled={saving || harvestingSpatial}
        >
          {saving
            ? "Saving…"
            : harvestingSpatial
              ? "Harvesting…"
              : "Save Location"}
        </button>
      </div>
    </main>
  );
}
