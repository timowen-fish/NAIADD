"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AdministrationHome;
const react_1 = require("react");
const ui_1 = require("../../components/ui");
const DatasetHealthPage_1 = __importDefault(require("./DatasetHealthPage"));
const DBAMergePortal_1 = __importDefault(require("./DBAMergePortal"));
const ReferenceDataManager_1 = __importDefault(require("./ReferenceDataManager"));
const UserManagement_1 = __importDefault(require("./UserManagement"));
require("./AdministrationHome.css");
const adminTools = [
    {
        id: "users",
        icon: "👥",
        title: "User Management",
        description: "Assign roles and manage account status.",
        status: "Available",
        enabled: true,
    },
    {
        id: "reference-data",
        icon: "🗂",
        title: "Reference Data",
        description: "Maintain controlled application lists and the fish species catalog.",
        status: "Available",
        enabled: true,
    },
    {
        id: "dataset-publish",
        icon: "⇄",
        title: "Dataset Publishing",
        description: "Review queued survey submissions, validate them, and publish immutable dataset deltas.",
        status: "Available",
        enabled: true,
    },
    {
        id: "dataset-health",
        icon: "✓",
        title: "Dataset Health Check",
        description: "Verify snapshot access, active published deltas, and the complete current dataset row count.",
        status: "Available",
        enabled: true,
    },
    {
        id: "audit",
        icon: "📜",
        title: "Audit Log",
        description: "Review significant account and application activity.",
        status: "Coming soon",
        enabled: false,
    },
    {
        id: "system",
        icon: "⚙",
        title: "System Settings",
        description: "Configure application-wide behavior and defaults.",
        status: "Coming soon",
        enabled: false,
    },
    {
        id: "security",
        icon: "🔒",
        title: "Security",
        description: "Review authentication rules and access controls.",
        status: "Coming soon",
        enabled: false,
    },
    {
        id: "usage",
        icon: "📊",
        title: "Usage Statistics",
        description: "View adoption, activity, and system health metrics.",
        status: "Coming soon",
        enabled: false,
    },
];
function AdministrationHome({ profile, }) {
    const [view, setView] = (0, react_1.useState)("home");
    if (view === "users") {
        return (<UserManagement_1.default currentUser={profile} onBack={() => setView("home")}/>);
    }
    if (view === "reference-data") {
        return (<ReferenceDataManager_1.default onBack={() => setView("home")}/>);
    }
    if (view === "dataset-publish") {
        return (<DBAMergePortal_1.default profile={profile} onBack={() => setView("home")}/>);
    }
    if (view === "dataset-health") {
        return <DatasetHealthPage_1.default onBack={() => setView("home")}/>;
    }
    return (<div className="admin-home">
      <ui_1.PageHeader eyebrow="VADMA Administration" title="Administration" description="Manage users, reference data, dataset publication, and overall VADMA administration from one place."/>

      <div className="admin-tool-grid">
        {adminTools.map((tool) => (<ui_1.Card key={tool.id} className={tool.enabled
                ? "admin-tool-card enabled"
                : "admin-tool-card"}>
            <div className="admin-tool-card-top">
              <span className="admin-tool-icon" aria-hidden="true">
                {tool.icon}
              </span>

              <ui_1.StatusBadge tone={tool.enabled ? "success" : "neutral"}>
                {tool.status}
              </ui_1.StatusBadge>
            </div>

            <div className="admin-tool-copy">
              <h2>{tool.title}</h2>
              <p>{tool.description}</p>
            </div>

            <button type="button" disabled={!tool.enabled} onClick={() => {
                if (!tool.enabled)
                    return;
                if (tool.id === "users") {
                    setView("users");
                }
                if (tool.id === "reference-data") {
                    setView("reference-data");
                }
                if (tool.id === "dataset-publish") {
                    setView("dataset-publish");
                }
                if (tool.id === "dataset-health") {
                    setView("dataset-health");
                }
            }}>
              {tool.enabled ? "Open tool" : "Not yet available"}
              <span aria-hidden="true">→</span>
            </button>
          </ui_1.Card>))}
      </div>
    </div>);
}
//# sourceMappingURL=AdministrationHome.js.map