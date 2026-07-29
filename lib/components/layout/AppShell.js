"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AppShell;
const react_1 = require("react");
const naiadd_shield_png_1 = __importDefault(require("../../assets/naiadd-shield.png"));
const user_1 = require("../../types/user");
const displayName_1 = require("../../utils/displayName");
const routes_1 = require("../../app/routes");
const surveySessionService_1 = require("../../services/surveySessionService");
const NavigationLoadingOverlay_1 = __importDefault(require("./NavigationLoadingOverlay"));
require("../../styles/AppShell.css");
const NAVIGATION_MIN_VISIBLE_MS = 180;
const NAVIGATION_MAX_VISIBLE_MS = 5000;
function AppShell({ profile, email, activeSection, onSectionChange, onLogout, loggingOut, children, }) {
    const [mobileMenuOpen, setMobileMenuOpen] = (0, react_1.useState)(false);
    const [profileMenuOpen, setProfileMenuOpen] = (0, react_1.useState)(false);
    const [navigationLoading, setNavigationLoading] = (0, react_1.useState)(false);
    const navigationStartedAtRef = (0, react_1.useRef)(0);
    const pendingSectionRef = (0, react_1.useRef)(null);
    const navigationTimersRef = (0, react_1.useRef)([]);
    const navigationFramesRef = (0, react_1.useRef)([]);
    const [dataEntryOpen, setDataEntryOpen] = (0, react_1.useState)(activeSection === "data-entry");
    const [reportsOpen, setReportsOpen] = (0, react_1.useState)(activeSection === "reports" ||
        activeSection === "query-data" ||
        activeSection === "raw-data" ||
        activeSection === "cpue" ||
        activeSection === "size-structure");
    const [surveySession, setSurveySession] = (0, react_1.useState)(() => (0, surveySessionService_1.loadSurveySession)(profile.uid));
    const displayName = (0, displayName_1.getDisplayName)(profile);
    const visibleNavigation = (0, routes_1.getVisibleNavigation)(profile.role);
    (0, react_1.useEffect)(() => {
        const refresh = () => setSurveySession((0, surveySessionService_1.loadSurveySession)(profile.uid));
        window.addEventListener(surveySessionService_1.WORKFLOW_SESSION_EVENT, refresh);
        return () => window.removeEventListener(surveySessionService_1.WORKFLOW_SESSION_EVENT, refresh);
    }, [profile.uid]);
    (0, react_1.useEffect)(() => {
        if (activeSection === "reports" ||
            activeSection === "query-data" ||
            activeSection === "raw-data" ||
            activeSection === "cpue" ||
            activeSection === "size-structure") {
            setReportsOpen(true);
        }
    }, [activeSection]);
    const clearNavigationScheduling = (0, react_1.useCallback)(() => {
        navigationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        navigationTimersRef.current = [];
        navigationFramesRef.current.forEach((frame) => window.cancelAnimationFrame(frame));
        navigationFramesRef.current = [];
    }, []);
    const finishNavigation = (0, react_1.useCallback)(() => {
        const elapsed = performance.now() - navigationStartedAtRef.current;
        const remaining = Math.max(0, NAVIGATION_MIN_VISIBLE_MS - elapsed);
        const timer = window.setTimeout(() => {
            setNavigationLoading(false);
            pendingSectionRef.current = null;
            navigationTimersRef.current = navigationTimersRef.current.filter((item) => item !== timer);
        }, remaining);
        navigationTimersRef.current.push(timer);
    }, []);
    const performNavigation = (0, react_1.useCallback)((section) => {
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
    }, [
        activeSection,
        clearNavigationScheduling,
        navigationLoading,
        onSectionChange,
    ]);
    (0, react_1.useEffect)(() => {
        if (navigationLoading &&
            pendingSectionRef.current &&
            activeSection === pendingSectionRef.current) {
            const frame = window.requestAnimationFrame(() => {
                finishNavigation();
            });
            navigationFramesRef.current.push(frame);
        }
    }, [activeSection, finishNavigation, navigationLoading]);
    (0, react_1.useEffect)(() => () => {
        clearNavigationScheduling();
    }, [clearNavigationScheduling]);
    const workflowItems = [
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
            complete: Boolean(surveySession.location &&
                surveySession.survey &&
                surveySession.specimens.length),
        },
        { id: "submit", label: "Submit", complete: false },
    ];
    function navigateWorkflow(step) {
        if (navigationLoading)
            return;
        const nextSession = (0, surveySessionService_1.saveSurveySession)({
            ...surveySession,
            currentStep: step,
        });
        setSurveySession(nextSession);
        setDataEntryOpen(true);
        if (activeSection !== "data-entry") {
            performNavigation("data-entry");
            const timer = window.setTimeout(() => (0, surveySessionService_1.requestWorkflowStep)(step), NAVIGATION_MIN_VISIBLE_MS);
            navigationTimersRef.current.push(timer);
            return;
        }
        window.requestAnimationFrame(() => (0, surveySessionService_1.requestWorkflowStep)(step));
        setMobileMenuOpen(false);
        setProfileMenuOpen(false);
    }
    const initials = (0, react_1.useMemo)(() => {
        const parts = displayName
            .split(/[.\s_-]+/)
            .map((part) => part.trim())
            .filter(Boolean);
        return (parts
            .slice(0, 2)
            .map((part) => part[0])
            .join("") || "U").toUpperCase();
    }, [displayName]);
    function navigate(section) {
        performNavigation(section);
    }
    return (<div className="app-shell">
      <NavigationLoadingOverlay_1.default visible={navigationLoading}/>

      <header className="app-topbar">
        <div className="app-topbar-left">
          <button type="button" className="app-mobile-menu-button" aria-label="Open navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((current) => !current)}>
            <span />
            <span />
            <span />
          </button>

          <button type="button" className="app-brand" onClick={() => navigate("dashboard")}>
            <img src={naiadd_shield_png_1.default} alt=""/>
            <span>
              <strong>NAIADD</strong>
              <small>Nongame Aquatic Invertebrate Assessment &amp; Distribution Database</small>
            </span>
          </button>
        </div>

        <div className="app-user-wrap">
          <button type="button" className="app-user-button" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((current) => !current)}>
            <span className="app-avatar">{initials}</span>
            <span className="app-user-copy">
              <strong>{displayName}</strong>
              <small>{user_1.USER_ROLE_LABELS[profile.role]}</small>
            </span>
            <span className="app-user-chevron">⌄</span>
          </button>

          {profileMenuOpen && (<div className="app-profile-menu">
              <div>
                <strong>{displayName}</strong>
                <span>{email}</span>
                <em>{user_1.USER_ROLE_LABELS[profile.role]}</em>
              </div>

              <button type="button" onClick={() => navigate("settings")}>
                Preferences
              </button>

              <button type="button" className="app-profile-logout" disabled={loggingOut} onClick={onLogout}>
                {loggingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>)}
        </div>
      </header>

      <div className="app-shell-body">
        <aside className={mobileMenuOpen ? "app-sidebar open" : "app-sidebar"}>
          <nav aria-label="Main navigation">
            {visibleNavigation.map((item) => {
            if (item.id === "data-entry") {
                return (<div className="app-nav-group" key={item.id}>
                    <button type="button" className={activeSection === item.id ? "active" : ""} onClick={() => {
                        navigate(item.id);
                        setDataEntryOpen((current) => !current);
                    }}>
                      <span className="app-nav-icon">{item.icon}</span>
                      <span>{item.label}</span>
                      <span className="app-nav-expand">
                        {dataEntryOpen ? "⌃" : "⌄"}
                      </span>
                    </button>

                    {dataEntryOpen && (<div className="app-nav-children">
                        {workflowItems.map((step) => (<button type="button" key={step.id} className={activeSection === "data-entry" &&
                                surveySession.currentStep === step.id
                                ? "active-child"
                                : ""} onClick={() => navigateWorkflow(step.id)}>
                            <span>{step.complete ? "✓" : "○"}</span>
                            <span>{step.label}</span>
                          </button>))}
                      </div>)}
                  </div>);
            }
            if (item.id === "reports") {
                const reportsActive = activeSection === "reports" ||
                    activeSection === "query-data" ||
                    activeSection === "raw-data" ||
                    activeSection === "cpue" ||
                    activeSection === "size-structure";
                return (<div className="app-nav-group" key={item.id}>
                    <button type="button" className={reportsActive ? "active" : ""} aria-expanded={reportsOpen} onClick={() => setReportsOpen((current) => !current)}>
                      <span className="app-nav-icon">{item.icon}</span>
                      <span>{item.label}</span>
                      <span className="app-nav-expand">
                        {reportsOpen ? "⌃" : "⌄"}
                      </span>
                    </button>

                    {reportsOpen && (<div className="app-nav-children">
                        <button type="button" className={activeSection === "query-data" ||
                            activeSection === "reports"
                            ? "active-child"
                            : ""} onClick={() => navigate("query-data")}>
                          <span>⌕</span>
                          <span>Query Data</span>
                        </button>

                        <button type="button" className={activeSection === "raw-data" ? "active-child" : ""} onClick={() => navigate("raw-data")}>
                          <span>▦</span>
                          <span>Raw Data</span>
                        </button>

                        <button type="button" className={activeSection === "cpue" ? "active-child" : ""} onClick={() => navigate("cpue")}>
                          <span>◫</span>
                          <span>CPUE</span>
                        </button>

                        <button type="button" className={activeSection === "size-structure"
                            ? "active-child"
                            : ""} onClick={() => navigate("size-structure")}>
                          <span>▥</span>
                          <span>Size Structure</span>
                        </button>
                      </div>)}
                  </div>);
            }
            return (<button type="button" key={item.id} className={activeSection === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
                  <span className="app-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>);
        })}
          </nav>

          <div className="app-sidebar-footer">
            <span className={profile.active ? "active" : "inactive"}/>
            <div>
              <strong>
                {profile.active ? "Account active" : "Account inactive"}
              </strong>
              <small>{user_1.USER_ROLE_LABELS[profile.role]}</small>
            </div>
          </div>
        </aside>

        {mobileMenuOpen && (<button type="button" className="app-sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)}/>)}

        <main className="app-content">{children}</main>
      </div>
    </div>);
}
//# sourceMappingURL=AppShell.js.map