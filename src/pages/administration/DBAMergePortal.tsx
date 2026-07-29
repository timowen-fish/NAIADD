import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { UserProfile } from "../../types/user";
import type {
  SubmissionStatus,
  SurveySubmission,
} from "../../types/submission";
import {
  approveSubmission,
  archiveSubmission,
  listSubmissionQueue,
  rejectSubmission,
  retrySubmission,
  submissionBusinessStatus,
  submissionPayload,
  type SubmissionQueueRecord,
} from "../../services/submissionQueueService";
import {
  publishSelectedSubmissions,
  type PublishSelectedSubmissionsResult,
} from "../../services/publishedDeltaService";
import "./DBAMergePortal.css";

type Props = {
  profile: UserProfile;
  onBack: () => void;
};

type AnyRecord = Record<string, unknown>;
type StatusFilter = "All" | SubmissionStatus;

const statusOptions: StatusFilter[] = [
  "Queued",
  "Approved",
  "Merged",
  "Rejected",
  "Archived",
  "Draft",
  "All",
];

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object"
    ? (value as AnyRecord)
    : {};
}

function firstValue(
  record: AnyRecord,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    const value = record[key];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
}

function display(value: unknown, fallback = "—"): string {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return fallback;
  }

  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean).join(", ") || fallback;
  }

  return String(value);
}

function numeric(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value: unknown): string {
  const text = display(value, "");

  if (!text) return "—";

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) return text;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: unknown): string {
  const text = display(value, "");

  if (!text) return "—";

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) return text;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function specimenTypeLabel(
  value: SurveySubmission["metadata"]["specimenFormType"],
): string {
  if (value === "standard_mussel") {
    return "Standard Mussel Processing";
  }

  if (value === "quads") return "Quads";
  if (value === "musselrama") return "Musselrama";

  return "Unknown";
}

function statusClass(status: SubmissionStatus): string {
  return `dba-status ${status.toLowerCase()}`;
}

function processingStateClass(value: string): string {
  return `dba-processing-state ${value.toLowerCase()}`;
}

function queueSummary(record: SubmissionQueueRecord) {
  const payload = submissionPayload(record.submission);
  const location = asRecord(payload.location);
  const survey = asRecord(payload.survey);
  const specimens = Array.isArray(payload.specimens)
    ? payload.specimens.map(asRecord)
    : [];

  const realSpecimens = specimens.filter((row) => {
    const scientificName = display(
      firstValue(row, [
        "ScientificName",
        "scientificName",
      ]),
      "",
    );

    return (
      scientificName !== "" &&
      scientificName !== "No Specimen"
    );
  });

  const specimenCount = realSpecimens.reduce(
    (sum, row) =>
      sum +
      (numeric(firstValue(row, ["Quantity", "quantity"])) ?? 1),
    0,
  );

  const speciesCount = new Set(
    realSpecimens
      .map((row) =>
        display(
          firstValue(row, [
            "ScientificName",
            "scientificName",
          ]),
          "",
        ),
      )
      .filter(Boolean),
  ).size;

  return {
    payload,
    location,
    survey,
    specimens,
    waterbody: display(
      firstValue(location, ["Waterbody", "waterbody"]),
    ),
    siteName: display(
      firstValue(location, ["SiteName", "siteName"]),
    ),
    siteId: display(
      firstValue(location, ["SiteID", "siteID", "id"]),
    ),
    surveyDate: display(
      firstValue(survey, [
        "Survey_Date",
        "SurveyDate",
        "surveyDate",
        "Date",
      ]),
    ),
    surveyType: display(
      firstValue(survey, [
        "Survey_Type",
        "SurveyType",
        "surveyType",
      ]),
    ),
    samplingMethod: display(
      firstValue(survey, [
        "SamplingMethod",
        "Sampling_Method",
        "samplingMethod",
      ]),
    ),
    specimenCount,
    speciesCount,
  };
}

function errorMessage(error: unknown): string {
  const code = display(asRecord(error).code, "").toLowerCase();

  if (code.includes("permission-denied")) {
    return (
      "Firestore denied access to the submission queue. " +
      "Confirm this account is active and has the admin role."
    );
  }

  return error instanceof Error
    ? error.message
    : "The submission queue could not be loaded.";
}

