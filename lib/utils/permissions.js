"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasPermission = hasPermission;
exports.canManageUsers = canManageUsers;
exports.canManageSystem = canManageSystem;
exports.canEnterData = canEnterData;
exports.canViewReports = canViewReports;
exports.canReviewSubmissions = canReviewSubmissions;
exports.canDeleteRecords = canDeleteRecords;
exports.isReadOnly = isReadOnly;
const ROLE_PERMISSIONS = {
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
function hasPermission(role, permission) {
    return ROLE_PERMISSIONS[role].has(permission);
}
function canManageUsers(role) {
    return hasPermission(role, "manageUsers");
}
function canManageSystem(role) {
    return hasPermission(role, "manageSystem");
}
function canEnterData(role) {
    return hasPermission(role, "enterData");
}
function canViewReports(role) {
    return hasPermission(role, "viewReports");
}
function canReviewSubmissions(role) {
    return hasPermission(role, "reviewSubmissions");
}
function canDeleteRecords(role) {
    return hasPermission(role, "deleteRecords");
}
function isReadOnly(role) {
    return hasPermission(role, "viewOnly");
}
//# sourceMappingURL=permissions.js.map