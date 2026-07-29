import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "../firebase";
import type { LocationRecord } from "../types/location";
import { readSnapshotRows } from "./snapshotService";

const SITES_COLLECTION = "sites";
const CURRENT_LOCATION_KEY = "naiadd.currentLocation";
const SITE_CACHE_KEY = "naiadd.sites.cache.v2";

const SNAPSHOT_SITE_COLUMNS = [
  "SiteID",
  "SiteID_AccessDB",
  "SiteID_Previous",
  "Site_Id",
  "siteID",
  "siteId",
  "NewSiteID",
  "savedSiteID",
  "SiteName",
  "Site_Name",
  "siteName",
  "savedSiteName",
  "Locality",
  "Station",
  "StationName",
  "LocationName",
  "Waterbody",
  "waterbody",
  "Stream",
  "stream",
  "WaterbodyName",
  "County",
  "county",
  "CountyName",
  "State",
  "RiverBasin",
  "Basin",
  "HUC7",
  "HUC8",
  "PhysiographicProvince",
  "RoadName",
  "RoadNumber",
  "LocDescription",
  "LocationDesc",
  "locationDesc",
  "LocationDescription",
  "Description",
  "LatitudeDD",
  "LongitudeDD",
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
  "UpstreamLat",
  "upstreamLat",
  "UpstreamLatitude",
  "UpstreamLong",
  "upstreamLong",
  "UpstreamLongitude",
] as const;

type SnapshotRow = Record<string, unknown>;

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function finiteOrNull(value: unknown): number | null {
  const parsed = asNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getValue(
  row: SnapshotRow,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
  }

  const keyMap = new Map(
    Object.keys(row).map((key) => [key.toLowerCase(), key]),
  );

  for (const key of keys) {
    const matchedKey = keyMap.get(key.toLowerCase());

    if (matchedKey) {
      return row[matchedKey];
    }
  }

  return undefined;
}

function getString(
  row: SnapshotRow,
  keys: readonly string[],
): string {
  return asString(getValue(row, keys));
}

function getNumber(
  row: SnapshotRow,
  keys: readonly string[],
): number {
  return asNumber(getValue(row, keys));
}

function isVirginiaCoordinate(
  latitude: number,
  longitude: number,
): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 36.4 &&
    latitude <= 39.6 &&
    longitude >= -83.8 &&
    longitude <= -75.0
  );
}

function fallbackSiteId(
  latitude: number,
  longitude: number,
): string {
  const latPart = Math.round(latitude * 1_000_000);
  const longPart = Math.round(longitude * 1_000_000);

  return `SITE_${Math.abs(latPart * 31 + longPart)}`;
}

function normalizeState(value: string): string {
  const aliases: Record<string, string> = {
    Virginia: "VA",
    Tennessee: "TN",
    "North Carolina": "NC",
    Maryland: "MD",
    "West Virginia": "WV",
    Kentucky: "KY",
    Pennsylvania: "PA",
    "District of Columbia": "DC",
  };

  return aliases[value] ?? value;
}

