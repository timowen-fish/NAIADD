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

export default function PreferencesPage() {
  const [activeTheme, setActiveTheme] = useState<VadmaThemeId>(() =>
    readStoredVadmaTheme(),
  );

  useEffect(() => subscribeToVadmaTheme(setActiveTheme), []);

  function chooseTheme(themeId: VadmaThemeId): void {
    setVadmaTheme(themeId);
    setActiveTheme(themeId);
  }

  return (
    <main className="preferences-page">
      <header className="preferences-header">
        <div>
          <p>Personalization</p>
          <h1>Preferences</h1>
          <span>
            Choose the application theme used across VADMA. Changes apply
            immediately and remain selected on this device.
          </span>
        </div>
      </header>

      <section className="preferences-section" aria-labelledby="theme-heading">
        <div className="preferences-section-heading">
          <div>
            <p>Appearance</p>
            <h2 id="theme-heading">VADMA Theme</h2>
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
