"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AppRouteRenderer;
const AccessDeniedPage_1 = __importDefault(require("../pages/common/AccessDeniedPage"));
const routes_1 = require("./routes");
function AppRouteRenderer({ routeId, profile, }) {
    if (!(0, routes_1.canAccessRoute)(profile.role, routeId)) {
        return <AccessDeniedPage_1.default />;
    }
    return (0, routes_1.getRoute)(routeId).render(profile);
}
//# sourceMappingURL=AppRouteRenderer.js.map