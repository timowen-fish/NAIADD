import {
  DEFAULT_VADMA_THEME,
  getVadmaTheme,
  isVadmaThemeId,
  type VadmaThemeId,
} from "./themes";

export const VADMA_THEME_STORAGE_KEY = "vadma.theme";
export const VADMA_THEME_CHANGE_EVENT = "vadma-theme-change";

function canUseDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
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
  applyVadmaTheme(themeId);

  if (!canUseDom()) return;

  try {
    window.localStorage.setItem(VADMA_THEME_STORAGE_KEY, themeId);
  } catch {
    // The theme still applies for this session if storage is unavailable.
  }

  window.dispatchEvent(
    new CustomEvent<VadmaThemeId>(VADMA_THEME_CHANGE_EVENT, {
      detail: themeId,
    }),
  );
}

export function subscribeToVadmaTheme(
  listener: (themeId: VadmaThemeId) => void,
): () => void {
  if (!canUseDom()) return () => undefined;

  const handleThemeChange = (event: Event) => {
    const customEvent = event as CustomEvent<VadmaThemeId>;
    if (isVadmaThemeId(customEvent.detail)) {
      listener(customEvent.detail);
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === VADMA_THEME_STORAGE_KEY &&
      isVadmaThemeId(event.newValue)
    ) {
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
