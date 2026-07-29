"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VADMA_THEME_CHANGE_EVENT = exports.VADMA_THEME_STORAGE_KEY = void 0;
exports.readStoredVadmaTheme = readStoredVadmaTheme;
exports.applyVadmaTheme = applyVadmaTheme;
exports.initializeVadmaTheme = initializeVadmaTheme;
exports.setVadmaTheme = setVadmaTheme;
exports.subscribeToVadmaTheme = subscribeToVadmaTheme;
const themes_1 = require("./themes");
exports.VADMA_THEME_STORAGE_KEY = "vadma.theme";
exports.VADMA_THEME_CHANGE_EVENT = "vadma-theme-change";
function canUseDom() {
    return typeof window !== "undefined" && typeof document !== "undefined";
}
function readStoredVadmaTheme() {
    if (!canUseDom())
        return themes_1.DEFAULT_VADMA_THEME;
    try {
        const stored = window.localStorage.getItem(exports.VADMA_THEME_STORAGE_KEY);
        return (0, themes_1.isVadmaThemeId)(stored) ? stored : themes_1.DEFAULT_VADMA_THEME;
    }
    catch {
        return themes_1.DEFAULT_VADMA_THEME;
    }
}
function applyVadmaTheme(themeId) {
    if (!canUseDom())
        return;
    const theme = (0, themes_1.getVadmaTheme)(themeId);
    const root = document.documentElement;
    root.dataset.vadmaTheme = theme.id;
    root.style.colorScheme = theme.appearance;
}
function initializeVadmaTheme() {
    const themeId = readStoredVadmaTheme();
    applyVadmaTheme(themeId);
    return themeId;
}
function setVadmaTheme(themeId) {
    applyVadmaTheme(themeId);
    if (!canUseDom())
        return;
    try {
        window.localStorage.setItem(exports.VADMA_THEME_STORAGE_KEY, themeId);
    }
    catch {
        // The theme still applies for this session if storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent(exports.VADMA_THEME_CHANGE_EVENT, {
        detail: themeId,
    }));
}
function subscribeToVadmaTheme(listener) {
    if (!canUseDom())
        return () => undefined;
    const handleThemeChange = (event) => {
        const customEvent = event;
        if ((0, themes_1.isVadmaThemeId)(customEvent.detail)) {
            listener(customEvent.detail);
        }
    };
    const handleStorage = (event) => {
        if (event.key === exports.VADMA_THEME_STORAGE_KEY &&
            (0, themes_1.isVadmaThemeId)(event.newValue)) {
            applyVadmaTheme(event.newValue);
            listener(event.newValue);
        }
    };
    window.addEventListener(exports.VADMA_THEME_CHANGE_EVENT, handleThemeChange);
    window.addEventListener("storage", handleStorage);
    return () => {
        window.removeEventListener(exports.VADMA_THEME_CHANGE_EVENT, handleThemeChange);
        window.removeEventListener("storage", handleStorage);
    };
}
//# sourceMappingURL=themeService.js.map