export type SiteAccess = "Public" | "Private";

export interface LocationRecord {
  SiteID: string;
  SiteName: string;
  Waterbody: string;
  DownstreamLat: number;
  DownstreamLong: number;
  UpstreamLat?: number | null;
  UpstreamLong?: number | null;
  LocationDesc?: string;
  AccessInfo?: string;
  PrivatePublic: SiteAccess;
  County?: string;
  State?: string;
  PhysiographicProvince?: string;
  HUC6?: string;
  HUC8?: string;
  createdBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}
