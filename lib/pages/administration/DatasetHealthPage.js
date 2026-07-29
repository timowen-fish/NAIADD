"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DatasetHealthPage;
const ui_1 = require("../../components/ui");
const useDatasetManager_1 = require("../../hooks/useDatasetManager");
require("./DatasetHealthPage.css");
function formatNumber(value) {
    return new Intl.NumberFormat().format(value);
}
function formatDate(value) {
    if (!value)
        return "Not available";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleString();
}
function formatDuration(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
        return "Not available";
    }
    return milliseconds < 1000
        ? `${Math.round(milliseconds)} ms`
        : `${(milliseconds / 1000).toFixed(2)} seconds`;
}
function DatasetHealthPage({ onBack, }) {
    const { status, diagnostics, isReady, isLoading, isRefreshing, error, refresh, } = (0, useDatasetManager_1.useDatasetManager)();
    const isWorking = isLoading || isRefreshing;
    const message = error
        ? error
        : isRefreshing
            ? "Refreshing the encrypted snapshot and lightweight dataset catalog..."
            : isLoading
                ? "Loading the snapshot metadata, collection index, and published delta index..."
                : isReady
                    ? "The lightweight VADMA dataset catalog is ready. Full Parquet rows are loaded only when needed."
                    : "The dataset runtime has not been initialized.";
    async function handleRefresh() {
        try {
            await refresh();
        }
        catch {
            // The manager emits the error state consumed by the hook.
        }
    }
    return (<div className="dataset-health-page">
      <div className="dataset-health-actions">
        <button type="button" className="dataset-health-back" onClick={onBack}>
          ← Back to Administration
        </button>

        <button type="button" className="dataset-health-refresh" disabled={isWorking} onClick={() => void handleRefresh()}>
          {isRefreshing ? "Refreshing..." : "Refresh catalog"}
        </button>
      </div>

      <ui_1.PageHeader eyebrow="VADMA Data Infrastructure" title="Dataset Health Check" description="Verify the historic snapshot, published deltas, and lightweight runtime catalog without loading 1.35 million complete rows into browser memory."/>

      <ui_1.Card className="dataset-health-status-card">
        <div className="dataset-health-status-heading">
          <div>
            <p className="dataset-health-label">Pipeline status</p>
            <h2>
              {isReady
            ? "Dataset catalog available"
            : status === "error"
                ? "Dataset unavailable"
                : "Checking dataset"}
            </h2>
          </div>

          <ui_1.StatusBadge tone={isReady
            ? "success"
            : status === "error"
                ? "danger"
                : "neutral"}>
            {isReady
            ? "Healthy"
            : status === "error"
                ? "Error"
                : "Working"}
          </ui_1.StatusBadge>
        </div>

        <p className={status === "error"
            ? "dataset-health-message error"
            : "dataset-health-message"}>
          {message}
        </p>
      </ui_1.Card>

      <div className="dataset-health-metrics">
        <ui_1.Card className="dataset-health-metric">
          <span>Historic snapshot rows</span>
          <strong>
            {diagnostics.initialized
            ? formatNumber(diagnostics.snapshotRowCount)
            : "—"}
          </strong>
          <small>
            Snapshot version:{" "}
            {diagnostics.snapshotVersion || "Not loaded"}
          </small>
        </ui_1.Card>

        <ui_1.Card className="dataset-health-metric">
          <span>Published delta rows</span>
          <strong>
            {diagnostics.initialized
            ? formatNumber(diagnostics.deltaRowCount)
            : "—"}
          </strong>
          <small>
            From{" "}
            {diagnostics.initialized
            ? formatNumber(diagnostics.activeDeltaCount)
            : "—"}{" "}
            active delta
            {diagnostics.activeDeltaCount === 1 ? "" : "s"}
          </small>
        </ui_1.Card>

        <ui_1.Card className="dataset-health-metric featured">
          <span>Total current rows</span>
          <strong>
            {diagnostics.initialized
            ? formatNumber(diagnostics.totalRowCount)
            : "—"}
          </strong>
          <small>Calculated without loading every Parquet row</small>
        </ui_1.Card>

        <ui_1.Card className="dataset-health-metric">
          <span>Collections indexed</span>
          <strong>
            {diagnostics.initialized
            ? formatNumber(diagnostics.collectionCount)
            : "—"}
          </strong>
          <small>Available for lazy collection loading</small>
        </ui_1.Card>

        <ui_1.Card className="dataset-health-metric">
          <span>Sites indexed</span>
          <strong>
            {diagnostics.initialized
            ? formatNumber(diagnostics.siteCount)
            : "—"}
          </strong>
          <small>Derived from the collection index</small>
        </ui_1.Card>

        <ui_1.Card className="dataset-health-metric">
          <span>Waterbodies indexed</span>
          <strong>
            {diagnostics.initialized
            ? formatNumber(diagnostics.waterbodyCount)
            : "—"}
          </strong>
          <small>Derived from the collection index</small>
        </ui_1.Card>

        <ui_1.Card className="dataset-health-metric">
          <span>Species indexed</span>
          <strong>
            {diagnostics.speciesCount === null
            ? "Deferred"
            : formatNumber(diagnostics.speciesCount)}
          </strong>
          <small>Built later from a dedicated compact species index</small>
        </ui_1.Card>

        <ui_1.Card className="dataset-health-metric">
          <span>Catalog load time</span>
          <strong className="dataset-health-duration">
            {formatDuration(diagnostics.loadDurationMs)}
          </strong>
          <small>No full-dataset browser allocation</small>
        </ui_1.Card>
      </div>

      {diagnostics.initialized && (<ui_1.Card className="dataset-health-details">
          <h2>Runtime details</h2>

          <dl>
            <div>
              <dt>Runtime mode</dt>
              <dd>Lightweight catalog</dd>
            </div>

            <div>
              <dt>Runtime status</dt>
              <dd>{diagnostics.status}</dd>
            </div>

            <div>
              <dt>Snapshot version</dt>
              <dd>{diagnostics.snapshotVersion || "Not available"}</dd>
            </div>

            <div>
              <dt>Dataset loaded</dt>
              <dd>{formatDate(diagnostics.loadedAt)}</dd>
            </div>

            <div>
              <dt>Catalog built</dt>
              <dd>{formatDate(diagnostics.indexBuiltAt)}</dd>
            </div>

            <div>
              <dt>Load duration</dt>
              <dd>{formatDuration(diagnostics.loadDurationMs)}</dd>
            </div>
          </dl>
        </ui_1.Card>)}
    </div>);
}
//# sourceMappingURL=DatasetHealthPage.js.map