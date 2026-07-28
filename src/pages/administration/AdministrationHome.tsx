import { useState } from "react";
import { Card, PageHeader, StatusBadge } from "../../components/ui";
import type { UserProfile } from "../../types/user";
import DatasetHealthPage from "./DatasetHealthPage";
import DBAMergePortal from "./DBAMergePortal";
import ReferenceDataManager from "./ReferenceDataManager";
import UserManagement from "./UserManagement";
import "./AdministrationHome.css";

type AdminView =
  | "home"
  | "users"
  | "reference-data"
  | "dataset-publish"
  | "dataset-health";

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
    description:
      "Maintain controlled application lists and the fish species catalog.",
    status: "Available",
    enabled: true,
  },
  {
    id: "dataset-publish",
    icon: "⇄",
    title: "Dataset Publishing",
    description:
      "Review queued survey submissions, validate them, and publish immutable dataset deltas.",
    status: "Available",
    enabled: true,
  },
  {
    id: "dataset-health",
    icon: "✓",
    title: "Dataset Health Check",
    description:
      "Verify snapshot access, active published deltas, and the complete current dataset row count.",
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
] as const;

type AdministrationHomeProps = {
  profile: UserProfile;
};

export default function AdministrationHome({
  profile,
}: AdministrationHomeProps) {
  const [view, setView] = useState<AdminView>("home");

  if (view === "users") {
    return (
      <UserManagement
        currentUser={profile}
        onBack={() => setView("home")}
      />
    );
  }

  if (view === "reference-data") {
    return (
      <ReferenceDataManager onBack={() => setView("home")} />
    );
  }

  if (view === "dataset-publish") {
    return (
      <DBAMergePortal
        profile={profile}
        onBack={() => setView("home")}
      />
    );
  }

  if (view === "dataset-health") {
    return <DatasetHealthPage onBack={() => setView("home")} />;
  }

  return (
    <div className="admin-home">
      <PageHeader
        eyebrow="VADMA Administration"
        title="Administration"
        description="Manage users, reference data, dataset publication, and overall VADMA administration from one place."
      />

      <div className="admin-tool-grid">
        {adminTools.map((tool) => (
          <Card
            key={tool.id}
            className={
              tool.enabled
                ? "admin-tool-card enabled"
                : "admin-tool-card"
            }
          >
            <div className="admin-tool-card-top">
              <span className="admin-tool-icon" aria-hidden="true">
                {tool.icon}
              </span>

              <StatusBadge tone={tool.enabled ? "success" : "neutral"}>
                {tool.status}
              </StatusBadge>
            </div>

            <div className="admin-tool-copy">
              <h2>{tool.title}</h2>
              <p>{tool.description}</p>
            </div>

            <button
              type="button"
              disabled={!tool.enabled}
              onClick={() => {
                if (!tool.enabled) return;

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
              }}
            >
              {tool.enabled ? "Open tool" : "Not yet available"}
              <span aria-hidden="true">→</span>
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
