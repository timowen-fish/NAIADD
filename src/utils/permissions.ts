import type { UserRole } from "../types/user";

export type Permission =
  | "viewDashboard"
  | "enterData"
  | "editOwnDrafts"
  | "submitDrafts"
  | "viewReports"
  | "exportReports"
  | "reviewSubmissions"
  | "manageUsers"
  | "manageSystem"
  | "deleteRecords"
  | "viewOnly";

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  admin: new Set([
    "viewDashboard",
    "enterData",
    "editOwnDrafts",
    "submitDrafts",
    "viewReports",
    "exportReports",
    "reviewSubmissions",
    "manageUsers",
    "manageSystem",
    "deleteRecords",
  ]),

  power_user: new Set([
    "viewDashboard",
    "enterData",
    "editOwnDrafts",
    "submitDrafts",
    "viewReports",
    "exportReports",
    "reviewSubmissions",
  ]),

  biologist: new Set([
    "viewDashboard",
    "enterData",
    "editOwnDrafts",
    "submitDrafts",
    "viewReports",
    "exportReports",
  ]),

  technician: new Set([
    "viewDashboard",
    "enterData",
    "editOwnDrafts",
    "submitDrafts",
  ]),

  viewer: new Set([
    "viewDashboard",
    "viewReports",
    "viewOnly",
  ]),
};

export function hasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function canManageUsers(role: UserRole): boolean {
  return hasPermission(role, "manageUsers");
}

export function canManageSystem(role: UserRole): boolean {
  return hasPermission(role, "manageSystem");
}

export function canEnterData(role: UserRole): boolean {
  return hasPermission(role, "enterData");
}

export function canViewReports(role: UserRole): boolean {
  return hasPermission(role, "viewReports");
}

export function canReviewSubmissions(role: UserRole): boolean {
  return hasPermission(role, "reviewSubmissions");
}

export function canDeleteRecords(role: UserRole): boolean {
  return hasPermission(role, "deleteRecords");
}

export function isReadOnly(role: UserRole): boolean {
  return hasPermission(role, "viewOnly");
}
