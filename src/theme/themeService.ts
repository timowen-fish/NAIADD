import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  DEFAULT_VADMA_THEME,
  getVadmaTheme,
  isVadmaThemeId,
  type VadmaThemeId,
} from "./themes";

export const VADMA_THEME_STORAGE_KEY = "naiadd.theme";
export const VADMA_THEME_CHANGE_EVENT = "naiadd-theme-change";

const OFFLINE_HELPER_THEME_URL =
  "http://127.0.0.1:43128/theme-state";

type DurableThemeState = {
  format: "NAIADD_OFFLINE_THEME_V1";
  uid: string;
  themeId: VadmaThemeId;
  updatedAt: string;
};

function canUseDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function applyAndStoreTheme(themeId: VadmaThemeId): VadmaThemeId {
  applyVadmaTheme(themeId);
  if (!canUseDom()) return themeId;
  try {
    window.localStorage.setItem(VADMA_THEME_STORAGE_KEY, themeId);
  } catch {}
  window.dispatchEvent(
    new CustomEvent<VadmaThemeId>(VADMA_THEME_CHANGE_EVENT, { detail: themeId }),
  );
  return themeId;
}

async function writeThemeToOfflineHelper(uid: string, themeId: VadmaThemeId): Promise<boolean> {
  if (!uid) return false;
  try {
    const response = await fetch(OFFLINE_HELPER_THEME_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "NAIADD_OFFLINE_THEME_V1",
        uid,
        themeId,
        updatedAt: new Date().toISOString(),
      } satisfies DurableThemeState),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function readThemeFromOfflineHelper(uid: string): Promise<VadmaThemeId | null> {
  if (!uid) return null;
  try {
    const response = await fetch(OFFLINE_HELPER_THEME_URL, { method: "GET", cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as Partial<DurableThemeState>;
    if (payload.format !== "NAIADD_OFFLINE_THEME_V1" || payload.uid !== uid || !isVadmaThemeId(payload.themeId)) {
      return null;
    }
    return payload.themeId;
  } catch {
    return null;
  }
}

export function readStoredVadmaTheme(): VadmaThemeId {
  if (!canUseDom()) return DEFAULT_VADMA_THEME;
  try {
    const stored = window.localStorage.getItem(VADMA_THEME_STORAGE_KEY);
    return isVadmaThemeId(stored) ? stored : DEFAULT_VADMA_THEME;
  } catch {
    return DEFAULT_VADMA_THEME;
  }
}

export function applyVadmaTheme(themeId: VadmaThemeId): void {
  if (!canUseDom()) return;
  const theme = getVadmaTheme(themeId);
  const root = document.documentElement;
  root.dataset.vadmaTheme = theme.id;
  root.style.colorScheme = theme.appearance;
}

export function initializeVadmaTheme(): VadmaThemeId {
  const themeId = readStoredVadmaTheme();
  applyVadmaTheme(themeId);
  return themeId;
}

export function setVadmaTheme(themeId: VadmaThemeId): void {
  applyAndStoreTheme(themeId);
  let uid = auth.currentUser?.uid ?? "";

  if (!uid && canUseDom()) {
    try {
      uid = window.localStorage.getItem("naiadd.offlineUserUid")?.trim() ?? "";
    } catch {
      uid = "";
    }
  }

  if (!uid) return;
  void writeThemeToOfflineHelper(uid, themeId);
  void setDoc(
    doc(db, "users", uid, "preferences", "settings"),
    { themeId, updatedAt: new Date().toISOString() },
    { merge: true },
  ).catch((error) => {
    console.warn("Unable to sync NAIADD theme preference.", error);
  });
}

export async function syncVadmaTheme(uid: string): Promise<VadmaThemeId> {
  const localTheme = readStoredVadmaTheme();
  try {
    const preferenceRef = doc(db, "users", uid, "preferences", "settings");
    const snapshot = await getDoc(preferenceRef);
    if (snapshot.exists()) {
      const data = snapshot.data() as { themeId?: unknown };
      if (isVadmaThemeId(data.themeId)) {
        applyAndStoreTheme(data.themeId);
        void writeThemeToOfflineHelper(uid, data.themeId);
        return data.themeId;
      }
    }
    await setDoc(preferenceRef, { themeId: localTheme, updatedAt: new Date().toISOString() }, { merge: true });
    void writeThemeToOfflineHelper(uid, localTheme);
    return localTheme;
  } catch (error) {
    console.warn("Unable to synchronize NAIADD theme from Firestore. Trying workstation copy.", error);
  }
  const helperTheme = await readThemeFromOfflineHelper(uid);
  if (helperTheme) return applyAndStoreTheme(helperTheme);
  void writeThemeToOfflineHelper(uid, localTheme);
  return localTheme;
}

export function subscribeToVadmaTheme(listener: (themeId: VadmaThemeId) => void): () => void {
  if (!canUseDom()) return () => undefined;
  const handleThemeChange = (event: Event) => {
    const customEvent = event as CustomEvent<VadmaThemeId>;
    if (isVadmaThemeId(customEvent.detail)) listener(customEvent.detail);
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === VADMA_THEME_STORAGE_KEY && isVadmaThemeId(event.newValue)) {
      applyVadmaTheme(event.newValue);
      listener(event.newValue);
    }
  };
  window.addEventListener(VADMA_THEME_CHANGE_EVENT, handleThemeChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(VADMA_THEME_CHANGE_EVENT, handleThemeChange);
    window.removeEventListener("storage", handleStorage);
  };
}
