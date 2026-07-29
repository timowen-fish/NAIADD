import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import naiaddShield from "../../assets/naiadd-shield.png";
import type { UserProfile } from "../../types/user";
import { USER_ROLE_LABELS } from "../../types/user";
import { getDisplayName } from "../../utils/displayName";
import {
  getVisibleNavigation,
  type AppRouteId,
} from "../../app/routes";
import {
  loadSurveySession,
  requestWorkflowStep,
  saveSurveySession,
  WORKFLOW_SESSION_EVENT,
} from "../../services/surveySessionService";
import type {
  DataEntryStep,
  SurveySession,
} from "../../types/surveySession";
import NavigationLoadingOverlay from "./NavigationLoadingOverlay";
import "../../styles/AppShell.css";

type AppShellProps = {
  profile: UserProfile;
  email: string;
  activeSection: AppRouteId;
  onSectionChange: (section: AppRouteId) => void;
  onLogout: () => Promise<void>;
  loggingOut: boolean;
  children: ReactNode;
};

const NAVIGATION_MIN_VISIBLE_MS = 180;
const NAVIGATION_MAX_VISIBLE_MS = 5000;

export default function AppShell({
  profile,
  email,
  activeSection,
  onSectionChange,
  onLogout,
  loggingOut,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [navigationLoading, setNavigationLoading] = useState(false);
  const navigationStartedAtRef = useRef(0);
  const pendingSectionRef = useRef<AppRouteId | null>(null);
  const navigationTimersRef = useRef<number[]>([]);
  const navigationFramesRef = useRef<number[]>([]);
  const [dataEntryOpen, setDataEntryOpen] = useState(
    activeSection === "data-entry",
  );
  const [reportsOpen, setReportsOpen] = useState(
    activeSection === "reports" ||
      activeSection === "query-data" ||
      activeSection === "raw-data" ||
      activeSection === "cpue" ||
      activeSection === "size-structure",
  );
  const [surveySession, setSurveySession] = useState<SurveySession>(() =>
    loadSurveySession(profile.uid),
  );

  const displayName = getDisplayName(profile);
  const visibleNavigation = getVisibleNavigation(profile.role);

  useEffect(() => {
    const refresh = () => setSurveySession(loadSurveySession(profile.uid));
    window.addEventListener(WORKFLOW_SESSION_EVENT, refresh);
    return () => window.removeEventListener(WORKFLOW_SESSION_EVENT, refresh);
  }, [profile.uid]);

  useEffect(() => {
    if (
      activeSection === "reports" ||
      activeSection === "query-data" ||
      activeSection === "raw-data" ||
      activeSection === "cpue" ||
      activeSection === "size-structure"
    ) {
      setReportsOpen(true);
    }
  }, [activeSection]);

  const clearNavigationScheduling = useCallback(() => {
    navigationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    navigationTimersRef.current = [];

    navigationFramesRef.current.forEach((frame) =>
      window.cancelAnimationFrame(frame),
    );
    navigationFramesRef.current = [];
  }, []);

  const finishNavigation = useCallback(() => {
    const elapsed = performance.now() - navigationStartedAtRef.current;
    const remaining = Math.max(0, NAVIGATION_MIN_VISIBLE_MS - elapsed);

    const timer = window.setTimeout(() => {
      setNavigationLoading(false);
      pendingSectionRef.current = null;
      navigationTimersRef.current = navigationTimersRef.current.filter(
        (item) => item !== timer,
      );
    }, remaining);

    navigationTimersRef.current.push(timer);
  }, []);

  const performNavigation = useCallback(
    (section: AppRouteId) => {
      if (section === activeSection || navigationLoading) {
        setMobileMenuOpen(false);
        setProfileMenuOpen(false);
        return;
      }

      clearNavigationScheduling();
      pendingSectionRef.current = section;
      navigationStartedAtRef.current = performance.now();
      setNavigationLoading(true);
      setMobileMenuOpen(false);
      setProfileMenuOpen(false);

      const firstFrame = window.requestAnimationFrame(() => {
        const secondFrame = window.requestAnimationFrame(() => {
          onSectionChange(section);

          const safetyTimer = window.setTimeout(() => {
            setNavigationLoading(false);
            pendingSectionRef.current = null;
          }, NAVIGATION_MAX_VISIBLE_MS);

          navigationTimersRef.current.push(safetyTimer);
        });

        navigationFramesRef.current.push(secondFrame);
      });

      navigationFramesRef.current.push(firstFrame);
    },
    [
      activeSection,
      clearNavigationScheduling,
      navigationLoading,
      onSectionChange,
    ],
  );

  useEffect(() => {
    if (
      navigationLoading &&
      pendingSectionRef.current &&
      activeSection === pendingSectionRef.current
    ) {
      const frame = window.requestAnimationFrame(() => {
        finishNavigation();
      });

      navigationFramesRef.current.push(frame);
    }
  }, [activeSection, finishNavigation, navigationLoading]);

  useEffect(
    () => () => {
      clearNavigationScheduling();
    },
    [clearNavigationScheduling],
  );

  const workflowItems: Array<{
    id: DataEntryStep;
    label: string;
    complete: boolean;
  }> = [
    {
      id: "location",
      label: "Location",
      complete: Boolean(surveySession.location),
    },
    {
      id: "survey",
      label: "Survey Information",
      complete: Boolean(surveySession.survey),
    },
    {
      id: "specimens",
      label: "Specimens",
      complete: surveySession.specimens.length > 0,
    },
    {
      id: "review",
      label: "Review",
      complete: Boolean(
        surveySession.location &&
          surveySession.survey &&
          surveySession.specimens.length,
      ),
    },
    { id: "submit", label: "Submit", complete: false },
  ];

  function navigateWorkflow(step: DataEntryStep) {
    if (navigationLoading) return;

    const nextSession = saveSurveySession({
      ...surveySession,
      currentStep: step,
    });

    setSurveySession(nextSession);
    setDataEntryOpen(true);

    if (activeSection !== "data-entry") {
      performNavigation("data-entry");

      const timer = window.setTimeout(
        () => requestWorkflowStep(step),
        NAVIGATION_MIN_VISIBLE_MS,
      );
      navigationTimersRef.current.push(timer);
      return;
    }

    window.requestAnimationFrame(() => requestWorkflowStep(step));
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
  }

  const initials = useMemo(() => {
    const parts = displayName
      .split(/[.\s_-]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    return (
      parts
        .slice(0, 2)
        .map((part) => part[0])
        .join("") || "U"
    ).toUpperCase();
  }, [displayName]);

  function navigate(section: AppRouteId) {
    performNavigation(section);
  }

  return (
    <div className="app-shell">
      <NavigationLoadingOverlay visible={navigationLoading} />

      <header className="app-topbar">
        <div className="app-topbar-left">
          <button
            type="button"
            className="app-mobile-menu-button"
            aria-label="Open navigation"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((current) => !current)}
          >
            <span />
            <span />
            <span />
          </button>

          <button
            type="button"
            className="app-brand"
            onClick={() => navigate("dashboard")}
          >
            <img src={naiaddShield} alt="" />
            <span>
              <strong>NAIADD</strong>
              <small>Nongame Aquatic Invertebrate Assessment &amp; Distribution Database</small>
            </span>
          </button>
        </div>

        <div className="app-user-wrap">
          <button
            type="button"
            className="app-user-button"
            aria-expanded={profileMenuOpen}
            onClick={() => setProfileMenuOpen((current) => !current)}
          >
            <span className="app-avatar">{initials}</span>
            <span className="app-user-copy">
              <strong>{displayName}</strong>
              <small>{USER_ROLE_LABELS[profile.role]}</small>
            </span>
            <span className="app-user-chevron">⌄</span>
          </button>

          {profileMenuOpen && (
            <div className="app-profile-menu">
              <div>
                <strong>{displayName}</strong>
                <span>{email}</span>
                <em>{USER_ROLE_LABELS[profile.role]}</em>
              </div>

              <button type="button" onClick={() => navigate("settings")}>
                Preferences
              </button>

              <button
                type="button"
                className="app-profile-logout"
                disabled={loggingOut}
                onClick={onLogout}
              >
                {loggingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="app-shell-body">
        <aside className={mobileMenuOpen ? "app-sidebar open" : "app-sidebar"}>
          <nav aria-label="Main navigation">
            {visibleNavigation.map((item) => {
              if (item.id === "data-entry") {
                return (
                  <div className="app-nav-group" key={item.id}>
                    <button
                      type="button"
                      className={activeSection === item.id ? "active" : ""}
                      onClick={() => {
                        navigate(item.id);
                        setDataEntryOpen((current) => !current);
                      }}
                    >
                      <span className="app-nav-icon">{item.icon}</span>
                      <span>{item.label}</span>
                      <span className="app-nav-expand">
                        {dataEntryOpen ? "⌃" : "⌄"}
                      </span>
                    </button>

                    {dataEntryOpen && (
                      <div className="app-nav-children">
                        {workflowItems.map((step) => (
                          <button
                            type="button"
                            key={step.id}
                            className={
                              activeSection === "data-entry" &&
                              surveySession.currentStep === step.id
                                ? "active-child"
                                : ""
                            }
                            onClick={() => navigateWorkflow(step.id)}
                          >
                            <span>{step.complete ? "✓" : "○"}</span>
                            <span>{step.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              if (item.id === "reports") {
                const reportsActive =
                  activeSection === "reports" ||
                  activeSection === "query-data" ||
                  activeSection === "raw-data" ||
                  activeSection === "cpue" ||
                  activeSection === "size-structure";

                return (
                  <div className="app-nav-group" key={item.id}>
                    <button
                      type="button"
                      className={reportsActive ? "active" : ""}
                      aria-expanded={reportsOpen}
                      onClick={() => setReportsOpen((current) => !current)}
                    >
                      <span className="app-nav-icon">{item.icon}</span>
                      <span>{item.label}</span>
                      <span className="app-nav-expand">
                        {reportsOpen ? "⌃" : "⌄"}
                      </span>
                    </button>

                    {reportsOpen && (
                      <div className="app-nav-children">
                        <button
                          type="button"
                          className={
                            activeSection === "query-data" ||
                            activeSection === "reports"
                              ? "active-child"
                              : ""
                          }
                          onClick={() => navigate("query-data")}
                        >
                          <span>⌕</span>
                          <span>Query Data</span>
                        </button>

                        <button
                          type="button"
                          className={
                            activeSection === "raw-data" ? "active-child" : ""
                          }
                          onClick={() => navigate("raw-data")}
                        >
                          <span>▦</span>
                          <span>Raw Data</span>
                        </button>

                        <button
                          type="button"
                          className={
                            activeSection === "cpue" ? "active-child" : ""
                          }
                          onClick={() => navigate("cpue")}
                        >
                          <span>◫</span>
                          <span>CPUE</span>
                        </button>

                        <button
                          type="button"
                          className={
                            activeSection === "size-structure"
                              ? "active-child"
                              : ""
                          }
                          onClick={() => navigate("size-structure")}
                        >
                          <span>▥</span>
                          <span>Size Structure</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <button
                  type="button"
                  key={item.id}
                  className={activeSection === item.id ? "active" : ""}
                  onClick={() => navigate(item.id)}
                >
                  <span className="app-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="app-sidebar-footer">
            <span className={profile.active ? "active" : "inactive"} />
            <div>
              <strong>
                {profile.active ? "Account active" : "Account inactive"}
              </strong>
              <small>{USER_ROLE_LABELS[profile.role]}</small>
            </div>
          </div>
        </aside>

        {mobileMenuOpen && (
          <button
            type="button"
            className="app-sidebar-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
