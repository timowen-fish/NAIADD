"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
const react_1 = require("react");
const auth_1 = require("firebase/auth");
const AppRouteRenderer_1 = __importDefault(require("./app/AppRouteRenderer"));
const AppShell_1 = __importDefault(require("./components/layout/AppShell"));
const NavigationLoadingOverlay_1 = __importDefault(require("./components/layout/NavigationLoadingOverlay"));
const LoginScreen_1 = __importDefault(require("./components/LoginScreen"));
const authService_1 = require("./services/authService");
const userService_1 = require("./services/userService");
const themeService_1 = require("./theme/themeService");
const firebase_1 = require("./firebase");
require("./styles/VADMATheme.css");
require("./App.css");
(0, themeService_1.initializeVadmaTheme)();
function getFriendlyAuthError(error) {
    const code = typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    switch (code) {
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
            return "The email or password is incorrect.";
        case "auth/invalid-email":
            return "Enter a valid email address.";
        case "auth/too-many-requests":
            return "Too many attempts. Please wait and try again.";
        case "auth/network-request-failed":
            return "A network error occurred. Check your connection and try again.";
        case "permission-denied":
            return "Firestore denied access to the user profile.";
        default:
            return "Unable to complete the request. Please try again.";
    }
}
function App() {
    const [user, setUser] = (0, react_1.useState)(null);
    const [userProfile, setUserProfile] = (0, react_1.useState)(null);
    const [activeSection, setActiveSection] = (0, react_1.useState)("dashboard");
    const [pendingSection, setPendingSection] = (0, react_1.useState)(null);
    const [isNavigating, setIsNavigating] = (0, react_1.useState)(false);
    const navigationTimerRef = (0, react_1.useRef)(null);
    const [authReady, setAuthReady] = (0, react_1.useState)(false);
    const [working, setWorking] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)("");
    const [message, setMessage] = (0, react_1.useState)("");
    (0, react_1.useEffect)(() => {
        return (0, auth_1.onAuthStateChanged)(firebase_1.auth, async (nextUser) => {
            setUser(nextUser);
            setUserProfile(null);
            setError("");
            if (nextUser) {
                try {
                    const profile = await (0, userService_1.ensureUserProfile)(nextUser);
                    setUserProfile(profile);
                }
                catch (profileError) {
                    setError(getFriendlyAuthError(profileError));
                }
            }
            setAuthReady(true);
        });
    }, []);
    (0, react_1.useEffect)(() => {
        if (!isNavigating || pendingSection !== activeSection) {
            return;
        }
        const animationFrame = window.requestAnimationFrame(() => {
            navigationTimerRef.current = window.setTimeout(() => {
                setIsNavigating(false);
                setPendingSection(null);
                navigationTimerRef.current = null;
            }, 120);
        });
        return () => {
            window.cancelAnimationFrame(animationFrame);
            if (navigationTimerRef.current !== null) {
                window.clearTimeout(navigationTimerRef.current);
                navigationTimerRef.current = null;
            }
        };
    }, [activeSection, isNavigating, pendingSection]);
    (0, react_1.useEffect)(() => () => {
        if (navigationTimerRef.current !== null) {
            window.clearTimeout(navigationTimerRef.current);
        }
    }, []);
    function handleSectionChange(nextSection) {
        if (nextSection === activeSection || isNavigating) {
            return;
        }
        setPendingSection(nextSection);
        setIsNavigating(true);
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                setActiveSection(nextSection);
            });
        });
    }
    async function handleLogin(email, password) {
        setWorking(true);
        setError("");
        setMessage("");
        try {
            await (0, authService_1.loginWithEmailPassword)(email, password);
        }
        catch (loginError) {
            setError(getFriendlyAuthError(loginError));
        }
        finally {
            setWorking(false);
        }
    }
    async function handlePasswordReset(email) {
        setError("");
        setMessage("");
        if (!email) {
            setError("Enter your email address before requesting a reset.");
            return;
        }
        setWorking(true);
        try {
            await (0, authService_1.requestPasswordReset)(email);
            setMessage("Password reset instructions have been sent.");
        }
        catch (resetError) {
            setError(getFriendlyAuthError(resetError));
        }
        finally {
            setWorking(false);
        }
    }
    async function handleLogout() {
        setWorking(true);
        setError("");
        try {
            await (0, authService_1.logout)();
            setActiveSection("dashboard");
            setPendingSection(null);
            setIsNavigating(false);
        }
        catch {
            setError("Unable to sign out. Please try again.");
        }
        finally {
            setWorking(false);
        }
    }
    if (!authReady) {
        return <div className="app-loading">Loading application…</div>;
    }
    if (!user) {
        return (<LoginScreen_1.default loading={working} error={error} message={message} onEmailPasswordLogin={handleLogin} onPasswordReset={handlePasswordReset}/>);
    }
    if (!userProfile) {
        return (<div className="app-loading">
        {error || "Loading user profile…"}
      </div>);
    }
    if (!userProfile.active) {
        return (<div className="app-loading">
        This account is inactive. Contact the VADMA Administrator.
      </div>);
    }
    return (<>
      <AppShell_1.default profile={userProfile} email={user.email ?? userProfile.email} activeSection={pendingSection ?? activeSection} onSectionChange={handleSectionChange} onLogout={handleLogout} loggingOut={working}>
        <AppRouteRenderer_1.default routeId={activeSection} profile={userProfile}/>
      </AppShell_1.default>

      <NavigationLoadingOverlay_1.default visible={isNavigating}/>
    </>);
}
//# sourceMappingURL=App.js.map