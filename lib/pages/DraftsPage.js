"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DraftsPage;
const react_1 = require("react");
const surveySessionService_1 = require("../services/surveySessionService");
const submissionService_1 = require("../services/submissionService");
require("../styles/DraftsPage.css");
const APP_ROUTE_EVENT = "vadma-app-route";
const FILTERS = [
    { id: "all", label: "All" },
    { id: "in-progress", label: "In Progress" },
    { id: "ready", label: "Ready" },
    { id: "submitted", label: "Submitted" },
    { id: "queued", label: "Queued" },
    { id: "merged", label: "Merged" },
];
const STEP_LABELS = {
    location: "Location",
    survey: "Survey Information",
    specimens: "Specimens",
    review: "Review",
    submit: "Submit",
};
function asRecord(value) {
    return value && typeof value === "object"
        ? value
        : {};
}
function cleanText(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value).trim();
}
function firstText(value, keys, fallback = "") {
    const record = asRecord(value);
    for (const key of keys) {
        const candidate = cleanText(record[key]);
        if (candidate) {
            return candidate;
        }
    }
    return fallback;
}
function sessionSurveyors(session) {
    const survey = asRecord(session.survey);
    for (const key of [
        "Surveyors",
        "surveyors",
        "LeadBiologist",
        "leadBiologist",
        "Crew",
        "crew",
    ]) {
        const value = survey[key];
        if (Array.isArray(value)) {
            const joined = value
                .map(cleanText)
                .filter(Boolean)
                .join(", ");
            if (joined) {
                return joined;
            }
        }
        const text = cleanText(value);
        if (text) {
            return text;
        }
    }
    return "Surveyors not entered";
}
function formatDate(value, includeTime = false) {
    if (!value) {
        return "Not entered";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        ...(includeTime
            ? {
                hour: "numeric",
                minute: "2-digit",
            }
            : {}),
    }).format(date);
}
function processingStatus(submission) {
    const processing = asRecord(submission.processing);
    const metadata = asRecord(submission.metadata);
    return (cleanText(processing.businessStatus) ||
        cleanText(metadata.status) ||
        "Queued");
}
function submissionForSession(session, submissions) {
    return (submissions.find((submission) => {
        const metadata = asRecord(submission.metadata);
        return (cleanText(metadata.collectionId) ===
            session.collectionId ||
            cleanText(metadata.sessionId) === session.id);
    }) ?? null);
}
function draftStatus(session, submission) {
    if (submission) {
        const status = processingStatus(submission).toLowerCase();
        if (status === "merged" || status === "archived") {
            return "Merged";
        }
        if (status === "queued") {
            return "Queued";
        }
        return "Submitted";
    }
    const errors = (0, submissionService_1.validateSubmissionSession)(session).filter((issue) => issue.severity === "error");
    return errors.length === 0
        ? "Ready to Submit"
        : "In Progress";
}
function statusTone(status) {
    switch (status) {
        case "Ready to Submit":
            return "ready";
        case "Submitted":
            return "submitted";
        case "Queued":
            return "queued";
        case "Merged":
            return "merged";
        default:
            return "in-progress";
    }
}
function matchesFilter(status, filter) {
    if (filter === "all") {
        return true;
    }
    if (filter === "in-progress") {
        return status === "In Progress";
    }
    if (filter === "ready") {
        return status === "Ready to Submit";
    }
    if (filter === "submitted") {
        return status === "Submitted";
    }
    if (filter === "queued") {
        return status === "Queued";
    }
    return status === "Merged";
}
function routeToDataEntry() {
    window.dispatchEvent(new CustomEvent(APP_ROUTE_EVENT, {
        detail: { routeId: "data-entry" },
    }));
}
function DraftMetric({ label, value, detail, }) {
    return (<article className="drafts-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>);
}
function DraftCard({ draft, busy, onContinue, onDuplicate, onDelete, }) {
    const submissionId = draft.submission
        ? firstText(draft.submission.metadata, ["submissionId"])
        : "";
    return (<article className="draft-card">
      <div className="draft-card-topline">
        <div className="draft-card-title">
          <span className="draft-card-icon" aria-hidden="true">
            ≋
          </span>

          <div>
            <h2>{draft.metadata.siteName}</h2>
            <p>{draft.metadata.waterbody}</p>
          </div>
        </div>

        <span className={`draft-status-badge ${statusTone(draft.status)}`}>
          {draft.status}
        </span>
      </div>

      <div className="draft-card-identifiers">
        <div>
          <span>Collection ID</span>
          <strong>{draft.metadata.collectionId}</strong>
        </div>

        {submissionId && (<div>
            <span>Submission ID</span>
            <strong>{submissionId}</strong>
          </div>)}
      </div>

      <div className="draft-card-details">
        <div>
          <span className="draft-detail-icon" aria-hidden="true">
            ◷
          </span>

          <div>
            <small>Survey date</small>
            <strong>
              {formatDate(draft.metadata.surveyDate)}
            </strong>
          </div>
        </div>

        <div>
          <span className="draft-detail-icon" aria-hidden="true">
            ♙
          </span>

          <div>
            <small>Surveyors</small>
            <strong>{draft.surveyors}</strong>
          </div>
        </div>

        <div>
          <span className="draft-detail-icon" aria-hidden="true">
            ◉
          </span>

          <div>
            <small>Last edited</small>
            <strong>
              {formatDate(draft.metadata.updatedAt, true)}
            </strong>
          </div>
        </div>
      </div>

      <div className="draft-progress">
        <div className="draft-progress-heading">
          <div>
            <span>Survey progress</span>
            <strong>{draft.currentStepLabel}</strong>
          </div>

          <b>{draft.metadata.progressPercent}%</b>
        </div>

        <div className="draft-progress-track" role="progressbar" aria-label={`Survey progress ${draft.metadata.progressPercent}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={draft.metadata.progressPercent}>
          <span style={{
            width: `${draft.metadata.progressPercent}%`,
        }}/>
        </div>

        <small>
          {draft.metadata.completedSteps} of{" "}
          {draft.metadata.totalSteps} workflow sections complete
        </small>
      </div>

      <div className="draft-card-counts">
        <div>
          <strong>{draft.metadata.fishCount}</strong>
          <span>Fish</span>
        </div>

        <div>
          <strong>{draft.metadata.speciesCount}</strong>
          <span>Species</span>
        </div>
      </div>

      <div className="draft-card-actions">
        <button type="button" className="draft-primary-action" disabled={busy || Boolean(draft.submission)} onClick={onContinue}>
          {draft.submission
            ? "Submitted"
            : "Continue Editing"}
        </button>

        <button type="button" className="draft-secondary-action" disabled={busy} onClick={onDuplicate}>
          Duplicate
        </button>

        <button type="button" className="draft-delete-action" disabled={busy} onClick={onDelete}>
          Delete
        </button>
      </div>
    </article>);
}
function DraftsPage({ profile, }) {
    const [sessions, setSessions] = (0, react_1.useState)([]);
    const [submissions, setSubmissions] = (0, react_1.useState)([]);
    const [filter, setFilter] = (0, react_1.useState)("all");
    const [search, setSearch] = (0, react_1.useState)("");
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [busyId, setBusyId] = (0, react_1.useState)("");
    const [message, setMessage] = (0, react_1.useState)("");
    const [error, setError] = (0, react_1.useState)("");
    async function refresh(options) {
        if (!options?.preserveMessages) {
            setMessage("");
            setError("");
        }
        setSessions((0, surveySessionService_1.listSurveyDraftRecords)(profile.uid));
        try {
            if (typeof navigator === "undefined" ||
                navigator.onLine) {
                const nextSubmissions = await (0, submissionService_1.listMySubmissions)(profile.uid);
                setSubmissions(nextSubmissions);
            }
        }
        catch {
            setError("Saved drafts are available, but submitted survey statuses could not be refreshed.");
        }
        finally {
            setLoading(false);
        }
    }
    (0, react_1.useEffect)(() => {
        void refresh();
        const handleSessionChange = () => {
            setSessions((0, surveySessionService_1.listSurveyDraftRecords)(profile.uid));
        };
        window.addEventListener(surveySessionService_1.WORKFLOW_SESSION_EVENT, handleSessionChange);
        return () => {
            window.removeEventListener(surveySessionService_1.WORKFLOW_SESSION_EVENT, handleSessionChange);
        };
    }, [profile.uid]);
    const drafts = (0, react_1.useMemo)(() => {
        return sessions
            .map(({ session, metadata }) => {
            const submission = submissionForSession(session, submissions);
            return {
                session,
                metadata,
                submission,
                status: draftStatus(session, submission),
                surveyors: sessionSurveyors(session),
                currentStepLabel: STEP_LABELS[metadata.currentStep],
            };
        })
            .sort((left, right) => right.metadata.updatedAt.localeCompare(left.metadata.updatedAt));
    }, [sessions, submissions]);
    const counts = (0, react_1.useMemo)(() => {
        return drafts.reduce((result, draft) => {
            if (draft.status === "In Progress") {
                result.inProgress += 1;
            }
            if (draft.status === "Ready to Submit") {
                result.ready += 1;
            }
            if (draft.status === "Submitted" ||
                draft.status === "Queued" ||
                draft.status === "Merged") {
                result.submitted += 1;
            }
            if (draft.status === "Queued") {
                result.queued += 1;
            }
            if (draft.status === "Merged") {
                result.merged += 1;
            }
            return result;
        }, {
            inProgress: 0,
            ready: 0,
            submitted: 0,
            queued: 0,
            merged: 0,
        });
    }, [drafts]);
    const visibleDrafts = (0, react_1.useMemo)(() => {
        const term = search.trim().toLowerCase();
        return drafts.filter((draft) => {
            if (!matchesFilter(draft.status, filter)) {
                return false;
            }
            if (!term) {
                return true;
            }
            const submissionId = draft.submission
                ? firstText(draft.submission.metadata, ["submissionId"])
                : "";
            return [
                draft.metadata.searchableText,
                draft.surveyors,
                submissionId,
                draft.status,
            ].some((value) => value.toLowerCase().includes(term));
        });
    }, [drafts, filter, search]);
    async function handleContinue(session) {
        setBusyId(session.id);
        setError("");
        try {
            (0, surveySessionService_1.activateSurveyDraft)(profile.uid, session.id);
            routeToDataEntry();
        }
        catch {
            setError("This saved survey could not be opened.");
        }
        finally {
            setBusyId("");
        }
    }
    async function handleDuplicate(session) {
        setBusyId(session.id);
        setError("");
        setMessage("");
        try {
            (0, surveySessionService_1.duplicateSurveyDraft)(profile.uid, session.id);
            setMessage("Survey duplicated. The new copy is ready to edit.");
            await refresh({ preserveMessages: true });
        }
        catch {
            setError("This survey could not be duplicated.");
        }
        finally {
            setBusyId("");
        }
    }
    async function handleDelete(session) {
        const record = sessions.find((item) => item.session.id === session.id);
        const siteName = record?.metadata.siteName ?? "this survey";
        const confirmed = window.confirm(`Delete the saved survey for ${siteName}? This cannot be undone.`);
        if (!confirmed) {
            return;
        }
        setBusyId(session.id);
        setError("");
        setMessage("");
        try {
            (0, surveySessionService_1.deleteSurveyDraft)(profile.uid, session.id);
            setMessage("Saved survey deleted.");
            await refresh({ preserveMessages: true });
        }
        catch {
            setError("This saved survey could not be deleted.");
        }
        finally {
            setBusyId("");
        }
    }
    async function handleNewSurvey() {
        setBusyId("new");
        setError("");
        setMessage("");
        try {
            const session = (0, surveySessionService_1.createSurveyDraft)(profile.uid);
            (0, surveySessionService_1.activateSurveyDraft)(profile.uid, session.id);
            routeToDataEntry();
        }
        catch {
            setError("A new survey could not be created.");
        }
        finally {
            setBusyId("");
        }
    }
    return (<div className="drafts-page">
      <header className="drafts-page-header">
        <div>
          <p className="drafts-eyebrow">
            SURVEY WORKBENCH
          </p>
          <h1>Drafts</h1>
          <span>
            Continue saved field work, review survey
            progress, and track submitted records.
          </span>
        </div>

        <button type="button" className="drafts-new-button" disabled={busyId === "new"} onClick={handleNewSurvey}>
          <span aria-hidden="true">＋</span>
          {busyId === "new"
            ? "Creating..."
            : "New Survey"}
        </button>
      </header>

      <section className="drafts-metrics-grid" aria-label="Draft summary">
        <DraftMetric label="In Progress" value={counts.inProgress} detail="Surveys still being entered"/>
        <DraftMetric label="Ready" value={counts.ready} detail="Complete and ready to submit"/>
        <DraftMetric label="Submitted" value={counts.submitted} detail="Sent to the submission system"/>
        <DraftMetric label="Queued" value={counts.queued} detail="Awaiting processing"/>
        <DraftMetric label="Merged" value={counts.merged} detail="Included in a published dataset"/>
      </section>

      {(message || error) && (<div className={error
                ? "drafts-alert drafts-alert-error"
                : "drafts-alert"} role={error ? "alert" : "status"}>
          {error || message}
        </div>)}

      <section className="drafts-toolbar">
        <label className="drafts-search">
          <span aria-hidden="true">⌕</span>

          <input type="search" value={search} placeholder="Search site, waterbody, species, Collection ID, or Submission ID" onChange={(event) => setSearch(event.target.value)}/>

          {search && (<button type="button" aria-label="Clear search" onClick={() => setSearch("")}>
              ×
            </button>)}
        </label>

        <button type="button" className="drafts-refresh-button" disabled={loading} onClick={() => {
            setLoading(true);
            void refresh();
        }}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </section>

      <div className="drafts-filter-row" aria-label="Filter drafts">
        {FILTERS.map((item) => (<button type="button" key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>
            {item.label}
          </button>))}
      </div>

      <section className="drafts-results-heading">
        <div>
          <h2>
            {filter === "all"
            ? "All Survey Work"
            : FILTERS.find((item) => item.id === filter)?.label}
          </h2>

          <span>
            {visibleDrafts.length}{" "}
            {visibleDrafts.length === 1
            ? "record"
            : "records"}
          </span>
        </div>

        <span>Sorted by most recently edited</span>
      </section>

      {loading && drafts.length === 0 ? (<div className="drafts-empty-state">
          <span className="drafts-empty-icon" aria-hidden="true">
            ◌
          </span>
          <h2>Loading survey work...</h2>
          <p>
            Your locally saved drafts and submission
            statuses are loading.
          </p>
        </div>) : visibleDrafts.length > 0 ? (<section className="drafts-card-grid">
          {visibleDrafts.map((draft) => (<DraftCard key={draft.session.id} draft={draft} busy={busyId === draft.session.id} onContinue={() => handleContinue(draft.session)} onDuplicate={() => handleDuplicate(draft.session)} onDelete={() => handleDelete(draft.session)}/>))}
        </section>) : (<div className="drafts-empty-state">
          <span className="drafts-empty-icon" aria-hidden="true">
            ▤
          </span>

          <h2>
            {drafts.length === 0
                ? "No saved surveys yet"
                : "No matching surveys"}
          </h2>

          <p>
            {drafts.length === 0
                ? "Start a new survey and it will appear here automatically."
                : "Try clearing the search or selecting a different status filter."}
          </p>

          {drafts.length === 0 && (<button type="button" className="drafts-new-button" disabled={busyId === "new"} onClick={handleNewSurvey}>
              Start New Survey
            </button>)}
        </div>)}
    </div>);
}
//# sourceMappingURL=DraftsPage.js.map