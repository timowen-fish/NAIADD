import { useEffect, useState, type CSSProperties } from "react";
import {
  readStoredVadmaTheme,
  setVadmaTheme,
  subscribeToVadmaTheme,
} from "../theme/themeService";
import {
  VADMA_THEMES,
  type VadmaThemeDefinition,
  type VadmaThemeId,
} from "../theme/themes";
import "./PreferencesPage.css";

const OFFLINE_HELPER_STATUS_URL = "http://127.0.0.1:43128/status";
const OFFLINE_HELPER_UPDATE_APP_URL = "http://127.0.0.1:43128/update-app";
const PRODUCTION_APP_MANIFEST_URL = "/offline-app-manifest.json";
const OFFLINE_HELPER_DOWNLOAD_URL =
  "/downloads/NAIADD-Offline-Helper-1.0.0-x64-setup.exe";
const OFFLINE_HELPER_EXPECTED_VERSION = "1.0.0";

type OfflineHelperStatus = {
  ok?: boolean;
  version?: string;
  workspacePath?: string;
  workspaceWritable?: boolean;
  snapshotExists?: boolean;
  offlineAppExists?: boolean;
  offlineAppVersion?: string;
  appUpdateInProgress?: boolean;
};

type ProductionAppManifest = {
  version?: string;
};

type HelperState =
  | { state: "checking" }
  | { state: "connected"; status: OfflineHelperStatus }
  | { state: "not-installed" };


