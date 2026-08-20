export interface LocationRecord {
  /**
   * Records how this location entered the current survey workflow.
   * This stays with the draft so returning to Location reopens the correct
   * Existing Site or New Site editor.
   */
  EntryMode?: "existing" | "new";

  SiteID: string;
  SiteName: string;
  Waterbody: string;

  /**
   * Legacy decimal-degree coordinate fields retained by the unified database.
   * New records mirror the downstream coordinate into these fields.
   */
  LatitudeDD: number;
  LongitudeDD: number;

  DownstreamLat: number;
  DownstreamLong: number;
  UpstreamLat?: number | null;
  UpstreamLong?: number | null;

  LocDescription?: string;
  County?: string;
  State?: string;
  RiverBasin?: string;
  HUC7?: string;
  PhysiographicProvince?: string;
  RoadName?: string;
  RoadNumber?: string;

  /**
   * Legacy identifiers are normally populated during migration rather than
   * when a brand-new NAIADD site is created.
   */
  SiteID_AccessDB?: string;
  SiteID_Previous?: string;

  createdBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}
