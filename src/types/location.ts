export interface LocationRecord {
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
