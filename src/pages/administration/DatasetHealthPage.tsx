import { Card, PageHeader, StatusBadge } from "../../components/ui";
import { useDatasetManager } from "../../hooks/useDatasetManager";
import "./DatasetHealthPage.css";

type DatasetHealthPageProps = {
  onBack: () => void;
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatDate(value: string): string {
  if (!value) return "Not available";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "Not available";
  }

  return milliseconds < 1000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1000).toFixed(2)} seconds`;
}

export default function DatasetHealthPage({
  onBack,
}: DatasetHealthPageProps) {
  const {
    status,
    diagnostics,
    isReady,
    isLoading,
    isRefreshing,
    error,
    refresh,
  } = useDatasetManager();

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
    } catch {
      // The manager emits the error state consumed by the hook.
    }
  }

  return (
    <div className="dataset-health-page">
      <div className="dataset-health-actions">
        <button
          type="button"
          className="dataset-health-back"
          onClick={onBack}
        >
          ← Back to Administration
        </button>

        <button
          type="button"
          className="dataset-health-refresh"
          disabled={isWorking}
          onClick={() => void handleRefresh()}
        >
          {isRefreshing ? "Refreshing..." : "Refresh catalog"}
        </button>
      </div>

      <PageHeader
        eyebrow="VADMA Data Infrastructure"
        title="Dataset Health Check"
        description="Verify the historic snapshot, published deltas, and lightweight runtime catalog without loading 1.35 million complete rows into browser memory."
      />

      <Card className="dataset-health-status-card">
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

          <StatusBadge
            tone={
              isReady
                ? "success"
                : status === "error"
                  ? "danger"
                  : "neutral"
            }
          >
            {isReady
              ? "Healthy"
              : status === "error"
                ? "Error"
                : "Working"}
          </StatusBadge>
        </div>

        <p
          className={
            status === "error"
              ? "dataset-health-message error"
              : "dataset-health-message"
          }
        >
          {message}
        </p>
      </Card>

      <div className="dataset-health-metrics">
        <Card className="dataset-health-metric">
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
        </Card>

        <Card className="dataset-health-metric">
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
        </Card>

        <Card className="dataset-health-metric featured">
          <span>Total current rows</span>
          <strong>
            {diagnostics.initialized
              ? formatNumber(diagnostics.totalRowCount)
              : "—"}
          </strong>
          <small>Calculated without loading every Parquet row</small>
        </Card>

        <Card className="dataset-health-metric">
          <span>Collections indexed</span>
          <strong>
            {diagnostics.initialized
              ? formatNumber(diagnostics.collectionCount)
              : "—"}
          </strong>
          <small>Available for lazy collection loading</small>
        </Card>

        <Card className="dataset-health-metric">
          <span>Sites indexed</span>
          <strong>
            {diagnostics.initialized
              ? formatNumber(diagnostics.siteCount)
              : "—"}
          </strong>
          <small>Derived from the collection index</small>
        </Card>

        <Card className="dataset-health-metric">
          <span>Waterbodies indexed</span>
          <strong>
            {diagnostics.initialized
              ? formatNumber(diagnostics.waterbodyCount)
              : "—"}
          </strong>
          <small>Derived from the collection index</small>
        </Card>

        <Card className="dataset-health-metric">
          <span>Species indexed</span>
          <strong>
            {diagnostics.speciesCount === null
              ? "Deferred"
              : formatNumber(diagnostics.speciesCount)}
          </strong>
          <small>Built later from a dedicated compact species index</small>
        </Card>

        <Card className="dataset-health-metric">
          <span>Catalog load time</span>
          <strong className="dataset-health-duration">
            {formatDuration(diagnostics.loadDurationMs)}
          </strong>
          <small>No full-dataset browser allocation</small>
        </Card>
      </div>

      {diagnostics.initialized && (
        <Card className="dataset-health-details">
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
        </Card>
      )}
    </div>
  );
}
