"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = PreferencesPage;
const react_1 = require("react");
const themeService_1 = require("../theme/themeService");
const themes_1 = require("../theme/themes");
require("./PreferencesPage.css");
function PreferencesPage() {
    const [activeTheme, setActiveTheme] = (0, react_1.useState)(() => (0, themeService_1.readStoredVadmaTheme)());
    (0, react_1.useEffect)(() => (0, themeService_1.subscribeToVadmaTheme)(setActiveTheme), []);
    function chooseTheme(themeId) {
        (0, themeService_1.setVadmaTheme)(themeId);
        setActiveTheme(themeId);
    }
    return (<main className="preferences-page">
      <header className="preferences-header">
        <div>
          <p>Personalization</p>
          <h1>Preferences</h1>
          <span>
            Choose the application theme used across NAIADD. Changes apply
            immediately and remain selected on this device.
          </span>
        </div>
      </header>

      <section className="preferences-section" aria-labelledby="theme-heading">
        <div className="preferences-section-heading">
          <div>
            <p>Appearance</p>
            <h2 id="theme-heading">NAIADD Theme</h2>
          </div>
          <span>{themes_1.VADMA_THEMES.length} available themes</span>
        </div>

        <div className="theme-gallery">
          {themes_1.VADMA_THEMES.map((theme) => (<ThemeCard key={theme.id} theme={theme} selected={theme.id === activeTheme} onSelect={() => chooseTheme(theme.id)}/>))}
        </div>
      </section>
    </main>);
}
function ThemeCard({ theme, selected, onSelect, }) {
    return (<article className={selected ? "theme-card selected" : "theme-card"}>
      <button type="button" className="theme-card-button" aria-pressed={selected} onClick={onSelect}>
        <ThemePreview theme={theme}/>

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
    </article>);
}
function ThemePreview({ theme }) {
    const style = {
        "--preview-background": theme.preview.background,
        "--preview-panel": theme.preview.panel,
        "--preview-accent": theme.preview.accent,
        "--preview-secondary": theme.preview.secondary,
        "--preview-text": theme.preview.text,
    };
    return (<div className="theme-preview" style={style} aria-hidden="true">
      <div className="theme-preview-sidebar">
        <span />
        <span />
        <span />
      </div>
      <div className="theme-preview-content">
        <div className="theme-preview-header"/>
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
    </div>);
}
//# sourceMappingURL=PreferencesPage.js.map