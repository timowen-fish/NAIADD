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
  tryStoredWorkstationLogin,
} from "./services/authService";
import { ensureUserProfile } from "./services/userService";
import {
  loadWorkstationProfile,
  saveWorkstationProfile,
  synchronizeUserState,
} from "./services/userSyncService";
import { initializeVadmaTheme } from "./theme/themeService";
import type { UserProfile } from "./types/user";
import { auth, authPersistenceReady } from "./firebase";
import "./styles/VADMATheme.css";
import "./App.css";

initializeVadmaTheme();

const APP_ROUTE_EVENT = "naiadd-app-route";
const OFFLINE_HELPER_UPDATE_URL =
  "http://127.0.0.1:43128/update-app";

function isLocalHelperApp(): boolean {
  return (
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost"
  );
}

async function requestImmediateOfflineAppSync(): Promise<void> {
  if (!navigator.onLine) return;

  try {
    await fetch(OFFLINE_HELPER_UPDATE_URL, {
      method: "POST",
      cache: "no-store",
    });
  } catch {
    // No NAIADD helper is installed/running on this device.
  }
}

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
  const [offlineWorkstationSession, setOfflineWorkstationSession] = useState(false);

  useEffect(() => {
    let lastRequestedAt = 0;

    const requestSync = () => {
      if (!navigator.onLine) return;

      const now = Date.now();
      if (now - lastRequestedAt < 5000) return;

      lastRequestedAt = now;
      void requestImmediateOfflineAppSync();
    };

    requestSync();
    window.addEventListener("online", requestSync);
    window.addEventListener("focus", requestSync);
    const interval = window.setInterval(requestSync, 60_000);

    return () => {
      window.removeEventListener("online", requestSync);
      window.removeEventListener("focus", requestSync);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    void authPersistenceReady
      .then(() => {
        if (cancelled) return;

        unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
          setUser(nextUser);
          setError("");

          if (nextUser) {
            setOfflineWorkstationSession(false);

            try {
              const profile = await ensureUserProfile(nextUser);

              if (!cancelled) {
                setUserProfile(profile);
                void saveWorkstationProfile(profile);
                void synchronizeUserState(profile);
              }
            } catch (profileError) {
              if (!cancelled) {
                setUserProfile(null);
                setError(getFriendlyAuthError(profileError));
              }
            }
          } else {
            setUserProfile(null);

            if (navigator.onLine) {
              const autoLoginResult =
                await tryStoredWorkstationLogin();

              if (autoLoginResult === "success") {
                return;
              }

              if (autoLoginResult === "invalid" && !cancelled) {
                setMessage(
                  "Your saved workstation sign-in needs to be refreshed. Sign in once to reconnect this workstation.",
                );
              }

              if (
                autoLoginResult === "unavailable" &&
                isLocalHelperApp()
              ) {
                const profile = await loadWorkstationProfile();

                if (profile && profile.active && !cancelled) {
                  setUserProfile(profile);
                  setOfflineWorkstationSession(true);
                  void synchronizeUserState(profile);
                }
              }
            } else if (isLocalHelperApp()) {
              const profile = await loadWorkstationProfile();

              if (profile && profile.active && !cancelled) {
                setUserProfile(profile);
                setOfflineWorkstationSession(true);
                void synchronizeUserState(profile);
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
    if (!offlineWorkstationSession || !isLocalHelperApp()) {
      return;
    }

    let cancelled = false;
    let reconnecting = false;

    async function upgradeToOnlineSession() {
      if (
        cancelled ||
        reconnecting ||
        !navigator.onLine ||
        auth.currentUser
      ) {
        return;
      }

      reconnecting = true;
      try {
        const result = await tryStoredWorkstationLogin();

        if (result === "invalid" && !cancelled) {
          setMessage(
            "Your saved workstation sign-in needs to be refreshed. Sign in once to reconnect this workstation.",
          );
        }
      } finally {
        reconnecting = false;
      }
    }

    const handleOnline = () => {
      void upgradeToOnlineSession();
    };

    window.addEventListener("online", handleOnline);

    if (navigator.onLine) {
      void upgradeToOnlineSession();
    }

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
    };
  }, [offlineWorkstationSession]);

  useEffect(() => {
    const handleRoute = (event: Event) => {
      const detail = (event as CustomEvent<{ routeId?: AppRouteId }>).detail;
      if (detail?.routeId) {
        handleSectionChange(detail.routeId);
      }
    };

    window.addEventListener(APP_ROUTE_EVENT, handleRoute);
    return () => window.removeEventListener(APP_ROUTE_EVENT, handleRoute);
  });

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
      setOfflineWorkstationSession(false);
      setUserProfile(null);
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

  if (!user && !offlineWorkstationSession) {
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
        email={user?.email ?? userProfile.email}
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
