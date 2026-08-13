import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import AppRouteRenderer from "./app/AppRouteRenderer";
import type { AppRouteId } from "./app/routes";
import AppShell from "./components/layout/AppShell";
import NavigationLoadingOverlay from "./components/layout/NavigationLoadingOverlay";
import LoginScreen from "./components/LoginScreen";
import {
  loginWithEmailPassword,
  logout,
  requestPasswordReset,
} from "./services/authService";
import { ensureUserProfile } from "./services/userService";
import { initializeVadmaTheme } from "./theme/themeService";
import type { UserProfile } from "./types/user";
import { auth, authPersistenceReady } from "./firebase";
import "./styles/VADMATheme.css";
import "./App.css";

initializeVadmaTheme();

function getFriendlyAuthError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeSection, setActiveSection] =
    useState<AppRouteId>("dashboard");
  const [pendingSection, setPendingSection] =
    useState<AppRouteId | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const navigationTimerRef = useRef<number | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    void authPersistenceReady
      .then(() => {
        if (cancelled) return;

        unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
          setUser(nextUser);
          setUserProfile(null);
          setError("");

          if (nextUser) {
            try {
              const profile = await ensureUserProfile(nextUser);

              if (!cancelled) {
                setUserProfile(profile);
              }
            } catch (profileError) {
              if (!cancelled) {
                setError(getFriendlyAuthError(profileError));
              }
            }
          }

          if (!cancelled) {
            setAuthReady(true);
          }
        });
      })
      .catch((persistenceError) => {
        console.error(
          "Unable to initialize persistent authentication.",
          persistenceError,
        );

        if (!cancelled) {
          setError(
            "Unable to initialize persistent sign-in. Refresh the application and try again.",
          );
          setAuthReady(true);
        }
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
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

  useEffect(
    () => () => {
      if (navigationTimerRef.current !== null) {
        window.clearTimeout(navigationTimerRef.current);
      }
    },
    [],
  );

  function handleSectionChange(nextSection: AppRouteId) {
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

  async function handleLogin(email: string, password: string) {
    setWorking(true);
    setError("");
    setMessage("");

    try {
      await loginWithEmailPassword(email, password);
    } catch (loginError) {
      setError(getFriendlyAuthError(loginError));
    } finally {
      setWorking(false);
    }
  }

  async function handlePasswordReset(email: string) {
    setError("");
    setMessage("");

    if (!email) {
      setError("Enter your email address before requesting a reset.");
      return;
    }

    setWorking(true);

    try {
      await requestPasswordReset(email);
      setMessage("Password reset instructions have been sent.");
    } catch (resetError) {
      setError(getFriendlyAuthError(resetError));
    } finally {
      setWorking(false);
    }
  }

  async function handleLogout() {
    setWorking(true);
    setError("");

    try {
      await logout();
      setActiveSection("dashboard");
      setPendingSection(null);
      setIsNavigating(false);
    } catch {
      setError("Unable to sign out. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  if (!authReady) {
    return <div className="app-loading">Loading application…</div>;
  }

  if (!user) {
    return (
      <LoginScreen
        loading={working}
        error={error}
        message={message}
        onEmailPasswordLogin={handleLogin}
        onPasswordReset={handlePasswordReset}
      />
    );
  }

  if (!userProfile) {
    return (
      <div className="app-loading">
        {error || "Loading user profile…"}
      </div>
    );
  }

  if (!userProfile.active) {
    return (
      <div className="app-loading">
        This account is inactive. Contact the NAIADD Administrator.
      </div>
    );
  }

  return (
    <>
      <AppShell
        profile={userProfile}
        email={user.email ?? userProfile.email}
        activeSection={pendingSection ?? activeSection}
        onSectionChange={handleSectionChange}
        onLogout={handleLogout}
        loggingOut={working}
      >
        <AppRouteRenderer
          routeId={activeSection}
          profile={userProfile}
        />
      </AppShell>

      <NavigationLoadingOverlay visible={isNavigating} />
    </>
  );
}
