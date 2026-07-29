"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDisplayName = getDisplayName;
function getDisplayName(profile) {
    if (profile.displayName?.trim()) {
        return profile.displayName.trim();
    }
    const username = (profile.email || "").split("@")[0];
    const formattedName = username
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
    return formattedName || "VADMA User";
}
//# sourceMappingURL=displayName.js.map