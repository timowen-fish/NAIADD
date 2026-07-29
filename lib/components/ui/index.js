"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrimaryButton = PrimaryButton;
exports.SecondaryButton = SecondaryButton;
exports.Card = Card;
exports.PageHeader = PageHeader;
exports.StatusBadge = StatusBadge;
exports.EmptyState = EmptyState;
require("../../styles/DesignSystem.css");
function PrimaryButton({ children, loading = false, disabled, ...props }) {
    return (<button {...props} type={props.type ?? "button"} className={`ui-button ui-button-primary ${props.className ?? ""}`} disabled={disabled || loading}>
      {loading ? "Working..." : children}
    </button>);
}
function SecondaryButton({ children, loading = false, disabled, ...props }) {
    return (<button {...props} type={props.type ?? "button"} className={`ui-button ui-button-secondary ${props.className ?? ""}`} disabled={disabled || loading}>
      {loading ? "Working..." : children}
    </button>);
}
function Card({ children, className = "", ...props }) {
    return (<section {...props} className={`ui-card ${className}`}>
      {children}
    </section>);
}
function PageHeader({ eyebrow, title, description, actions, }) {
    return (<header className="ui-page-header">
      <div>
        {eyebrow && <p className="ui-page-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </header>);
}
function StatusBadge({ tone = "neutral", children, }) {
    return <span className={`ui-status-badge ${tone}`}>{children}</span>;
}
function EmptyState({ icon = "◇", title, description, }) {
    return (<div className="ui-empty-state">
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>);
}
//# sourceMappingURL=index.js.map