function normalizeLocationRecord(
  raw: SnapshotRow,
  forcedSiteId?: string,
): LocationRecord | null {
  const waterbody = getString(raw, [
    "Waterbody",
    "waterbody",
    "Stream",
    "stream",
    "WaterbodyName",
  ]);

  const sourceSiteId = getString(raw, [
    "SiteID",
    "Site_Id",
    "siteID",
    "siteId",
    "NewSiteID",
    "savedSiteID",
  ]);

  const siteName =
    getString(raw, [
      "SiteName",
      "Site_Name",
      "siteName",
      "savedSiteName",
      "Locality",
      "Station",
      "StationName",
      "LocationName",
    ]) ||
    waterbody ||
    sourceSiteId ||
    forcedSiteId ||
    "";

  const downstreamLat = getNumber(raw, [
    "DownstreamLat",
    "downstreamLat",
    "DownstreamLatitude",
    "LatitudeDD",
    "Latitude",
    "latitude",
    "Lat",
    "lat",
    "Lat_Decimal_Degree",
    "Y",
    "y",
  ]);

  const downstreamLong = getNumber(raw, [
    "DownstreamLong",
    "downstreamLong",
    "DownstreamLongitude",
    "LongitudeDD",
    "Longitude",
    "longitude",
    "Long",
    "long",
    "Lng",
    "lng",
    "Long_Decimal_Degree",
    "X",
    "x",
  ]);

  if (!isVirginiaCoordinate(downstreamLat, downstreamLong)) {
    return null;
  }

  const siteId =
    forcedSiteId ||
    sourceSiteId ||
    fallbackSiteId(downstreamLat, downstreamLong);

  if (!siteId || !siteName) {
    return null;
  }

  return {
    SiteID: siteId,
    SiteID_AccessDB: getString(raw, ["SiteID_AccessDB"]),
    SiteID_Previous: getString(raw, ["SiteID_Previous"]),
    SiteName: siteName,
    Waterbody: waterbody,
    LatitudeDD: downstreamLat,
    LongitudeDD: downstreamLong,
    DownstreamLat: downstreamLat,
    DownstreamLong: downstreamLong,
    UpstreamLat: finiteOrNull(
      getValue(raw, [
        "UpstreamLat",
        "upstreamLat",
        "UpstreamLatitude",
      ]),
    ),
    UpstreamLong: finiteOrNull(
      getValue(raw, [
        "UpstreamLong",
        "upstreamLong",
        "UpstreamLongitude",
      ]),
    ),
    LocDescription: getString(raw, [
      "LocDescription",
      "LocationDesc",
      "locationDesc",
      "LocationDescription",
      "Description",
    ]),
    County: getString(raw, ["County", "county", "CountyName"]),
    State: normalizeState(getString(raw, ["State"])),
    RiverBasin: getString(raw, ["RiverBasin", "Basin"]),
    HUC7: getString(raw, ["HUC7", "HUC8"]),
    PhysiographicProvince: getString(raw, [
      "PhysiographicProvince",
    ]),
    RoadName: getString(raw, ["RoadName"]),
    RoadNumber: getString(raw, ["RoadNumber"]),
    createdBy: getString(raw, ["createdBy"]),
  };
}

function mergeLocationFields(
  existing: LocationRecord,
  candidate: LocationRecord,
): LocationRecord {
  return {
    ...existing,
    SiteName: existing.SiteName || candidate.SiteName,
    Waterbody: existing.Waterbody || candidate.Waterbody,
    LatitudeDD: Number.isFinite(existing.LatitudeDD)
      ? existing.LatitudeDD
      : candidate.LatitudeDD,
    LongitudeDD: Number.isFinite(existing.LongitudeDD)
      ? existing.LongitudeDD
      : candidate.LongitudeDD,
    DownstreamLat: Number.isFinite(existing.DownstreamLat)
      ? existing.DownstreamLat
      : candidate.DownstreamLat,
    DownstreamLong: Number.isFinite(existing.DownstreamLong)
      ? existing.DownstreamLong
      : candidate.DownstreamLong,
    UpstreamLat:
      existing.UpstreamLat !== null &&
      existing.UpstreamLat !== undefined &&
      Number.isFinite(existing.UpstreamLat)
        ? existing.UpstreamLat
        : candidate.UpstreamLat,
    UpstreamLong:
      existing.UpstreamLong !== null &&
      existing.UpstreamLong !== undefined &&
      Number.isFinite(existing.UpstreamLong)
        ? existing.UpstreamLong
        : candidate.UpstreamLong,
    SiteID_AccessDB:
      existing.SiteID_AccessDB || candidate.SiteID_AccessDB,
    SiteID_Previous:
      existing.SiteID_Previous || candidate.SiteID_Previous,
    LocDescription:
      existing.LocDescription || candidate.LocDescription,
    County: existing.County || candidate.County,
    State: existing.State || candidate.State,
    RiverBasin: existing.RiverBasin || candidate.RiverBasin,
    HUC7: existing.HUC7 || candidate.HUC7,
    PhysiographicProvince:
      existing.PhysiographicProvince ||
      candidate.PhysiographicProvince,
    RoadName: existing.RoadName || candidate.RoadName,
    RoadNumber: existing.RoadNumber || candidate.RoadNumber,
    createdBy: existing.createdBy || candidate.createdBy,
  };
}

function snapshotRowsToSites(
  rows: SnapshotRow[],
): LocationRecord[] {
  const sitesById = new Map<string, LocationRecord>();

  for (const row of rows) {
    const candidate = normalizeLocationRecord(row);
    if (!candidate) continue;

    const existing = sitesById.get(candidate.SiteID);

    sitesById.set(
      candidate.SiteID,
      existing
        ? mergeLocationFields(existing, candidate)
        : candidate,
    );
  }

  return Array.from(sitesById.values());
}