function compareVersions(left: string, right: string): number {
  const a = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

function isDesktopDevice(): boolean {
  const mobileUserAgent =
    /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(
      navigator.userAgent ?? "",
    );
  const coarsePointer =
    window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const smallScreen =
    window.matchMedia?.("(max-width: 900px)").matches ?? false;

  return !mobileUserAgent && !(coarsePointer && smallScreen);
}

export default function PreferencesPage() {
  const [activeTheme, setActiveTheme] = useState<VadmaThemeId>(() =>
    readStoredVadmaTheme(),
  );
  const [desktopDevice, setDesktopDevice] = useState(false);
  const [helperState, setHelperState] = useState<HelperState>({
    state: "checking",
  });
  const [productionAppVersion, setProductionAppVersion] = useState<string | null>(null);
  const [applicationChecking, setApplicationChecking] = useState(false);
  const [applicationUpdating, setApplicationUpdating] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState("");
  const [applicationError, setApplicationError] = useState("");

  useEffect(() => subscribeToVadmaTheme(setActiveTheme), []);

  useEffect(() => {
    const desktop = isDesktopDevice();
    setDesktopDevice(desktop);

    if (!desktop) {
      return;
    }

    let cancelled = false;

    async function checkHelper() {
      setHelperState({ state: "checking" });

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 1500);

      try {
        const response = await fetch(OFFLINE_HELPER_STATUS_URL, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const status = (await response.json()) as OfflineHelperStatus;

        if (!cancelled && status.ok === true) {
          setHelperState({
            state: "connected",
            status,
          });
        } else if (!cancelled) {
          setHelperState({ state: "not-installed" });
        }
      } catch {
        if (!cancelled) {
          setHelperState({ state: "not-installed" });
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void checkHelper();

    const interval = window.setInterval(() => {
      void checkHelper();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  async function checkApplicationStatus(): Promise<void> {
    if (!desktopDevice) return;

    setApplicationChecking(true);
    setApplicationError("");

    try {
      const [helperResponse, manifestResponse] = await Promise.all([
        fetch(OFFLINE_HELPER_STATUS_URL, { cache: "no-store" }),
        fetch(`${PRODUCTION_APP_MANIFEST_URL}?t=${Date.now()}`, {
          cache: "no-store",
        }),
      ]);

      if (!helperResponse.ok) {
        throw new Error("Offline Helper could not be reached.");
      }

      if (!manifestResponse.ok) {
        throw new Error("Production application manifest could not be reached.");
      }

      const helperStatus = (await helperResponse.json()) as OfflineHelperStatus;
      const productionManifest =
        (await manifestResponse.json()) as ProductionAppManifest;

      if (helperStatus.ok !== true) {
        throw new Error("Offline Helper returned an invalid status.");
      }

      if (!productionManifest.version) {
        throw new Error("Production application version is unavailable.");
      }

      setHelperState({
        state: "connected",
        status: helperStatus,
      });
      setProductionAppVersion(productionManifest.version);
      setApplicationMessage("");
    } catch (error) {
      setApplicationError(
        error instanceof Error
          ? error.message
          : "Application status could not be checked.",
      );
    } finally {
      setApplicationChecking(false);
    }
  }

  async function forceUpdateLocalApplication(): Promise<void> {
    if (!helperConnected) return;

    setApplicationUpdating(true);
    setApplicationError("");
    setApplicationMessage("Updating the local NAIADD application...");

    try {
      const response = await fetch(OFFLINE_HELPER_UPDATE_APP_URL, {
        method: "POST",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Update request failed with HTTP ${response.status}.`);
      }

      const startedAt = Date.now();
      const timeoutMs = 120000;

      while (Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));

        const statusResponse = await fetch(OFFLINE_HELPER_STATUS_URL, {
          cache: "no-store",
        });

        if (!statusResponse.ok) continue;

        const status = (await statusResponse.json()) as OfflineHelperStatus;

        setHelperState({
          state: "connected",
          status,
        });

        if (!status.appUpdateInProgress) {
          await checkApplicationStatus();
          setApplicationMessage("Local NAIADD application update completed.");
          return;
        }
      }

      throw new Error(
        "The local application update did not finish within two minutes.",
      );
    } catch (error) {
      setApplicationMessage("");
      setApplicationError(
        error instanceof Error
          ? error.message
          : "The local NAIADD application could not be updated.",
      );
    } finally {
      setApplicationUpdating(false);
    }
  }

  useEffect(() => {
    if (!desktopDevice || helperState.state !== "connected") {
      return;
    }

    void checkApplicationStatus();
    // Re-check when the helper first becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopDevice, helperState.state]);

  function chooseTheme(themeId: VadmaThemeId): void {
    setVadmaTheme(themeId);
    setActiveTheme(themeId);
  }

  const helperConnected = helperState.state === "connected";
  const helperVersion =
    helperState.state === "connected"
      ? helperState.status.version ?? "Unknown"
      : null;
  const helperVersionComparison =
    helperConnected && helperVersion
      ? compareVersions(helperVersion, OFFLINE_HELPER_EXPECTED_VERSION)
      : null;
  const helperCurrent =
    helperVersionComparison !== null && helperVersionComparison >= 0;
  const helperUpdateAvailable =
    helperVersionComparison !== null && helperVersionComparison < 0;
  const localAppVersion =
    helperState.state === "connected"
      ? helperState.status.offlineAppVersion ?? null
      : null;
  const localApplicationCurrent =
    Boolean(
      localAppVersion &&
        productionAppVersion &&
        localAppVersion === productionAppVersion,
    );

  return (
    <main className="preferences-page">
      <header className="preferences-header">
        <div>
          <p>Personalization</p>
          <h1>Preferences</h1>
          <span>
            Choose your NAIADD appearance and workstation options. Changes apply
            immediately and remain selected on this device.
          </span>
        </div>
      </header>

      {desktopDevice && (
        <section
          className="preferences-section preferences-offline-section"
          aria-labelledby="offline-helper-heading"
        >
          <div className="preferences-section-heading">
            <div>
              <p>Workstation Protection</p>
              <h2 id="offline-helper-heading">NAIADD Offline Helper</h2>
            </div>

            <span
              className={`offline-helper-badge ${
                helperConnected ? "connected" : "not-connected"
              }`}
            >
              <i aria-hidden="true" />
              {helperState.state === "checking"
                ? "Checking..."
                : helperConnected
                  ? "Connected"
                  : "Not Installed"}
            </span>
          </div>

          <div className="offline-helper-card">
            <div className="offline-helper-copy">
              <h3>
                {helperConnected
                  ? "Offline workstation protection is active"
                  : "Protect this workstation from browser data loss"}
              </h3>

              <p>
                The NAIADD Offline Helper stores the application, production
                snapshot, authorized user profile, survey drafts, current data
                entry, and saved queries in{" "}
                <strong>C:\TSE\NAIADD</strong>. This lets supported Windows
                workstations continue operating even when browser storage is
                cleared or an internet connection is unavailable.
              </p>

              {helperConnected ? (
                <div className="offline-helper-details">
                  <span>
                    <b>Version</b>
                    {helperVersion}
                  </span>
                  <span>
                    <b>Workspace</b>
                    {helperState.status.workspacePath ?? "C:\\TSE\\NAIADD"}
                  </span>
                  <span>
                    <b>Storage</b>
                    {helperState.status.workspaceWritable
                      ? "Ready"
                      : "Needs attention"}
                  </span>
                </div>
              ) : (
                <p className="offline-helper-note">
                  Install this only on Windows workstations that need durable
                  offline protection. Phones and tablets continue using the
                  normal NAIADD PWA.
                </p>
              )}
            </div>

            <div className="offline-helper-actions">
              {helperConnected && helperCurrent ? (
                <div className="offline-helper-ready">
                  <span aria-hidden="true">✓</span>
                  Helper Connected
                </div>
              ) : helperUpdateAvailable ? (
                <div className="offline-helper-update">
                  Version {helperVersion} detected. Version{" "}
                  {OFFLINE_HELPER_EXPECTED_VERSION} is available.
                </div>
              ) : null}

              <a
                className="offline-helper-download"
                href={OFFLINE_HELPER_DOWNLOAD_URL}
                download
              >
                {helperConnected
                  ? helperCurrent
                    ? "Download / Reinstall Helper"
                    : "Download Helper Update"
                  : "Download Offline Helper"}
              </a>

              <small>
                Windows x64 • NAIADD Offline Helper{" "}
                {OFFLINE_HELPER_EXPECTED_VERSION}
              </small>
            </div>
          </div>
        </section>
      )}

      {desktopDevice && helperConnected && (
        <section
          className="preferences-section preferences-application-section"
          aria-labelledby="application-status-heading"
        >
          <div className="preferences-section-heading">
            <div>
              <p>Local Workstation Copy</p>
              <h2 id="application-status-heading">Application Status</h2>
            </div>

            <span
              className={`application-status-badge ${
                localApplicationCurrent ? "current" : "attention"
              }`}
            >
              <i aria-hidden="true" />
              {applicationChecking
                ? "Checking..."
                : localApplicationCurrent
                  ? "Up to Date"
                  : productionAppVersion
                    ? "Update Available"
                    : "Not Checked"}
            </span>
          </div>

          <div className="application-status-card">
            <div className="application-status-copy">
              <h3>
                {localApplicationCurrent
                  ? "Local NAIADD matches production"
                  : "Verify the workstation application"}
              </h3>
              <p>
                This compares the NAIADD application stored by the Offline Helper
                with the current production build. If a workstation is showing
                an older page or behavior, you can force the helper to refresh
                its local application copy here.
              </p>

              <div className="application-version-grid">
                <span>
                  <b>Local Application</b>
                  {localAppVersion ?? "Unknown"}
                </span>
                <span>
                  <b>Production Application</b>
                  {productionAppVersion ?? "Not checked"}
                </span>
              </div>

              {applicationMessage && (
                <div className="application-status-message" role="status">
                  {applicationMessage}
                </div>
              )}

              {applicationError && (
                <div
                  className="application-status-message error"
                  role="alert"
                >
                  {applicationError}
                </div>
              )}
            </div>

            <div className="application-status-actions">
              <button
                type="button"
                className="application-status-secondary"
                disabled={applicationChecking || applicationUpdating}
                onClick={() => void checkApplicationStatus()}
              >
                {applicationChecking ? "Checking..." : "Check Again"}
              </button>

              <button
                type="button"
                className="application-status-primary"
                disabled={applicationUpdating}
                onClick={() => void forceUpdateLocalApplication()}
              >
                {applicationUpdating
                  ? "Updating Local NAIADD..."
                  : localApplicationCurrent
                    ? "Force Update Local Copy"
                    : "Update Local NAIADD"}
              </button>

              <small>
                The force-update action refreshes the helper-managed application
                files. It does not delete drafts, snapshots, saved queries, or
                other NAIADD workspace data.
              </small>
            </div>
          </div>
        </section>
      )}

      <section className="preferences-section" aria-labelledby="theme-heading">
        <div className="preferences-section-heading">
          <div>
            <p>Appearance</p>
            <h2 id="theme-heading">NAIADD Theme</h2>
          </div>
          <span>{VADMA_THEMES.length} available themes</span>
        </div>

        <div className="theme-gallery">
          {VADMA_THEMES.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              selected={theme.id === activeTheme}
              onSelect={() => chooseTheme(theme.id)}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function ThemeCard({
  theme,
  selected,
  onSelect,
}: {
  theme: VadmaThemeDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article className={selected ? "theme-card selected" : "theme-card"}>
      <button
        type="button"
        className="theme-card-button"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <ThemePreview theme={theme} />

        <div className="theme-card-copy">
          <div className="theme-card-title-row">
            <h3>{theme.name}</h3>
            {selected && <span>Current</span>}
          </div>
          <p>{theme.description}</p>
        </div>

        <div className="theme-card-action">
          {selected ? "Theme Applied" : "Apply Theme"}
        </div>
      </button>
    </article>
  );
}

function ThemePreview({ theme }: { theme: VadmaThemeDefinition }) {
  const style = {
    "--preview-background": theme.preview.background,
    "--preview-panel": theme.preview.panel,
    "--preview-accent": theme.preview.accent,
    "--preview-secondary": theme.preview.secondary,
    "--preview-text": theme.preview.text,
  } as CSSProperties;

  return (
    <div className="theme-preview" style={style} aria-hidden="true">
      <div className="theme-preview-sidebar">
        <span />
        <span />
        <span />
      </div>
      <div className="theme-preview-content">
        <div className="theme-preview-header" />
        <div className="theme-preview-metrics">
          <span />
          <span />
          <span />
        </div>
        <div className="theme-preview-panel">
          <span />
          <span />
          <strong />
        </div>
      </div>
    </div>
  );
}
