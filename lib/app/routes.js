"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.APP_ROUTES = void 0;
exports.getRoute = getRoute;
exports.canAccessRoute = canAccessRoute;
exports.getVisibleNavigation = getVisibleNavigation;
const permissions_1 = require("../utils/permissions");
const HomeDashboard_1 = __importDefault(require("../pages/HomeDashboard"));
const AdministrationHome_1 = __importDefault(require("../pages/administration/AdministrationHome"));
const DataEntryWorkflow_1 = __importDefault(require("../pages/data-entry/DataEntryWorkflow"));
const DraftsPage_1 = __importDefault(require("../pages/DraftsPage"));
const PreferencesPage_1 = __importDefault(require("../pages/PreferencesPage"));
const SubmissionHistoryPage_1 = __importDefault(require("../pages/SubmissionHistoryPage"));
const SiteConditionsPage_1 = __importDefault(require("../pages/SiteConditionsPage"));
const QueryDataPage_1 = __importDefault(require("../pages/QueryDataPage"));
const RawDataPage_1 = __importDefault(require("../pages/RawDataPage"));
const CPUEPage_1 = __importDefault(require("../pages/CPUEPage"));
const SizeStructurePage_1 = __importDefault(require("../pages/SizeStructurePage"));
exports.APP_ROUTES = [
    {
        id: "dashboard",
        label: "Dashboard",
        icon: "⌂",
        description: "Application overview and recent activity",
        permission: "viewDashboard",
        render: (profile) => <HomeDashboard_1.default profile={profile}/>,
        showInNavigation: true,
    },
    {
        id: "data-entry",
        label: "Data Entry",
        icon: "✎",
        description: "Create and manage aquatic survey records",
        permission: "enterData",
        render: (profile) => <DataEntryWorkflow_1.default profile={profile}/>,
        showInNavigation: true,
    },
    {
        id: "drafts",
        label: "Drafts",
        icon: "▤",
        description: "Continue saved and offline work",
        permission: "editOwnDrafts",
        render: (profile) => <DraftsPage_1.default profile={profile}/>,
        showInNavigation: true,
    },
    {
        id: "submissions",
        label: "Submissions",
        icon: "✓",
        description: "Review submitted surveys and DBA queue status",
        permission: "viewDashboard",
        render: (profile) => <SubmissionHistoryPage_1.default profile={profile}/>,
        showInNavigation: true,
    },
    {
        id: "site-conditions",
        label: "Site Conditions",
        icon: "☁",
        description: "Weather, radar, tides, flow, and mapping",
        permission: "viewDashboard",
        render: () => <SiteConditionsPage_1.default />,
        showInNavigation: true,
    },
    {
        id: "reports",
        label: "Query Data",
        icon: "⌕",
        description: "Build and review VADMA data queries",
        permission: "viewReports",
        render: () => <QueryDataPage_1.default />,
        showInNavigation: true,
    },
    {
        id: "query-data",
        label: "Query Data",
        icon: "⌕",
        description: "Build and review VADMA data queries",
        permission: "viewReports",
        render: () => <QueryDataPage_1.default />,
        showInNavigation: false,
    },
    {
        id: "raw-data",
        label: "Raw Data",
        icon: "▦",
        description: "View tabular rows from the applied query",
        permission: "viewReports",
        render: () => <RawDataPage_1.default />,
        showInNavigation: false,
    },
    {
        id: "cpue",
        label: "CPUE",
        icon: "◫",
        description: "Calculate catch per unit effort from the applied query",
        permission: "viewReports",
        render: () => <CPUEPage_1.default />,
        showInNavigation: false,
    },
    {
        id: "size-structure",
        label: "Size Structure",
        icon: "▥",
        description: "Calculate Gabelhouse size classes and PSD metrics",
        permission: "viewReports",
        render: () => <SizeStructurePage_1.default />,
        showInNavigation: false,
    },
    {
        id: "admin",
        label: "Administration",
        icon: "⚙",
        description: "Manage users, security, and application settings",
        permission: "manageUsers",
        render: (profile) => <AdministrationHome_1.default profile={profile}/>,
        showInNavigation: true,
    },
    {
        id: "settings",
        label: "Preferences",
        icon: "◉",
        description: "Personalize your VADMA experience",
        permission: "viewDashboard",
        render: () => <PreferencesPage_1.default />,
        showInNavigation: true,
    },
];
function getRoute(routeId) {
    return exports.APP_ROUTES.find((route) => route.id === routeId) ?? exports.APP_ROUTES[0];
}
function canAccessRoute(role, routeId) {
    return (0, permissions_1.hasPermission)(role, getRoute(routeId).permission);
}
function getVisibleNavigation(role) {
    return exports.APP_ROUTES.filter((route) => route.showInNavigation && (0, permissions_1.hasPermission)(role, route.permission));
}
//# sourceMappingURL=routes.js.map