import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  LoaderCircle,
  Table2,
  X,
} from "lucide-react";
import {
  loadAppliedQueryData,
  type AppliedQueryData,
} from "../services/queryDataSessionService";
import {
  getCachedVadmaCollectionIndex as getCachedNaiaddCollectionIndex,
  readCachedVadmaSnapshotCollectionRows as readCachedNaiaddSnapshotCollectionRows,
  readCachedVadmaSnapshotColumnNames as readCachedNaiaddSnapshotColumnNames,
  type CollectionIndexRecord,
} from "../services/snapshotService";
import "../styles/RawDataPage.css";

type DataRow = Record<string, unknown>;

const ROWS_PER_PAGE = 100;

type ExportScope = "selected" | "all";
type ExportLayout = "single" | "multiple";

function escapeCsvValue(value: unknown): string {
  const text = formatCellValue(value);
  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

function sanitizeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100) || "collection";
}

function downloadCsv(filename: string, chunks: BlobPart[]): void {
  const blob = new Blob(["\ufeff", ...chunks], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function rowsToCsvChunks(rows: DataRow[], columns: string[]): string[] {
  return rows.map((row) =>
    `${columns.map((column) => escapeCsvValue(row[column])).join(",")}\r\n`,
  );
}

function formatCellValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function describeAppliedQuery(applied: AppliedQueryData): string {
  const parts: string[] = [];
  const { session } = applied;

  if (session.startDate || session.endDate) {
    parts.push(
      `${session.startDate || "Any date"} to ${session.endDate || "Any date"}`,
    );
  }

  if (session.selectedWaterbodies.length > 0) {
    parts.push(
      `${session.selectedWaterbodies.length.toLocaleString()} waterbod${
        session.selectedWaterbodies.length === 1 ? "y" : "ies"
      }`,
    );
  }

  if (session.selectedSiteNames.length > 0) {
    parts.push(
      `${session.selectedSiteNames.length.toLocaleString()} site${
        session.selectedSiteNames.length === 1 ? "" : "s"
      }`,
    );
  }

  return parts.length > 0 ? parts.join(" • ") : "No filters applied";
}

function getIndexLabel(record: CollectionIndexRecord): string {
  const waterbody = String(record.Waterbody ?? "").trim();
  const date = String(record.Survey_Date ?? "").trim();
  const details = [waterbody, date].filter(Boolean).join(" • ");

  return details
    ? `${record.CollectionID} — ${details}`
    : record.CollectionID;
}

export default function RawDataPage() {
  const [appliedQuery] = useState<AppliedQueryData | null>(() =>
    loadAppliedQueryData(),
  );
  const [matchingCollections, setMatchingCollections] = useState<
    CollectionIndexRecord[]
  >([]);
  const [selectedCollectionIndex, setSelectedCollectionIndex] = useState(0);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [snapshotColumns, setSnapshotColumns] = useState<string[]>([]);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>("selected");
  const [exportLayout, setExportLayout] = useState<ExportLayout>("single");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [exportError, setExportError] = useState("");
  const cancelExportRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadIndex() {
      if (!appliedQuery) {
        setLoadingIndex(false);
        return;
      }

      try {
        setLoadingIndex(true);
        setError("");

        const [cachedIndex, cachedColumns] = await Promise.all([
          getCachedNaiaddCollectionIndex(),
          readCachedNaiaddSnapshotColumnNames(),
        ]);

        if (!cachedIndex) {
          throw new Error(
            "The cached collection index is unavailable. Refresh the NAIADD production snapshot from the dashboard, then return here.",
          );
        }

        const matchingIDs = new Set(appliedQuery.collectionIDs);
        const matches = cachedIndex.filter((record) =>
          matchingIDs.has(record.CollectionID),
        );

        if (!cancelled) {
          setMatchingCollections(matches);
          setSnapshotColumns(cachedColumns);
          setSelectedCollectionIndex(0);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load the collection index.",
          );
        }
      } finally {
        if (!cancelled) setLoadingIndex(false);
      }
    }

    void loadIndex();

    return () => {
      cancelled = true;
    };
  }, [appliedQuery]);

  const selectedCollection =
    matchingCollections[selectedCollectionIndex] ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadCollectionRows() {
      if (!selectedCollection) {
        setRows([]);
        return;
      }

      try {
        setLoadingRows(true);
        setError("");
        setPage(1);

        const collectionRows = await readCachedNaiaddSnapshotCollectionRows(
          selectedCollection.CollectionID,
        );

        if (!cancelled) {
          setRows(collectionRows);
        }
      } catch (loadError) {
        if (!cancelled) {
          setRows([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load this collection.",
          );
        }
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    }

    void loadCollectionRows();

    return () => {
      cancelled = true;
    };
  }, [selectedCollection]);

  const columns = useMemo(() => {
    const names = [...snapshotColumns];
    const found = new Set(names);

    for (const row of rows) {
      for (const column of Object.keys(row)) {
        if (!found.has(column)) {
          found.add(column);
          names.push(column);
        }
      }
    }

    return names;
  }, [rows, snapshotColumns]);

  const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice(
    (safePage - 1) * ROWS_PER_PAGE,
    safePage * ROWS_PER_PAGE,
  );

  function moveCollection(direction: -1 | 1) {
    setSelectedCollectionIndex((current) =>
      Math.min(
        matchingCollections.length - 1,
        Math.max(0, current + direction),
      ),
    );
  }

  function closeExportDialog() {
    if (exporting) {
      cancelExportRef.current = true;
      return;
    }

    setExportOpen(false);
    setExportError("");
    setExportProgress("");
  }

  async function exportCollections() {
    const targets =
      exportScope === "selected"
        ? selectedCollection
          ? [selectedCollection]
          : []
        : matchingCollections;

    if (targets.length === 0) {
      setExportError("There are no collections available to export.");
      return;
    }

    setExporting(true);
    setExportError("");
    cancelExportRef.current = false;

    try {
      const exportColumns =
        snapshotColumns.length > 0
          ? snapshotColumns
          : await readCachedNaiaddSnapshotColumnNames();

      const resolvedExportColumns =
        exportColumns.length > 0 ? exportColumns : columns;

      if (resolvedExportColumns.length === 0) {
        throw new Error("No snapshot columns were available for export.");
      }

      const header = `${resolvedExportColumns.map(escapeCsvValue).join(",")}\r\n`;
      const dateStamp = new Date().toISOString().slice(0, 10);

      if (exportLayout === "single") {
        const chunks: BlobPart[] = [header];

        for (let index = 0; index < targets.length; index += 1) {
          if (cancelExportRef.current) throw new Error("Export cancelled.");

          const target = targets[index];
          setExportProgress(
            `Reading collection ${(index + 1).toLocaleString()} of ${targets.length.toLocaleString()}…`,
          );

          const collectionRows =
            target.CollectionID === selectedCollection?.CollectionID && rows.length > 0
              ? rows
              : await readCachedNaiaddSnapshotCollectionRows(target.CollectionID);

          chunks.push(...rowsToCsvChunks(collectionRows, resolvedExportColumns));
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }

        downloadCsv(
          exportScope === "selected"
            ? `${sanitizeFilePart(targets[0].CollectionID)}_${dateStamp}.csv`
            : `NAIADD_Query_Export_${dateStamp}.csv`,
          chunks,
        );
      } else {
        for (let index = 0; index < targets.length; index += 1) {
          if (cancelExportRef.current) throw new Error("Export cancelled.");

          const target = targets[index];
          setExportProgress(
            `Downloading collection ${(index + 1).toLocaleString()} of ${targets.length.toLocaleString()}…`,
          );

          const collectionRows =
            target.CollectionID === selectedCollection?.CollectionID && rows.length > 0
              ? rows
              : await readCachedNaiaddSnapshotCollectionRows(target.CollectionID);

          downloadCsv(
            `${sanitizeFilePart(target.CollectionID)}_${dateStamp}.csv`,
            [header, ...rowsToCsvChunks(collectionRows, resolvedExportColumns)],
          );
          await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
        }
      }

      setExportProgress("Export complete.");
      window.setTimeout(() => {
        setExportOpen(false);
        setExportProgress("");
      }, 700);
    } catch (exportFailure) {
      const message =
        exportFailure instanceof Error
          ? exportFailure.message
          : "Unable to export the requested data.";

      if (message === "Export cancelled.") {
        setExportProgress("");
      } else {
        setExportError(message);
      }
    } finally {
      setExporting(false);
      cancelExportRef.current = false;
    }
  }

  return (
    <main className="raw-data-page">
      <header className="raw-data-header">
        <div>
          <span className="raw-data-eyebrow">Reports</span>
          <h1>Raw Data</h1>
          <p>
            Lightweight spreadsheet view of the most recently applied Query
            Data result.
          </p>
        </div>

        <div className="raw-data-header-actions">
          <button
            type="button"
            className="raw-data-export-button"
            onClick={() => setExportOpen(true)}
            disabled={matchingCollections.length === 0 || loadingIndex}
          >
            <Download size={18} aria-hidden="true" />
            Export
          </button>

          <div className="raw-data-summary-card">
          <Database size={22} aria-hidden="true" />
          <div>
            <span>Matching collections</span>
            <strong>
              {loadingIndex
                ? "—"
                : matchingCollections.length.toLocaleString()}
            </strong>
          </div>
          </div>
        </div>
      </header>

      {!appliedQuery ? (
        <section className="raw-data-empty-state">
          <Table2 size={34} aria-hidden="true" />
          <h2>No query has been applied</h2>
          <p>
            Open Query Data, build the filters, and select Apply Query to Map.
          </p>
        </section>
      ) : (
        <>
          <section className="raw-data-query-summary">
            <div>
              <span>Current applied query</span>
              <strong>{describeAppliedQuery(appliedQuery)}</strong>
            </div>
            <small>
              Applied {appliedQuery.appliedAt
                ? new Date(appliedQuery.appliedAt).toLocaleString()
                : "recently"}
            </small>
          </section>

          <section className="raw-data-table-card">
            {loadingIndex ? (
              <div className="raw-data-loading">
                <LoaderCircle className="raw-data-spinner" size={28} />
                <strong>Loading collection list…</strong>
              </div>
            ) : error && matchingCollections.length === 0 ? (
              <div className="raw-data-error">{error}</div>
            ) : matchingCollections.length === 0 ? (
              <div className="raw-data-empty-table">
                No collections matched the applied query.
              </div>
            ) : (
              <>
                <div className="raw-data-collection-toolbar">
                  <label>
                    <span>Collection</span>
                    <select
                      value={selectedCollectionIndex}
                      onChange={(event) =>
                        setSelectedCollectionIndex(Number(event.target.value))
                      }
                    >
                      {matchingCollections.map((record, index) => (
                        <option key={record.CollectionID} value={index}>
                          {getIndexLabel(record)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="raw-data-collection-nav">
                    <button
                      type="button"
                      onClick={() => moveCollection(-1)}
                      disabled={selectedCollectionIndex <= 0 || loadingRows}
                    >
                      <ChevronLeft size={17} />
                      Previous collection
                    </button>
                    <span>
                      {(selectedCollectionIndex + 1).toLocaleString()} of{" "}
                      {matchingCollections.length.toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => moveCollection(1)}
                      disabled={
                        selectedCollectionIndex >=
                          matchingCollections.length - 1 || loadingRows
                      }
                    >
                      Next collection
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </div>

                <div className="raw-data-active-collection">
                  <div>
                    <span>CollectionID</span>
                    <strong>{selectedCollection?.CollectionID}</strong>
                  </div>
                  <div>
                    <span>Indexed rows</span>
                    <strong>
                      {(selectedCollection?.rowCount ?? 0).toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    <span>Loaded rows</span>
                    <strong>
                      {loadingRows ? "—" : rows.length.toLocaleString()}
                    </strong>
                  </div>
                </div>

                {loadingRows ? (
                  <div className="raw-data-loading">
                    <LoaderCircle className="raw-data-spinner" size={28} />
                    <strong>Loading selected collection…</strong>
                  </div>
                ) : error ? (
                  <div className="raw-data-error">{error}</div>
                ) : rows.length === 0 ? (
                  <div className="raw-data-empty-table">
                    This collection has no snapshot rows.
                  </div>
                ) : (
                  <>
                    <div className="raw-data-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th className="raw-data-row-number">#</th>
                            {columns.map((column) => (
                              <th key={column}>{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.map((row, rowIndex) => {
                            const absoluteRow =
                              (safePage - 1) * ROWS_PER_PAGE + rowIndex + 1;

                            return (
                              <tr key={absoluteRow}>
                                <td className="raw-data-row-number">
                                  {absoluteRow.toLocaleString()}
                                </td>
                                {columns.map((column) => (
                                  <td
                                    key={column}
                                    title={formatCellValue(row[column])}
                                  >
                                    {formatCellValue(row[column])}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <footer className="raw-data-pagination">
                      <span>
                        Rows {(
                          (safePage - 1) * ROWS_PER_PAGE +
                          1
                        ).toLocaleString()}–{Math.min(
                          safePage * ROWS_PER_PAGE,
                          rows.length,
                        ).toLocaleString()} of {rows.length.toLocaleString()}
                      </span>
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setPage((current) => Math.max(1, current - 1))
                          }
                          disabled={safePage <= 1}
                        >
                          <ChevronLeft size={17} />
                          Previous rows
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPage((current) =>
                              Math.min(pageCount, current + 1),
                            )
                          }
                          disabled={safePage >= pageCount}
                        >
                          Next rows
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    </footer>
                  </>
                )}
              </>
            )}
          </section>
        </>
      )}

      {exportOpen ? (
        <div className="raw-data-export-backdrop" role="presentation">
          <section
            className="raw-data-export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="raw-data-export-title"
          >
            <header>
              <div>
                <span className="raw-data-eyebrow">CSV export</span>
                <h2 id="raw-data-export-title">Export Raw Data</h2>
              </div>
              <button
                type="button"
                className="raw-data-export-close"
                onClick={closeExportDialog}
                aria-label={exporting ? "Cancel export" : "Close export dialog"}
              >
                <X size={20} />
              </button>
            </header>

            <fieldset disabled={exporting}>
              <legend>What should be exported?</legend>
              <label className="raw-data-export-option">
                <input
                  type="radio"
                  name="export-scope"
                  value="selected"
                  checked={exportScope === "selected"}
                  onChange={() => setExportScope("selected")}
                />
                <span>
                  <strong>Selected collection</strong>
                  <small>{selectedCollection?.CollectionID ?? "No collection selected"}</small>
                </span>
              </label>
              <label className="raw-data-export-option">
                <input
                  type="radio"
                  name="export-scope"
                  value="all"
                  checked={exportScope === "all"}
                  onChange={() => setExportScope("all")}
                />
                <span>
                  <strong>All collections in the query</strong>
                  <small>{matchingCollections.length.toLocaleString()} matching collections</small>
                </span>
              </label>
            </fieldset>

            <fieldset disabled={exporting}>
              <legend>How should the files be created?</legend>
              <label className="raw-data-export-option">
                <input
                  type="radio"
                  name="export-layout"
                  value="single"
                  checked={exportLayout === "single"}
                  onChange={() => setExportLayout("single")}
                />
                <span>
                  <strong>One file</strong>
                  <small>Combine the requested collections into one CSV.</small>
                </span>
              </label>
              <label className="raw-data-export-option">
                <input
                  type="radio"
                  name="export-layout"
                  value="multiple"
                  checked={exportLayout === "multiple"}
                  onChange={() => setExportLayout("multiple")}
                />
                <span>
                  <strong>Multiple files</strong>
                  <small>Create one CSV for each requested collection.</small>
                </span>
              </label>
            </fieldset>

            {exportLayout === "multiple" && exportScope === "all" ? (
              <p className="raw-data-export-note">
                Your browser may ask permission to download multiple files.
              </p>
            ) : null}

            {exportProgress ? (
              <div className="raw-data-export-status">
                {exporting ? <LoaderCircle className="raw-data-spinner" size={18} /> : null}
                <span>{exportProgress}</span>
              </div>
            ) : null}
            {exportError ? <div className="raw-data-export-error">{exportError}</div> : null}

            <footer>
              <button
                type="button"
                className="raw-data-export-secondary"
                onClick={closeExportDialog}
              >
                {exporting ? "Cancel" : "Close"}
              </button>
              <button
                type="button"
                className="raw-data-export-primary"
                onClick={() => void exportCollections()}
                disabled={exporting}
              >
                {exporting ? (
                  <>
                    <LoaderCircle className="raw-data-spinner" size={17} />
                    Exporting…
                  </>
                ) : (
                  <>
                    <Download size={17} />
                    Export CSV
                  </>
                )}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