export default function DBAMergePortal({
  profile,
  onBack,
}: Props) {
  const [records, setRecords] = useState<
    SubmissionQueueRecord[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("Queued");
  const [searchText, setSearchText] = useState("");
  const [openRecord, setOpenRecord] =
    useState<SubmissionQueueRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function loadQueue(): Promise<void> {
    setLoading(true);
    setMessage("");
    setSuccessMessage("");

    try {
      const loaded = await listSubmissionQueue();
      setRecords(loaded);

      setSelectedIds((current) => {
        const availableIds = new Set(
          loaded.map((item) => item.documentId),
        );

        return new Set(
          Array.from(current).filter((id) =>
            availableIds.has(id),
          ),
        );
      });
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue();
  }, []);

  const filteredRecords = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    return records.filter((record) => {
      const status = submissionBusinessStatus(
        record.submission,
      );

      if (
        statusFilter !== "All" &&
        status !== statusFilter
      ) {
        return false;
      }

      if (!search) return true;

      const summary = queueSummary(record);
      const metadata = record.submission.metadata;

      const searchable = [
        metadata.submissionId,
        metadata.collectionId,
        metadata.submittedByDisplayName,
        metadata.submittedByEmail,
        summary.waterbody,
        summary.siteName,
        summary.siteId,
        summary.surveyDate,
        summary.surveyType,
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(search);
    });
  }, [records, searchText, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<SubmissionStatus, number> = {
      Draft: 0,
      Queued: 0,
      Approved: 0,
      Archived: 0,
      Merged: 0,
      Rejected: 0,
    };

    records.forEach((record) => {
      counts[submissionBusinessStatus(record.submission)] += 1;
    });

    return counts;
  }, [records]);

  const selectedRecords = useMemo(
    () =>
      records.filter((record) =>
        selectedIds.has(record.documentId),
      ),
    [records, selectedIds],
  );

  const selectableFilteredRecords = useMemo(
    () =>
      filteredRecords.filter((record) => {
        const status = submissionBusinessStatus(record.submission);
        return status === "Queued" || status === "Approved";
      }),
    [filteredRecords],
  );

  const allFilteredSelected =
    selectableFilteredRecords.length > 0 &&
    selectableFilteredRecords.every((record) =>
      selectedIds.has(record.documentId),
    );

  function toggleSelection(documentId: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }

      return next;
    });
  }

  function toggleAllFiltered(): void {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (allFilteredSelected) {
        selectableFilteredRecords.forEach((record) =>
          next.delete(record.documentId),
        );
      } else {
        selectableFilteredRecords.forEach((record) =>
          next.add(record.documentId),
        );
      }

      return next;
    });
  }

  async function refreshAfterAction(
    success: string,
  ): Promise<void> {
    const loaded = await listSubmissionQueue();
    setRecords(loaded);
    setSelectedIds(new Set());
    setOpenRecord(null);
    setMessage("");
    setSuccessMessage(success);
  }

  async function runSingleAction(
    action: () => Promise<void>,
    success: string,
  ): Promise<void> {
    if (actionBusy || publishing) return;

    setActionBusy(true);
    setMessage("");
    setSuccessMessage("");

    try {
      await action();
      await refreshAfterAction(success);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The submission could not be updated.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function handleApprove(record: SubmissionQueueRecord) {
    await runSingleAction(
      () => approveSubmission(record.documentId, profile),
      "Submission approved.",
    );
  }

  async function handleReject(record: SubmissionQueueRecord) {
    const reason = window.prompt(
      "Enter the reason this submission is being rejected:",
    );

    if (reason === null) return;

    await runSingleAction(
      () => rejectSubmission(record.documentId, reason, profile),
      "Submission rejected.",
    );
  }

  async function handleArchive(record: SubmissionQueueRecord) {
    const confirmed = window.confirm(
      "Archive this submission? It will remain in Firestore and can still be viewed by status.",
    );

    if (!confirmed) return;

    await runSingleAction(
      () => archiveSubmission(record.documentId, profile),
      "Submission archived.",
    );
  }

  async function handleRetry(record: SubmissionQueueRecord) {
    await runSingleAction(
      () => retrySubmission(record.documentId, profile),
      "Submission processing retry requested.",
    );
  }

  async function runBulkAction(
    mode: "approve" | "reject" | "archive",
  ): Promise<void> {
    if (selectedRecords.length === 0 || actionBusy || publishing) return;

    let reason = "";

    if (mode === "reject") {
      const entered = window.prompt(
        `Enter the rejection reason for ${selectedRecords.length} selected submission${selectedRecords.length === 1 ? "" : "s"}:`,
      );

      if (entered === null) return;
      reason = entered.trim();

      if (!reason) {
        setMessage("Enter a rejection reason.");
        return;
      }
    }

    const eligible = selectedRecords.filter((record) => {
      const status = submissionBusinessStatus(record.submission);

      if (mode === "approve") return status === "Queued";
      if (mode === "reject") {
        return status === "Queued" || status === "Approved";
      }

      return status !== "Merged" && status !== "Draft";
    });

    if (eligible.length === 0) {
      setMessage(
        `None of the selected submissions can be ${mode === "approve" ? "approved" : mode === "reject" ? "rejected" : "archived"}.`,
      );
      return;
    }

    const confirmed = window.confirm(
      `${mode === "approve" ? "Approve" : mode === "reject" ? "Reject" : "Archive"} ${eligible.length} selected submission${eligible.length === 1 ? "" : "s"}?`,
    );

    if (!confirmed) return;

    setActionBusy(true);
    setMessage("");
    setSuccessMessage("");

    try {
      for (const record of eligible) {
        if (mode === "approve") {
          await approveSubmission(record.documentId, profile);
        } else if (mode === "reject") {
          await rejectSubmission(record.documentId, reason, profile);
        } else {
          await archiveSubmission(record.documentId, profile);
        }
      }

      await refreshAfterAction(
        `${eligible.length} submission${eligible.length === 1 ? "" : "s"} ${mode === "approve" ? "approved" : mode === "reject" ? "rejected" : "archived"}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The selected submissions could not be updated.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function runViewerAction(
    action: () => Promise<void>,
    success: string,
  ): Promise<void> {
    if (!openRecord || actionBusy || publishing) return;

    const fallbackDocumentId =
      nextOpenRecord?.documentId ??
      previousOpenRecord?.documentId ??
      null;

    setActionBusy(true);
    setMessage("");
    setSuccessMessage("");

    try {
      await action();

      const loaded = await listSubmissionQueue();
      setRecords(loaded);
      setSelectedIds(new Set());
      setSuccessMessage(success);

      const nextRecord = fallbackDocumentId
        ? loaded.find(
            (record) =>
              record.documentId === fallbackDocumentId,
          ) ?? null
        : null;

      setOpenRecord(nextRecord);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The submission could not be updated.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function handleViewerApprove(): Promise<void> {
    if (!openRecord) return;

    await runViewerAction(
      () =>
        approveSubmission(openRecord.documentId, profile),
      "Submission approved.",
    );
  }

  async function handleViewerReject(): Promise<void> {
    if (!openRecord) return;

    const reason = window.prompt(
      "Enter the reason this submission is being rejected:",
    );

    if (reason === null) return;

    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      setMessage("Enter a rejection reason.");
      return;
    }

    await runViewerAction(
      () =>
        rejectSubmission(
          openRecord.documentId,
          trimmedReason,
          profile,
        ),
      "Submission rejected.",
    );
  }

  async function handleViewerArchive(): Promise<void> {
    if (!openRecord) return;

    const confirmed = window.confirm(
      "Archive this submission? It will remain in Firestore and can still be viewed by status.",
    );

    if (!confirmed) return;

    await runViewerAction(
      () =>
        archiveSubmission(openRecord.documentId, profile),
      "Submission archived.",
    );
  }

  async function handleViewerRetry(): Promise<void> {
    if (!openRecord) return;

    await runViewerAction(
      () => retrySubmission(openRecord.documentId, profile),
      "Submission processing retry requested.",
    );
  }

  const openRecordIndex = openRecord
    ? filteredRecords.findIndex(
        (record) => record.documentId === openRecord.documentId,
      )
    : -1;

  const previousOpenRecord =
    openRecordIndex > 0
      ? filteredRecords[openRecordIndex - 1]
      : null;

  const nextOpenRecord =
    openRecordIndex >= 0 &&
    openRecordIndex < filteredRecords.length - 1
      ? filteredRecords[openRecordIndex + 1]
      : null;

  async function handlePublishSelected(): Promise<void> {
    if (selectedRecords.length === 0 || publishing) return;

    const approvedSelections = selectedRecords.filter(
      (record) =>
        submissionBusinessStatus(record.submission) === "Approved",
    );

    if (approvedSelections.length !== selectedRecords.length) {
      setSuccessMessage("");
      setMessage(
        "Only submissions with Approved status can be published. Approve queued submissions before publishing.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Publish ${selectedRecords.length} approved submission${selectedRecords.length === 1 ? "" : "s"} to the active NAIADD dataset? This will create a published delta and mark the selected submissions as Merged.`,
    );

    if (!confirmed) return;

    setPublishing(true);
    setMessage("");
    setSuccessMessage("");

    try {
      const result: PublishSelectedSubmissionsResult =
        await publishSelectedSubmissions(
          selectedRecords,
          profile,
        );

      setSelectedIds(new Set());

      setSuccessMessage(
        `Delta ${result.deltaId} was published successfully with ${result.submissionCount} submission${result.submissionCount === 1 ? "" : "s"}, ${result.rowCount} flattened row${result.rowCount === 1 ? "" : "s"}, ${result.collectionCount} collection${result.collectionCount === 1 ? "" : "s"}, and ${result.siteCount} site${result.siteCount === 1 ? "" : "s"}.`,
      );

      const loaded = await listSubmissionQueue();
      setRecords(loaded);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The selected submissions could not be published.",
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <main className="dba-portal">
      <button
        type="button"
        className="dba-back-button"
        onClick={onBack}
      >
        ← Back to Administration
      </button>

      <section className="dba-hero">
        <div>
          <p>NAIADD Administration</p>
          <h1>DBA Merge Portal</h1>
          <span>
            Review, approve, reject, archive, and publish Firestore
            submissions to the active NAIADD dataset.
          </span>
        </div>

        <button
          type="button"
          className="dba-refresh-button"
          onClick={() => void loadQueue()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh Queue"}
        </button>
      </section>

      <section className="dba-stat-grid">
        <StatCard
          label="Queued"
          value={statusCounts.Queued}
          detail="Awaiting DBA review"
        />
        <StatCard
          label="Approved"
          value={statusCounts.Approved}
          detail="Ready for publication"
        />
        <StatCard
          label="Merged"
          value={statusCounts.Merged}
          detail="Previously completed"
        />
        <StatCard
          label="Total"
          value={records.length}
          detail="Firestore submissions"
        />
      </section>

      <section className="dba-queue-card">
        <div className="dba-toolbar">
          <label className="dba-search">
            <span>Search submissions</span>
            <input
              type="search"
              value={searchText}
              placeholder="Collection ID, waterbody, site, submitter…"
              onChange={(event) =>
                setSearchText(event.target.value)
              }
            />
          </label>

          <label className="dba-filter">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as StatusFilter,
                )
              }
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                  {status !== "All"
                    ? ` (${statusCounts[status]})`
                    : ` (${records.length})`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="dba-list-header">
          <label>
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleAllFiltered}
              disabled={
                selectableFilteredRecords.length === 0 ||
                publishing ||
                actionBusy
              }
            />
            Select all shown
          </label>

          <span>
            {filteredRecords.length} submission
            {filteredRecords.length === 1 ? "" : "s"} shown
          </span>
        </div>

        {message && (
          <div className="dba-message error">{message}</div>
        )}

        {successMessage && (
          <div className="dba-message success">
            {successMessage}
          </div>
        )}

        {loading ? (
          <div className="dba-empty-state">
            <span>↻</span>
            <h2>Loading submission queue</h2>
            <p>Reading available surveys from Firestore.</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="dba-empty-state">
            <span>✓</span>
            <h2>No matching submissions</h2>
            <p>
              Adjust the search or status filter, or refresh the
              Firestore queue.
            </p>
          </div>
        ) : (
          <div className="dba-submission-list">
            {filteredRecords.map((record) => {
              const submission = record.submission;
              const metadata = submission.metadata;
              const summary = queueSummary(record);
              const status =
                submissionBusinessStatus(submission);
              const selected = selectedIds.has(
                record.documentId,
              );

              return (
                <article
                  key={record.documentId}
                  className={
                    selected
                      ? "dba-submission-card selected"
                      : "dba-submission-card"
                  }
                >
                  <label className="dba-selection-box">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={
                        (status !== "Queued" &&
                          status !== "Approved") ||
                        publishing ||
                        actionBusy
                      }
                      onChange={() =>
                        toggleSelection(record.documentId)
                      }
                    />
                    <span aria-hidden="true" />
                  </label>

                  <div className="dba-submission-main">
                    <div className="dba-submission-heading">
                      <div>
                        <span className={statusClass(status)}>
                          {status}
                        </span>
                        <h2>{summary.waterbody}</h2>
                        <p>{summary.siteName}</p>
                      </div>

                      <div className="dba-card-actions">
                        <button
                          type="button"
                          className="dba-view-button"
                          onClick={() => setOpenRecord(record)}
                          disabled={actionBusy || publishing}
                        >
                          Review
                        </button>

                        {status === "Queued" && (
                          <button
                            type="button"
                            className="dba-action-button approve"
                            onClick={() => void handleApprove(record)}
                            disabled={actionBusy || publishing}
                          >
                            Approve
                          </button>
                        )}

                        {(status === "Queued" ||
                          status === "Approved") && (
                          <button
                            type="button"
                            className="dba-action-button reject"
                            onClick={() => void handleReject(record)}
                            disabled={actionBusy || publishing}
                          >
                            Reject
                          </button>
                        )}

                        {status !== "Merged" &&
                          status !== "Draft" &&
                          status !== "Archived" && (
                            <button
                              type="button"
                              className="dba-action-button archive"
                              onClick={() => void handleArchive(record)}
                              disabled={actionBusy || publishing}
                            >
                              Archive
                            </button>
                          )}

                        {submission.processing?.processingState ===
                          "Failed" && (
                          <button
                            type="button"
                            className="dba-action-button retry"
                            onClick={() => void handleRetry(record)}
                            disabled={actionBusy || publishing}
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="dba-metadata-grid">
                      <Metadata
                        label="Collection ID"
                        value={metadata.collectionId}
                        mono
                      />
                      <Metadata
                        label="Survey Date"
                        value={formatDate(summary.surveyDate)}
                      />
                      <Metadata
                        label="Submitted By"
                        value={
                          metadata.submittedByDisplayName ||
                          metadata.submittedByEmail ||
                          metadata.submittedByUid
                        }
                      />
                      <Metadata
                        label="Submitted"
                        value={formatDateTime(
                          submission.processing?.queuedAt ??
                            metadata.queuedAt ??
                            metadata.createdAt,
                        )}
                      />
                      <Metadata
                        label="Specimens"
                        value={String(summary.specimenCount)}
                      />
                      <Metadata
                        label="Species"
                        value={String(summary.speciesCount)}
                      />
                      <Metadata
                        label="Entry Method"
                        value={specimenTypeLabel(
                          metadata.specimenFormType,
                        )}
                      />
                      <Metadata
                        label="Submission ID"
                        value={metadata.submissionId}
                        mono
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="dba-selection-footer">
        <div>
          <strong>
            {selectedIds.size} submission
            {selectedIds.size === 1 ? "" : "s"} selected
          </strong>
          <span>
            Approve reviewed submissions, then publish approved records as an immutable dataset delta.
          </span>
        </div>

        <div className="dba-bulk-actions">
          <button
            type="button"
            className="secondary"
            disabled={selectedIds.size === 0 || actionBusy || publishing}
            onClick={() => void runBulkAction("approve")}
          >
            Approve Selected
          </button>

          <button
            type="button"
            className="danger"
            disabled={selectedIds.size === 0 || actionBusy || publishing}
            onClick={() => void runBulkAction("reject")}
          >
            Reject Selected
          </button>

          <button
            type="button"
            className="secondary"
            disabled={selectedIds.size === 0 || actionBusy || publishing}
            onClick={() => void runBulkAction("archive")}
          >
            Archive Selected
          </button>

          <button
            type="button"
            disabled={selectedIds.size === 0 || actionBusy || publishing}
            onClick={() => void handlePublishSelected()}
          >
            {publishing ? "Publishing…" : "Publish Approved"}
          </button>
        </div>
      </section>

      {openRecord && (
        <SubmissionViewer
          record={openRecord}
          position={openRecordIndex + 1}
          total={filteredRecords.length}
          hasPrevious={previousOpenRecord !== null}
          hasNext={nextOpenRecord !== null}
          onPrevious={() => {
            if (previousOpenRecord) {
              setOpenRecord(previousOpenRecord);
            }
          }}
          onNext={() => {
            if (nextOpenRecord) {
              setOpenRecord(nextOpenRecord);
            }
          }}
          actionBusy={actionBusy || publishing}
          onApprove={() => void handleViewerApprove()}
          onReject={() => void handleViewerReject()}
          onArchive={() => void handleViewerArchive()}
          onRetry={() => void handleViewerRetry()}
          onClose={() => setOpenRecord(null)}
        />
      )}

      <p className="dba-user-note">
        Signed in as{" "}
        <strong>
          {profile.displayName || profile.email || profile.uid}
        </strong>
      </p>
    </main>
  );
}

function SubmissionViewer({
  record,
  position,
  total,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  actionBusy,
  onApprove,
  onReject,
  onArchive,
  onRetry,
  onClose,
}: {
  record: SubmissionQueueRecord;
  position: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  actionBusy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onArchive: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  type ReviewTab =
    | "summary"
    | "validation"
    | "specimens"
    | "history";
  type SpecimenSort =
    | "original"
    | "scientificName"
    | "quantityHigh"
    | "condition"
    | "size";

  const [activeTab, setActiveTab] =
    useState<ReviewTab>("summary");
  const [specimenSearch, setSpecimenSearch] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("All");
  const [specimenSort, setSpecimenSort] =
    useState<SpecimenSort>("original");

  useEffect(() => {
    setSpecimenSearch("");
    setSpeciesFilter("All");
    setSpecimenSort("original");
  }, [record.documentId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "SELECT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (isTyping) return;

      if (event.key === "ArrowLeft" && hasPrevious) {
        event.preventDefault();
        onPrevious();
      }

      if (event.key === "ArrowRight" && hasNext) {
        event.preventDefault();
        onNext();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    hasNext,
    hasPrevious,
    onClose,
    onNext,
    onPrevious,
  ]);

  const submission = record.submission;
  const metadata = submission.metadata;
  const summary = queueSummary(record);
  const status = submissionBusinessStatus(submission);
  const processing = submission.processing;
  const validationIssues = processing?.validationIssues ?? [];
  const validationErrors = validationIssues.filter(
    (issue) => issue.severity === "error",
  );
  const validationWarnings = validationIssues.filter(
    (issue) => issue.severity === "warning",
  );
  const history = [...(submission.history ?? [])].sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt),
  );

  const speciesOptions = useMemo(() => {
    return Array.from(
      new Set(
        summary.specimens
          .map((row) =>
            display(
              firstValue(row, [
                "ScientificName",
                "scientificName",
              ]),
              "",
            ),
          )
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right));
  }, [summary.specimens]);

  const visibleSpecimens = useMemo(() => {
    const normalizedSearch = specimenSearch.trim().toLowerCase();

    const filtered = summary.specimens
      .map((row, originalIndex) => ({
        row,
        originalIndex,
      }))
      .filter(({ row }) => {
        const scientificName = display(
          firstValue(row, [
            "ScientificName",
            "scientificName",
          ]),
          "",
        );
        const bova = display(
          firstValue(row, ["BOVA", "bova"]),
          "",
        );
        const condition = display(
          firstValue(row, ["Condition", "condition"]),
          "",
        );
        const sexMaturity = display(
          firstValue(row, [
            "SexMaturity",
            "sexMaturity",
          ]),
          "",
        );

        const matchesSpecies =
          speciesFilter === "All" ||
          scientificName === speciesFilter;

        const matchesSearch =
          normalizedSearch === "" ||
          [
            scientificName,
            bova,
            condition,
            sexMaturity,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);

        return matchesSpecies && matchesSearch;
      });

    return filtered.sort((left, right) => {
      const leftRow = left.row;
      const rightRow = right.row;

      if (specimenSort === "scientificName") {
        return display(
          firstValue(leftRow, [
            "ScientificName",
            "scientificName",
          ]),
          "",
        ).localeCompare(
          display(
            firstValue(rightRow, [
              "ScientificName",
              "scientificName",
            ]),
            "",
          ),
        );
      }

      if (specimenSort === "quantityHigh") {
        return (
          (numeric(
            firstValue(rightRow, ["Quantity", "quantity"]),
          ) ?? 0) -
          (numeric(
            firstValue(leftRow, ["Quantity", "quantity"]),
          ) ?? 0)
        );
      }

      if (specimenSort === "condition") {
        return display(
          firstValue(leftRow, ["Condition", "condition"]),
          "",
        ).localeCompare(
          display(
            firstValue(rightRow, ["Condition", "condition"]),
            "",
          ),
        );
      }

      if (specimenSort === "size") {
        return display(
          firstValue(leftRow, ["Size", "size"]),
          "",
        ).localeCompare(
          display(
            firstValue(rightRow, ["Size", "size"]),
            "",
          ),
        );
      }

      return left.originalIndex - right.originalIndex;
    });
  }, [
    specimenSearch,
    speciesFilter,
    specimenSort,
    summary.specimens,
  ]);

  const tabs: Array<{
    id: ReviewTab;
    label: string;
    count?: number;
  }> = [
    { id: "summary", label: "Summary" },
    {
      id: "validation",
      label: "Validation",
      count: validationIssues.length,
    },
    {
      id: "specimens",
      label: "Specimens",
      count: summary.specimens.length,
    },
    {
      id: "history",
      label: "History",
      count: history.length,
    },
  ];

  return (
    <div
      className="dba-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="dba-viewer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dba-viewer-title"
      >
        <header className="dba-viewer-header">
          <div className="dba-viewer-title">
            <div className="dba-viewer-title-meta">
              <span className={statusClass(status)}>{status}</span>
              <span className="dba-viewer-position">
                Submission {position} of {total}
              </span>
            </div>
            <h2 id="dba-viewer-title">
              {summary.waterbody}
            </h2>
            <p>{summary.siteName}</p>
          </div>

          <div className="dba-viewer-navigation">
            <button
              type="button"
              className="dba-viewer-nav-button"
              aria-label="Previous submission"
              title="Previous submission (Left Arrow)"
              disabled={!hasPrevious}
              onClick={onPrevious}
            >
              ←
              <span>Previous</span>
            </button>

            <button
              type="button"
              className="dba-viewer-nav-button"
              aria-label="Next submission"
              title="Next submission (Right Arrow)"
              disabled={!hasNext}
              onClick={onNext}
            >
              <span>Next</span>
              →
            </button>

            <button
              type="button"
              className="dba-viewer-close-button"
              aria-label="Close submission viewer"
              title="Close viewer (Escape)"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>

        <nav
          className="dba-review-tabs"
          aria-label="Submission review sections"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? "active" : ""}
              aria-pressed={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <strong>{tab.count}</strong>
              )}
            </button>
          ))}
        </nav>

        <div className="dba-viewer-body">
          {activeTab === "summary" && (
            <>
              <section className="dba-detail-card">
                <h3>Submission</h3>
                <div className="dba-detail-grid">
                  <Metadata
                    label="Collection ID"
                    value={metadata.collectionId}
                    mono
                  />
                  <Metadata
                    label="Submission ID"
                    value={metadata.submissionId}
                    mono
                  />
                  <Metadata
                    label="Submitted By"
                    value={
                      metadata.submittedByDisplayName ||
                      metadata.submittedByEmail ||
                      metadata.submittedByUid
                    }
                  />
                  <Metadata
                    label="Queued"
                    value={formatDateTime(
                      processing?.queuedAt ??
                        metadata.createdAt,
                    )}
                  />
                  <Metadata
                    label="Entry Method"
                    value={specimenTypeLabel(
                      metadata.specimenFormType,
                    )}
                  />
                  <Metadata
                    label="Schema Version"
                    value={String(submission.schemaVersion)}
                  />
                </div>
              </section>

              <section className="dba-detail-card">
                <h3>Location</h3>
                <div className="dba-detail-grid">
                  <Metadata
                    label="Waterbody"
                    value={summary.waterbody}
                  />
                  <Metadata
                    label="Site Name"
                    value={summary.siteName}
                  />
                  <Metadata
                    label="Site ID"
                    value={summary.siteId}
                    mono
                  />
                  <Metadata
                    label="Latitude"
                    value={display(
                      firstValue(summary.location, [
                        "LatitudeDD",
                        "DownstreamLat",
                        "Latitude",
                        "latitude",
                        "Lat",
                        "lat",
                      ]),
                    )}
                  />
                  <Metadata
                    label="Longitude"
                    value={display(
                      firstValue(summary.location, [
                        "LongitudeDD",
                        "DownstreamLong",
                        "Longitude",
                        "longitude",
                        "Lon",
                        "lon",
                        "Lng",
                        "lng",
                      ]),
                    )}
                  />
                </div>
              </section>

              <section className="dba-detail-card">
                <h3>Survey</h3>
                <div className="dba-detail-grid">
                  <Metadata
                    label="Survey Date"
                    value={formatDate(summary.surveyDate)}
                  />
                  <Metadata
                    label="Survey Type"
                    value={summary.surveyType}
                  />
                  <Metadata
                    label="Sampling Method"
                    value={summary.samplingMethod}
                  />
                  <Metadata
                    label="Project"
                    value={display(
                      firstValue(summary.survey, [
                        "Project",
                        "project",
                      ]),
                    )}
                  />
                  <Metadata
                    label="Identified By"
                    value={display(
                      firstValue(summary.survey, [
                        "IdentifiedBy",
                        "identifiedBy",
                      ]),
                    )}
                  />
                  <Metadata
                    label="Collectors"
                    value={display(
                      firstValue(summary.survey, [
                        "Collectors",
                        "collectors",
                      ]),
                    )}
                  />
                </div>
              </section>

              <section className="dba-detail-card">
                <div className="dba-detail-heading">
                  <h3>Processing</h3>
                  <span
                    className={processingStateClass(
                      processing?.processingState ?? "Pending",
                    )}
                  >
                    {processing?.processingState ?? "Pending"}
                  </span>
                </div>

                <div className="dba-detail-grid">
                  <Metadata
                    label="Business Status"
                    value={processing?.businessStatus ?? status}
                  />
                  <Metadata
                    label="Processing State"
                    value={
                      processing?.processingState ?? "Pending"
                    }
                  />
                  <Metadata
                    label="Retry Count"
                    value={String(processing?.retryCount ?? 0)}
                  />
                  <Metadata
                    label="Last Attempt"
                    value={formatDateTime(
                      processing?.lastAttemptAt,
                    )}
                  />
                  <Metadata
                    label="Processing Started"
                    value={formatDateTime(
                      processing?.processingStartedAt,
                    )}
                  />
                  <Metadata
                    label="Processing Completed"
                    value={formatDateTime(
                      processing?.processingCompletedAt,
                    )}
                  />
                  <Metadata
                    label="Merged"
                    value={formatDateTime(processing?.mergedAt)}
                  />
                  <Metadata
                    label="Merged By"
                    value={
                      processing?.mergedByDisplayName ||
                      processing?.mergedByUid ||
                      "—"
                    }
                  />
                </div>

                {processing?.lastErrorMessage && (
                  <div className="dba-processing-error">
                    <strong>Last processing error</strong>
                    <p>{processing.lastErrorMessage}</p>
                  </div>
                )}

                {processing?.rejectionReason && (
                  <div className="dba-processing-rejection">
                    <strong>Rejection reason</strong>
                    <p>{processing.rejectionReason}</p>
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === "validation" && (
            <section className="dba-detail-card">
              <div className="dba-detail-heading">
                <h3>Validation</h3>
                <span>
                  {validationErrors.length} error
                  {validationErrors.length === 1 ? "" : "s"} •{" "}
                  {validationWarnings.length} warning
                  {validationWarnings.length === 1 ? "" : "s"}
                </span>
              </div>

              {validationIssues.length === 0 ? (
                <div className="dba-validation-empty">
                  <span aria-hidden="true">✓</span>
                  <div>
                    <strong>No validation issues recorded</strong>
                    <p>
                      This submission does not currently contain
                      stored validation errors or warnings.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="dba-validation-list">
                  {validationIssues.map((issue, index) => (
                    <article
                      key={`${issue.code}-${index}`}
                      className={`dba-validation-item ${issue.severity}`}
                    >
                      <span
                        className="dba-validation-icon"
                        aria-hidden="true"
                      >
                        {issue.severity === "error" ? "!" : "⚠"}
                      </span>
                      <div>
                        <div className="dba-validation-title">
                          <strong>{issue.message}</strong>
                          <span>{issue.code}</span>
                        </div>
                        {issue.field && (
                          <p>
                            Field: <code>{issue.field}</code>
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === "specimens" && (
            <section className="dba-detail-card">
              <div className="dba-detail-heading">
                <h3>Specimen Records</h3>
                <span>
                  {visibleSpecimens.length} of{" "}
                  {summary.specimens.length} rows shown
                </span>
              </div>

              <div className="dba-specimen-toolbar">
                <label>
                  <span>Search</span>
                  <input
                    type="search"
                    value={specimenSearch}
                    placeholder="Scientific name, BOVA, condition, or sex/maturity"
                    onChange={(event) =>
                      setSpecimenSearch(event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>Species</span>
                  <select
                    value={speciesFilter}
                    onChange={(event) =>
                      setSpeciesFilter(event.target.value)
                    }
                  >
                    <option value="All">All species</option>
                    {speciesOptions.map((species) => (
                      <option key={species} value={species}>
                        {species}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Sort</span>
                  <select
                    value={specimenSort}
                    onChange={(event) =>
                      setSpecimenSort(
                        event.target.value as SpecimenSort,
                      )
                    }
                  >
                    <option value="original">
                      Original order
                    </option>
                    <option value="scientificName">
                      Scientific name
                    </option>
                    <option value="quantityHigh">
                      Quantity: high to low
                    </option>
                    <option value="condition">
                      Condition
                    </option>
                    <option value="size">
                      Size
                    </option>
                  </select>
                </label>
              </div>

              {visibleSpecimens.length === 0 ? (
                <div className="dba-history-empty">
                  No specimen rows match the current search and
                  species filter.
                </div>
              ) : (
                <div className="dba-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Scientific Name</th>
                        <th>BOVA</th>
                        <th>Quantity</th>
                        <th>Size</th>
                        <th>Sex / Maturity</th>
                        <th>Condition</th>
                        <th>Qualitative Abundance</th>
                        <th>Specimen Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSpecimens.map(
                        ({ row, originalIndex }) => (
                          <tr key={originalIndex}>
                            <td>
                              <em>
                                {display(
                                  firstValue(row, [
                                    "ScientificName",
                                    "scientificName",
                                  ]),
                                )}
                              </em>
                            </td>
                            <td>
                              {display(
                                firstValue(row, ["BOVA", "bova"]),
                              )}
                            </td>
                            <td>
                              {display(
                                firstValue(row, [
                                  "Quantity",
                                  "quantity",
                                ]),
                              )}
                            </td>
                            <td>
                              {display(
                                firstValue(row, ["Size", "size"]),
                              )}
                            </td>
                            <td>
                              {display(
                                firstValue(row, [
                                  "SexMaturity",
                                  "sexMaturity",
                                ]),
                              )}
                            </td>
                            <td>
                              {display(
                                firstValue(row, [
                                  "Condition",
                                  "condition",
                                ]),
                              )}
                            </td>
                            <td>
                              {display(
                                firstValue(row, [
                                  "QualAbundance",
                                  "qualAbundance",
                                ]),
                              )}
                            </td>
                            <td>
                              {display(
                                firstValue(row, [
                                  "SpecimenNotes",
                                  "specimenNotes",
                                ]),
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeTab === "history" && (
            <>
              <section className="dba-detail-card">
                <div className="dba-detail-heading">
                  <h3>Audit History</h3>
                  <span>
                    {history.length} event
                    {history.length === 1 ? "" : "s"}
                  </span>
                </div>

                {history.length === 0 ? (
                  <div className="dba-history-empty">
                    No audit history events have been recorded.
                  </div>
                ) : (
                  <div className="dba-history-timeline">
                    {history.map((event, index) => (
                      <article
                        key={
                          event.id ||
                          `${event.type}-${index}`
                        }
                        className="dba-history-event"
                      >
                        <span
                          className="dba-history-marker"
                          aria-hidden="true"
                        />
                        <div className="dba-history-content">
                          <div className="dba-history-heading">
                            <strong>{event.type}</strong>
                            <time>
                              {formatDateTime(event.occurredAt)}
                            </time>
                          </div>
                          <p>{event.message}</p>
                          <div className="dba-history-meta">
                            <span>
                              {event.actorDisplayName ||
                                event.actorUid ||
                                event.actorType}
                            </span>
                            {(event.fromBusinessStatus ||
                              event.toBusinessStatus) && (
                              <span>
                                {event.fromBusinessStatus || "—"}{" "}
                                → {event.toBusinessStatus || "—"}
                              </span>
                            )}
                            {(event.fromProcessingState ||
                              event.toProcessingState) && (
                              <span>
                                {event.fromProcessingState || "—"}{" "}
                                → {event.toProcessingState || "—"}
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <details className="dba-raw-json">
                <summary>
                  Developer Details — Raw Submission JSON
                </summary>
                <pre>
                  {JSON.stringify(submission, null, 2)}
                </pre>
              </details>
            </>
          )}
        </div>

        <footer className="dba-review-action-bar">
          <div>
            <strong>{status}</strong>
            <span>
              Complete the review, then move automatically to the
              next filtered submission.
            </span>
          </div>

          <div className="dba-review-action-buttons">
            {status === "Queued" && (
              <button
                type="button"
                className="approve"
                disabled={actionBusy}
                onClick={onApprove}
              >
                {actionBusy ? "Working…" : "Approve"}
              </button>
            )}

            {(status === "Queued" ||
              status === "Approved") && (
              <button
                type="button"
                className="reject"
                disabled={actionBusy}
                onClick={onReject}
              >
                Reject
              </button>
            )}

            {status !== "Merged" &&
              status !== "Draft" &&
              status !== "Archived" && (
                <button
                  type="button"
                  className="archive"
                  disabled={actionBusy}
                  onClick={onArchive}
                >
                  Archive
                </button>
              )}

            {processing?.processingState === "Failed" && (
              <button
                type="button"
                className="retry"
                disabled={actionBusy}
                onClick={onRetry}
              >
                Retry
              </button>
            )}

            <button
              type="button"
              className="next"
              disabled={!hasNext || actionBusy}
              onClick={onNext}
            >
              Next →
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="dba-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Metadata({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="dba-metadata">
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>
        {value || "—"}
      </strong>
    </div>
  );
}