function mergeSites(
  snapshotSites: LocationRecord[],
  firestoreSites: LocationRecord[],
): LocationRecord[] {
  const merged = new Map<string, LocationRecord>();

  for (const site of snapshotSites) {
    merged.set(site.SiteID, site);
  }

  /*
   * Firestore contains newly created NAIADD sites. Let those records replace
   * an older snapshot record with the same SiteID.
   */
  for (const site of firestoreSites) {
    merged.set(site.SiteID, site);
  }

  return Array.from(merged.values()).sort((left, right) => {
    const waterbodyCompare = left.Waterbody.localeCompare(
      right.Waterbody,
    );

    if (waterbodyCompare !== 0) {
      return waterbodyCompare;
    }

    return left.SiteName.localeCompare(right.SiteName);
  });
}

export function getCachedSites(): LocationRecord[] {
  try {
    const cached = localStorage.getItem(SITE_CACHE_KEY);

    if (!cached) return [];

    const parsed = JSON.parse(cached) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) =>
        normalizeLocationRecord(
          item as SnapshotRow,
          getString(item as SnapshotRow, ["SiteID"]),
        ),
      )
      .filter(
        (site): site is LocationRecord => site !== null,
      );
  } catch {
    return [];
  }
}

function cacheSites(sites: LocationRecord[]): void {
  try {
    localStorage.setItem(SITE_CACHE_KEY, JSON.stringify(sites));
  } catch (error) {
    console.warn("Unable to cache the NAIADD site index:", error);
  }
}

async function readFirestoreSites(): Promise<LocationRecord[]> {
  const snapshot = await getDocs(
    collection(db, SITES_COLLECTION),
  );

  return snapshot.docs
    .map((item) =>
      normalizeLocationRecord(
        item.data() as SnapshotRow,
        item.id,
      ),
    )
    .filter(
      (site): site is LocationRecord => site !== null,
    );
}

export async function refreshSites(): Promise<LocationRecord[]> {
  let snapshotSites: LocationRecord[] = [];
  let firestoreSites: LocationRecord[] = [];
  let snapshotError: unknown = null;
  let firestoreError: unknown = null;

  try {
    const rows = await readSnapshotRows({
      columns: [...SNAPSHOT_SITE_COLUMNS],
    });

    snapshotSites = snapshotRowsToSites(rows as SnapshotRow[]);
  } catch (error) {
    snapshotError = error;
    console.warn(
      "Unable to read sites from the cached NAIADD snapshot:",
      error,
    );
  }

  try {
    firestoreSites = await readFirestoreSites();
  } catch (error) {
    firestoreError = error;
    console.warn(
      "Unable to read newly created NAIADD sites from Firestore:",
      error,
    );
  }

  const combined = mergeSites(snapshotSites, firestoreSites);

  if (combined.length > 0) {
    cacheSites(combined);
    return combined;
  }

  const cached = getCachedSites();

  if (cached.length > 0) {
    return cached;
  }

  if (snapshotError instanceof Error) {
    throw snapshotError;
  }

  if (firestoreError instanceof Error) {
    throw firestoreError;
  }

  throw new Error(
    "No sites were available from the NAIADD snapshot, Firestore, or local cache.",
  );
}

export async function listSites(): Promise<LocationRecord[]> {
  const cached = getCachedSites();

  if (cached.length > 0) {
    return cached;
  }

  return refreshSites();
}

export async function createSite(
  site: LocationRecord,
): Promise<void> {
  const normalized = normalizeLocationRecord(
    site as unknown as SnapshotRow,
    site.SiteID,
  );

  if (!normalized) {
    throw new Error(
      "The site record does not contain valid NAIADD location coordinates.",
    );
  }

  await setDoc(doc(db, SITES_COLLECTION, normalized.SiteID), {
    ...normalized,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const cached = getCachedSites();
  cacheSites(mergeSites(cached, [normalized]));
}

export function saveCurrentLocation(
  site: LocationRecord,
): void {
  localStorage.setItem(
    CURRENT_LOCATION_KEY,
    JSON.stringify(site),
  );
}

export function loadCurrentLocation(): LocationRecord | null {
  try {
    const raw = localStorage.getItem(CURRENT_LOCATION_KEY);
    if (!raw) return null;

    return normalizeLocationRecord(
      JSON.parse(raw) as SnapshotRow,
    );
  } catch {
    return null;
  }
}

export function clearCurrentLocation(): void {
  localStorage.removeItem(CURRENT_LOCATION_KEY);
}
