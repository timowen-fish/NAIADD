import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "../firebase";
import type { LocationRecord, SiteAccess } from "../types/location";
import { readCachedVadmaSnapshotRows } from "./snapshotService";

const SITES_COLLECTION = "sites";
const CURRENT_LOCATION_KEY = "vadma2.currentLocation";
const SITE_CACHE_KEY = "vadma2.sites.cache.v2";

const SNAPSHOT_SITE_COLUMNS = [
  "SiteID",
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
  "LocationDesc",
  "locationDesc",
  "LocationDescription",
  "Description",
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
  "PrivatePublic",
  "Access",
  "State",
  "PhysiographicProvince",
  "HUC6",
  "HUC8",
] as const;

type SnapshotRow = Record<string, unknown>;

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : Number.NaN;
}

function getValue(row: SnapshotRow, keys: readonly string[]): unknown {
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

function getString(row: SnapshotRow, keys: readonly string[]): string {
  return asString(getValue(row, keys));
}

function getNumber(row: SnapshotRow, keys: readonly string[]): number {
  return asNumber(getValue(row, keys));
}

function normalizeAccess(value: unknown): SiteAccess {
  return asString(value).toLowerCase() === "private" ? "Private" : "Public";
}

function isVirginiaCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 36.4 &&
    latitude <= 39.6 &&
    longitude >= -83.8 &&
    longitude <= -75.0
  );
}

function fallbackSiteId(latitude: number, longitude: number): string {
  const latPart = Math.round(latitude * 1_000_000);
  const longPart = Math.round(longitude * 1_000_000);

  return `SITE_${Math.abs(latPart * 31 + longPart)}`;
}

function snapshotRowsToSites(rows: SnapshotRow[]): LocationRecord[] {
  const sitesById = new Map<string, LocationRecord>();

  for (const row of rows) {
    const waterbody = getString(row, [
      "Waterbody",
      "waterbody",
      "Stream",
      "stream",
      "WaterbodyName",
    ]);

    const siteIdFromRow = getString(row, [
      "SiteID",
      "Site_Id",
      "siteID",
      "siteId",
      "NewSiteID",
      "savedSiteID",
    ]);

    const siteName =
      getString(row, [
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
      siteIdFromRow;

    const latitude = getNumber(row, [
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
    ]);

    const longitude = getNumber(row, [
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
    ]);

    if (!isVirginiaCoordinate(latitude, longitude)) {
      continue;
    }

    if (!siteIdFromRow && !siteName && !waterbody) {
      continue;
    }

    const siteId =
      siteIdFromRow || fallbackSiteId(latitude, longitude);

    const candidate: LocationRecord = {
      SiteID: siteId,
      SiteName: siteName || siteId,
      Waterbody: waterbody,
      DownstreamLat: latitude,
      DownstreamLong: longitude,
      UpstreamLat: getNumber(row, [
        "UpstreamLat",
        "upstreamLat",
        "UpstreamLatitude",
      ]),
      UpstreamLong: getNumber(row, [
        "UpstreamLong",
        "upstreamLong",
        "UpstreamLongitude",
      ]),
      LocationDesc: getString(row, [
        "LocationDesc",
        "locationDesc",
        "LocationDescription",
        "Description",
      ]),
      PrivatePublic: normalizeAccess(
        getValue(row, ["PrivatePublic", "Access"]),
      ),
      County: getString(row, ["County", "county", "CountyName"]),
      State: getString(row, ["State"]),
      PhysiographicProvince: getString(row, [
        "PhysiographicProvince",
      ]),
      HUC6: getString(row, ["HUC6"]),
      HUC8: getString(row, ["HUC8"]),
    };

    const existing = sitesById.get(siteId);

    if (!existing) {
      sitesById.set(siteId, candidate);
      continue;
    }

    sitesById.set(siteId, {
      ...existing,
      SiteName: existing.SiteName || candidate.SiteName,
      Waterbody: existing.Waterbody || candidate.Waterbody,
      County: existing.County || candidate.County,
      LocationDesc: existing.LocationDesc || candidate.LocationDesc,
      State: existing.State || candidate.State,
      PhysiographicProvince:
        existing.PhysiographicProvince ||
        candidate.PhysiographicProvince,
      HUC6: existing.HUC6 || candidate.HUC6,
      HUC8: existing.HUC8 || candidate.HUC8,
      UpstreamLat:
        Number.isFinite(existing.UpstreamLat) ?
          existing.UpstreamLat :
          candidate.UpstreamLat,
      UpstreamLong:
        Number.isFinite(existing.UpstreamLong) ?
          existing.UpstreamLong :
          candidate.UpstreamLong,
    });
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
   * Firestore contains newly created or pending sites. Let those records
   * replace a snapshot record with the same SiteID because they are newer.
   */
  for (const site of firestoreSites) {
    merged.set(site.SiteID, site);
  }

  return Array.from(merged.values()).sort((a, b) => {
    const waterbodyCompare = a.Waterbody.localeCompare(b.Waterbody);

    if (waterbodyCompare !== 0) {
      return waterbodyCompare;
    }

    return a.SiteName.localeCompare(b.SiteName);
  });
}

function readCachedSites(): LocationRecord[] {
  try {
    const cached = localStorage.getItem(SITE_CACHE_KEY);

    if (!cached) return [];

    const parsed = JSON.parse(cached);

    return Array.isArray(parsed) ? (parsed as LocationRecord[]) : [];
  } catch {
    return [];
  }
}

function cacheSites(sites: LocationRecord[]): void {
  try {
    localStorage.setItem(SITE_CACHE_KEY, JSON.stringify(sites));
  } catch (error) {
    console.warn("Unable to cache the VADMA site index:", error);
  }
}

async function readFirestoreSites(): Promise<LocationRecord[]> {
  const snapshot = await getDocs(collection(db, SITES_COLLECTION));

  return snapshot.docs.map((item) => ({
    ...(item.data() as Omit<LocationRecord, "SiteID">),
    SiteID: item.id,
  }));
}

export async function listSites(): Promise<LocationRecord[]> {
  let snapshotSites: LocationRecord[] = [];
  let firestoreSites: LocationRecord[] = [];
  let snapshotError: unknown = null;
  let firestoreError: unknown = null;

  try {
    const rows = await readCachedVadmaSnapshotRows({
      columns: [...SNAPSHOT_SITE_COLUMNS],
    });

    snapshotSites = snapshotRowsToSites(rows as SnapshotRow[]);
  } catch (error) {
    snapshotError = error;
    console.warn("Unable to read sites from the cached VADMA snapshot:", error);
  }

  try {
    firestoreSites = await readFirestoreSites();
  } catch (error) {
    firestoreError = error;
    console.warn("Unable to read newly created sites from Firestore:", error);
  }

  const combined = mergeSites(snapshotSites, firestoreSites);

  if (combined.length > 0) {
    cacheSites(combined);
    return combined;
  }

  const cached = readCachedSites();

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
    "No sites were available from the VADMA snapshot, Firestore, or local cache.",
  );
}

export async function createSite(site: LocationRecord): Promise<void> {
  await setDoc(doc(db, SITES_COLLECTION, site.SiteID), {
    ...site,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const cached = readCachedSites();
  const updated = mergeSites(cached, [site]);
  cacheSites(updated);
}

export function saveCurrentLocation(site: LocationRecord): void {
  localStorage.setItem(CURRENT_LOCATION_KEY, JSON.stringify(site));
}
