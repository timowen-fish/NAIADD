import type { ReactNode } from "react";
import type { UserProfile, UserRole } from "../types/user";
import type { Permission } from "../utils/permissions";
import { hasPermission } from "../utils/permissions";
import HomeDashboard from "../pages/HomeDashboard";
import AdministrationHome from "../pages/administration/AdministrationHome";
import DataEntryWorkflow from "../pages/data-entry/DataEntryWorkflow";
import DraftsPage from "../pages/DraftsPage";
import PreferencesPage from "../pages/PreferencesPage";
import SubmissionHistoryPage from "../pages/SubmissionHistoryPage";
import SiteConditionsPage from "../pages/SiteConditionsPage";
import DistributionsPage from "../pages/DistributionsPage";
import QueryDataPage from "../pages/QueryDataPage";
import RawDataPage from "../pages/RawDataPage";

export type AppRouteId =
  | "dashboard"
  | "data-entry"
  | "drafts"
  | "submissions"
  | "site-conditions"
  | "distributions"
  | "reports"
  | "query-data"
  | "raw-data"
  | "admin"
  | "settings";

export type AppRoute = {
  id: AppRouteId;
  label: string;
  icon: string;
  description: string;
  permission: Permission;
  render: (profile: UserProfile) => ReactNode;
  showInNavigation: boolean;
};

export const APP_ROUTES: readonly AppRoute[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "⌂",
    description: "Application overview and recent activity",
    permission: "viewDashboard",
    render: (profile) => <HomeDashboard profile={profile} />,
    showInNavigation: true,
  },
  {
    id: "distributions",
    label: "Distributions",
    icon: "◉",
    description: "Map current and historical aquatic invertebrate occurrences",
    permission: "viewReports",
    render: () => <DistributionsPage />,
    showInNavigation: true,
  },
  {
    id: "data-entry",
    label: "Data Entry",
    icon: "✎",
    description: "Create and manage aquatic survey records",
    permission: "enterData",
    render: (profile) => <DataEntryWorkflow profile={profile} />,
    showInNavigation: true,
  },
  {
    id: "drafts",
    label: "Drafts",
    icon: "▤",
    description: "Continue saved and offline work",
    permission: "editOwnDrafts",
    render: (profile) => <DraftsPage profile={profile} />,
    showInNavigation: true,
  },
  {
    id: "submissions",
    label: "Submissions",
    icon: "✓",
    description: "Review submitted surveys and DBA queue status",
    permission: "viewDashboard",
    render: (profile) => <SubmissionHistoryPage profile={profile} />,
    showInNavigation: true,
  },
  {
    id: "site-conditions",
    label: "Site Conditions",
    icon: "☁",
    description: "Weather, radar, tides, flow, and mapping",
    permission: "viewDashboard",
    render: () => <SiteConditionsPage />,
    showInNavigation: true,
  },
  {
    id: "reports",
    label: "Reports",
    icon: "⌕",
    description: "Build and review NAIADD data reports",
    permission: "viewReports",
    render: () => <QueryDataPage />,
    showInNavigation: true,
  },
  {
    id: "query-data",
    label: "Query Data",
    icon: "⌕",
    description: "Build and review NAIADD data queries",
    permission: "viewReports",
    render: () => <QueryDataPage />,
    showInNavigation: false,
  },
  {
    id: "raw-data",
    label: "Raw Data",
    icon: "▦",
    description: "View tabular rows from the applied query",
    permission: "viewReports",
    render: () => <RawDataPage />,
    showInNavigation: false,
  },
  {
    id: "admin",
    label: "Administration",
    icon: "⚙",
    description: "Manage users, security, and application settings",
    permission: "manageUsers",
    render: (profile) => <AdministrationHome profile={profile} />,
    showInNavigation: true,
  },
  {
    id: "settings",
    label: "Preferences",
    icon: "◉",
    description: "Personalize your NAIADD experience",
    permission: "viewDashboard",
    render: () => <PreferencesPage />,
    showInNavigation: true,
  },
];

export function getRoute(routeId: AppRouteId): AppRoute {
  return APP_ROUTES.find((route) => route.id === routeId) ?? APP_ROUTES[0];
}

export function canAccessRoute(role: UserRole, routeId: AppRouteId): boolean {
  return hasPermission(role, getRoute(routeId).permission);
}

export function getVisibleNavigation(role: UserRole): AppRoute[] {
  return APP_ROUTES.filter(
    (route) => route.showInNavigation && hasPermission(role, route.permission),
  );
}
