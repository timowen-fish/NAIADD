"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = NavigationLoadingOverlay;
require("./NavigationLoadingOverlay.css");
function NavigationLoadingOverlay({ visible, }) {
    return (<div className={`navigation-loading-overlay ${visible ? "visible" : ""}`} aria-hidden={!visible} aria-live="polite" aria-busy={visible}>
      <div className="navigation-loading-card" role="status">
        <span className="navigation-loading-spinner" aria-hidden="true"/>
        <strong>Loading</strong>
        <span>Preparing the selected page</span>
      </div>
    </div>);
}
//# sourceMappingURL=NavigationLoadingOverlay.js.map