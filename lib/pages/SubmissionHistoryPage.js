"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SubmissionHistoryPage;
const react_1 = require("react");
const submissionService_1 = require("../services/submissionService");
require("../styles/SubmissionHistoryPage.css");
function asRecord(value) {
    return value && typeof value === "object"
        ? value
        : {};
}
function firstValue(record, keys) {
    for (const key of keys) {
        const value = record[key];
        if (value !== undefined &&
            value !== null &&
            String(value).trim() !== "") {
            return value;
        }
    }
    return null;
}
function display(value, fallback = "—") {
    if (value === undefined ||
        value === null ||
        String(value).trim() === "") {
        return fallback;
    }
    if (Array.isArray(value)) {
        return value.map(String).filter(Boolean).join(", ") || fallback;
    }
    return String(value);
}
function numeric(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function formatDateTime(value) {
    if (!value)
        return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}
function formatDate(value) {
    const text = display(value, "");
    if (!text)
        return "—";
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
        return text;
    }
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(date);
}
function currentBusinessStatus(submission) {
    return (submission.processing?.businessStatus ??
        submission.metadata.status ??
        "Queued");
}
function currentProcessingState(submission) {
    return submission.processing?.processingState ?? "Pending";
}
function payloadForSubmission(submission) {
    return submission.payload ?? submission.data;
}
function submissionMetrics(submission) {
    const payload = payloadForSubmission(submission);
    const rows = Array.isArray(payload?.specimens)
        ? payload.specimens.map(asRecord)
        : [];
    const realRows = rows.filter((row) => {
        const commonName = display(firstValue(row, ["CommonName", "commonName"]), "");
        return commonName !== "" && commonName !== "NoFish";
    });
    const fishCount = realRows.reduce((sum, row) => sum +
        (numeric(firstValue(row, ["Quantity", "quantity"])) ?? 1), 0);
    const speciesCount = new Set(realRows
        .map((row) => display(firstValue(row, ["CommonName", "commonName"]), ""))
        .filter(Boolean)).size;
    return {
        fishCount,
        speciesCount,
    };
}
function searchableText(submission) {
    const payload = payloadForSubmission(submission);
    const location = asRecord(payload?.location);
    const survey = asRecord(payload?.survey);
    return [
        submission.metadata.submissionId,
        submission.metadata.collectionId,
        submission.metadata.submittedByDisplayName,
        submission.metadata.submittedByEmail,
        display(firstValue(location, ["Waterbody", "waterbody"]), ""),
        display(firstValue(location, ["SiteName", "siteName"]), ""),
        display(firstValue(survey, [
            "Survey_Date",
            "SurveyDate",
            "surveyDate",
            "Date",
        ]), ""),
        currentBusinessStatus(submission),
        currentProcessingState(submission),
    ]
        .join(" ")
        .toLowerCase();
}
function statusClass(status) {
    return status.toLowerCase();
}
function processingClass(state) {
    return state.toLowerCase();
}
function SubmissionHistoryPage({ profile, }) {
    const [submissions, setSubmissions] = (0, react_1.useState)([]);
    const [selected, setSelected] = (0, react_1.useState)(null);
    const [searchText, setSearchText] = (0, react_1.useState)("");
    const [statusFilter, setStatusFilter] = (0, react_1.useState)("All");
    const [processingFilter, setProcessingFilter] = (0, react_1.useState)("All");
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [refreshing, setRefreshing] = (0, react_1.useState)(false);
    const [message, setMessage] = (0, react_1.useState)("");
    async function loadSubmissions(showRefresh = false) {
        if (showRefresh) {
            setRefreshing(true);
        }
        else {
            setLoading(true);
        }
        setMessage("");
        try {
            const records = await (0, submissionService_1.listMySubmissions)(profile.uid, 250);
            setSubmissions(records);
            setSelected((current) => {
                if (!current)
                    return null;
                return (records.find((item) => item.metadata.submissionId ===
                    current.metadata.submissionId) ?? null);
            });
        }
        catch (error) {
            setMessage(error instanceof Error
                ? error.message
                : "Submission history could not be loaded.");
        }
        finally {
            setLoading(false);
            setRefreshing(false);
        }
    }
    (0, react_1.useEffect)(() => {
        void loadSubmissions();
    }, [profile.uid]);
    const filtered = (0, react_1.useMemo)(() => {
        const query = searchText.trim().toLowerCase();
        return submissions.filter((submission) => {
            const matchesSearch = !query || searchableText(submission).includes(query);
            const matchesStatus = statusFilter === "All" ||
                currentBusinessStatus(submission) === statusFilter;
            const matchesProcessing = processingFilter === "All" ||
                currentProcessingState(submission) === processingFilter;
            return matchesSearch && matchesStatus && matchesProcessing;
        });
    }, [
        processingFilter,
        searchText,
        statusFilter,
        submissions,
    ]);
    const summary = (0, react_1.useMemo)(() => {
        const queued = submissions.filter((item) => currentBusinessStatus(item) === "Queued").length;
        const merged = submissions.filter((item) => currentBusinessStatus(item) === "Merged").length;
        const rejected = submissions.filter((item) => currentBusinessStatus(item) === "Rejected").length;
        const warnings = submissions.reduce((sum, item) => sum +
            (item.processing?.validationIssues?.filter((issue) => issue.severity === "warning").length ?? 0), 0);
        return {
            total: submissions.length,
            queued,
            merged,
            rejected,
            warnings,
        };
    }, [submissions]);
    return (<main className="submission-history-page">
      <header className="submission-history-header">
        <div>
          <p className="submission-history-eyebrow">
            Submitted Surveys
          </p>
          <h1>Submission History</h1>
          <span>
            Review surveys you have submitted to the DBA queue.
          </span>
        </div>

        <button type="button" className="submission-history-refresh" disabled={refreshing} onClick={() => void loadSubmissions(true)}>
          {refreshing ? "Refreshing…" : "↻ Refresh"}
        </button>
      </header>

      <section className="submission-history-metrics">
        <MetricCard label="Total Submitted" value={summary.total}/>
        <MetricCard label="Queued" value={summary.queued}/>
        <MetricCard label="Merged" value={summary.merged}/>
        <MetricCard label="Rejected" value={summary.rejected}/>
      </section>

      <section className="submission-history-controls">
        <label className="submission-history-search">
          <span>Search</span>
          <input type="search" value={searchText} placeholder="Waterbody, site, Collection ID, Submission ID…" onChange={(event) => setSearchText(event.target.value)}/>
        </label>

        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="All">All statuses</option>
            <option value="Queued">Queued</option>
            <option value="Archived">Archived</option>
            <option value="Merged">Merged</option>
            <option value="Rejected">Rejected</option>
            <option value="Draft">Draft</option>
          </select>
        </label>

        <label>
          <span>Processing</span>
          <select value={processingFilter} onChange={(event) => setProcessingFilter(event.target.value)}>
            <option value="All">All processing states</option>
            <option value="Pending">Pending</option>
            <option value="Running">Running</option>
            <option value="Completed">Completed</option>
            <option value="Failed">Failed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </label>
      </section>

      {message && (<div className="submission-history-message">
          <strong>Submission history unavailable</strong>
          <span>{message}</span>
        </div>)}

      {loading ? (<section className="submission-history-empty">
          <span className="submission-history-empty-icon">↻</span>
          <h2>Loading submission history</h2>
          <p>VADMA is retrieving your Firestore queue records.</p>
        </section>) : filtered.length === 0 ? (<section className="submission-history-empty">
          <span className="submission-history-empty-icon">▥</span>
          <h2>
            {submissions.length === 0
                ? "No submitted surveys yet"
                : "No matching submissions"}
          </h2>
          <p>
            {submissions.length === 0
                ? "Completed surveys will appear here after they are submitted to the DBA queue."
                : "Adjust the search or filters to display other submissions."}
          </p>
        </section>) : (<section className="submission-history-list">
          {filtered.map((submission) => (<SubmissionCard key={submission.metadata.submissionId} submission={submission} onView={() => setSelected(submission)}/>))}
        </section>)}

      {selected && (<SubmissionDetailModal submission={selected} onClose={() => setSelected(null)}/>)}
    </main>);
}
function MetricCard({ label, value, }) {
    return (<article className="submission-history-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>);
}
function SubmissionCard({ submission, onView, }) {
    const payload = payloadForSubmission(submission);
    const location = asRecord(payload?.location);
    const survey = asRecord(payload?.survey);
    const status = currentBusinessStatus(submission);
    const processingState = currentProcessingState(submission);
    const metrics = submissionMetrics(submission);
    const waterbody = display(firstValue(location, ["Waterbody", "waterbody"]));
    const siteName = display(firstValue(location, ["SiteName", "siteName"]));
    const surveyDate = firstValue(survey, [
        "Survey_Date",
        "SurveyDate",
        "surveyDate",
        "Date",
    ]);
    const warningCount = submission.processing?.validationIssues?.filter((issue) => issue.severity === "warning").length ?? 0;
    return (<article className="submission-history-card">
      <div className="submission-history-card-top">
        <div>
          <p className="submission-history-card-eyebrow">
            {formatDate(surveyDate)}
          </p>
          <h2>{waterbody}</h2>
          <span>{siteName}</span>
        </div>

        <div className="submission-history-card-statuses">
          <span className={`submission-status ${statusClass(status)}`}>
            {status}
          </span>
          <span className={`submission-processing ${processingClass(processingState)}`}>
            {processingState}
          </span>
        </div>
      </div>

      <div className="submission-history-card-grid">
        <CardValue label="Collection ID" value={submission.metadata.collectionId} mono/>
        <CardValue label="Submission ID" value={submission.metadata.submissionId} mono/>
        <CardValue label="Submitted" value={formatDateTime(submission.processing?.queuedAt ??
            submission.metadata.queuedAt ??
            submission.metadata.createdAt)}/>
        <CardValue label="Fish" value={String(metrics.fishCount)}/>
        <CardValue label="Species" value={String(metrics.speciesCount)}/>
        <CardValue label="Warnings" value={String(warningCount)}/>
      </div>

      <div className="submission-history-card-footer">
        <span>
          Submitted by{" "}
          {submission.metadata.submittedByDisplayName ||
            submission.metadata.submittedByEmail ||
            "Unknown user"}
        </span>

        <button type="button" onClick={onView}>
          View Submission
        </button>
      </div>
    </article>);
}
function CardValue({ label, value, mono = false, }) {
    return (<div className="submission-history-card-value">
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>{value}</strong>
    </div>);
}
function SubmissionDetailModal({ submission, onClose, }) {
    const payload = payloadForSubmission(submission);
    const location = asRecord(payload?.location);
    const survey = asRecord(payload?.survey);
    const rows = Array.isArray(payload?.specimens)
        ? payload.specimens.map(asRecord)
        : [];
    const status = currentBusinessStatus(submission);
    const processingState = currentProcessingState(submission);
    const metrics = submissionMetrics(submission);
    const waterbody = display(firstValue(location, ["Waterbody", "waterbody"]));
    const siteName = display(firstValue(location, ["SiteName", "siteName"]));
    const surveyDate = formatDate(firstValue(survey, [
        "Survey_Date",
        "SurveyDate",
        "surveyDate",
        "Date",
    ]));
    return (<div className="submission-history-modal-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
                onClose();
            }
        }}>
      <section className="submission-history-modal" role="dialog" aria-modal="true" aria-label="Submission details">
        <header className="submission-history-modal-header">
          <div>
            <p className="submission-history-eyebrow">
              Read-only Submission
            </p>
            <h2>{waterbody}</h2>
            <span>
              {siteName} · {surveyDate}
            </span>
          </div>

          <button type="button" aria-label="Close submission details" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="submission-history-modal-status">
          <span className={`submission-status ${statusClass(status)}`}>
            {status}
          </span>
          <span className={`submission-processing ${processingClass(processingState)}`}>
            {processingState}
          </span>
        </div>

        <div className="submission-history-detail-grid">
          <DetailValue label="Submission ID" value={submission.metadata.submissionId} mono/>
          <DetailValue label="Collection ID" value={submission.metadata.collectionId} mono/>
          <DetailValue label="Fish" value={String(metrics.fishCount)}/>
          <DetailValue label="Species" value={String(metrics.speciesCount)}/>
          <DetailValue label="Submitted" value={formatDateTime(submission.processing?.queuedAt ??
            submission.metadata.queuedAt ??
            submission.metadata.createdAt)}/>
          <DetailValue label="Specimen Method" value={submission.metadata.specimenFormType ??
            "Not recorded"}/>
        </div>

        <DetailSection title="Location" record={location}/>

        <DetailSection title="Survey Information" record={survey}/>

        <section className="submission-history-detail-section">
          <div className="submission-history-detail-heading">
            <div>
              <p className="submission-history-eyebrow">
                Biological Payload
              </p>
              <h3>Specimens</h3>
            </div>
            <span>{rows.length} rows</span>
          </div>

          {rows.length === 0 ? (<p className="submission-history-no-data">
              No specimen rows were stored with this submission.
            </p>) : (<div className="submission-history-specimen-list">
              {rows.map((row, index) => (<div className="submission-history-specimen-row" key={`${submission.metadata.submissionId}-${index}`}>
                  <strong>
                    {display(firstValue(row, [
                    "CommonName",
                    "commonName",
                ]), `Specimen ${index + 1}`)}
                  </strong>
                  <span>
                    Quantity:{" "}
                    {display(firstValue(row, [
                    "Quantity",
                    "quantity",
                ]), "1")}
                  </span>
                  <span>
                    Length:{" "}
                    {display(firstValue(row, [
                    "Length",
                    "length",
                    "TotalLength",
                    "ForkLength",
                ]))}
                  </span>
                  <span>
                    Weight:{" "}
                    {display(firstValue(row, [
                    "Weight",
                    "weight",
                ]))}
                  </span>
                </div>))}
            </div>)}
        </section>

        <section className="submission-history-detail-section">
          <div className="submission-history-detail-heading">
            <div>
              <p className="submission-history-eyebrow">
                Processing Record
              </p>
              <h3>Audit History</h3>
            </div>
          </div>

          {!submission.history ||
            submission.history.length === 0 ? (<p className="submission-history-no-data">
              No audit events are available for this record.
            </p>) : (<div className="submission-history-timeline">
              {[...submission.history]
                .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
                .map((event) => (<div key={event.id}>
                    <span>•</span>
                    <div>
                      <strong>{event.type}</strong>
                      <p>{event.message}</p>
                      <small>
                        {formatDateTime(event.occurredAt)}
                        {event.actorDisplayName
                    ? ` · ${event.actorDisplayName}`
                    : ""}
                      </small>
                    </div>
                  </div>))}
            </div>)}
        </section>

        {(submission.processing?.validationIssues?.length ?? 0) >
            0 && (<section className="submission-history-detail-section">
            <div className="submission-history-detail-heading">
              <div>
                <p className="submission-history-eyebrow">
                  Validation
                </p>
                <h3>Warnings and Errors</h3>
              </div>
            </div>

            <div className="submission-history-issues">
              {submission.processing?.validationIssues.map((issue) => (<div key={`${issue.code}-${issue.field ?? ""}`} className={issue.severity}>
                    <strong>
                      {issue.severity === "error"
                    ? "Error"
                    : "Warning"}
                    </strong>
                    <span>{issue.message}</span>
                  </div>))}
            </div>
          </section>)}
      </section>
    </div>);
}
function DetailValue({ label, value, mono = false, }) {
    return (<div>
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>{value}</strong>
    </div>);
}
function DetailSection({ title, record, }) {
    const entries = Object.entries(record).filter(([, value]) => value !== undefined &&
        value !== null &&
        String(value).trim() !== "");
    return (<section className="submission-history-detail-section">
      <div className="submission-history-detail-heading">
        <div>
          <p className="submission-history-eyebrow">
            Submitted Data
          </p>
          <h3>{title}</h3>
        </div>
      </div>

      {entries.length === 0 ? (<p className="submission-history-no-data">
          No {title.toLowerCase()} data is available.
        </p>) : (<div className="submission-history-record-grid">
          {entries.map(([key, value]) => (<div key={key}>
              <span>{key.replace(/_/g, " ")}</span>
              <strong>{display(value)}</strong>
            </div>))}
        </div>)}
    </section>);
}
//# sourceMappingURL=SubmissionHistoryPage.js.map