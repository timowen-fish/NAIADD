import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import type { SurveySession } from "../types/surveySession";
import {
  SUBMISSION_SCHEMA_VERSION,
  type SubmissionBuildInput,
  type SubmissionBuildResult,
  type SubmissionDeviceMetadata,
  type SubmissionHistoryEvent,
  type SubmissionMetadata,
  type SubmissionPayload,
  type SubmissionProcessing,
  type SubmissionStatus,
  type SubmissionValidationIssue,
  type SubmitSurveyFailureCode,
  type SubmitSurveyInput,
  type SubmitSurveyResult,
  type SurveySubmission,
} from "../types/submission";

type UnknownRecord = Record<string, unknown>;

const DEFAULT_APP_VERSION = "0.0.0";
const SUBMISSIONS_COLLECTION = "submissions";
const DEFAULT_LIST_LIMIT = 100;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object"
    ? (value as UnknownRecord)
    : {};
}


function cleanText(value: unknown): string {
  return value === undefined || value === null
    ? ""
    : String(value).trim();
}

function positiveQuantity(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function specimenRows(session: SurveySession): UnknownRecord[] {
  return Array.isArray(session.specimens)
    ? session.specimens
        .map(asRecord)
        .filter((row) => {
          const scientificName = cleanText(
            row.ScientificName ?? row.scientificName,
          );

          return (
            scientificName !== "" &&
            scientificName !== "No Specimen"
          );
        })
    : [];
}

function collectionIdFromSession(session: SurveySession): string {
  return cleanText(session.collectionId);
}

function makeSubmitterCode(
  displayName: string,
  email: string,
  uid: string,
): string {
  const emailPrefix = email.split("@")[0] ?? "";
  const source = displayName || emailPrefix || uid.slice(0, 8);

  const words = source
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);

  let code = "";

  if (words.length >= 2) {
    code = `${words[0][0] ?? ""}${words.at(-1) ?? ""}`;
  } else {
    code = words[0] ?? "";
  }

  return (
    code
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase()
      .slice(0, 12) || "USER"
  );
}

function timestampCode(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function stableCode(source: string, length = 4): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  let value = hash >>> 0;
  let result = "";

  for (let index = 0; index < length; index += 1) {
    result += alphabet[value % alphabet.length];
    value = Math.floor(value / alphabet.length);
  }

  return result;
}

function validDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function submissionDateFromSession(session: SurveySession): Date {
  return (
    validDate(session.createdAt) ??
    validDate(session.updatedAt) ??
    new Date()
  );
}

export function createSubmissionId(
  submitter: SubmissionBuildInput["submitter"],
  date = new Date(),
  stableKey?: string,
): string {
  const submitterCode = makeSubmitterCode(
    submitter.displayName,
    submitter.email,
    submitter.uid,
  );

  const suffix = stableCode(
    stableKey ??
      `${submitter.uid}|${date.toISOString()}`,
  );

  return `SUB_${submitterCode}_${timestampCode(date)}_${suffix}`;
}

export function getSubmissionDeviceMetadata(): SubmissionDeviceMetadata {
  if (typeof navigator === "undefined") {
    return {
      userAgent: "unknown",
      platform: "unknown",
      language: "unknown",
      online: true,
    };
  }

  return {
    userAgent: navigator.userAgent || "unknown",
    platform: navigator.platform || "unknown",
    language: navigator.language || "unknown",
    online: navigator.onLine,
  };
}

export function validateSubmissionSession(
  session: SurveySession,
): SubmissionValidationIssue[] {
  const issues: SubmissionValidationIssue[] = [];

  if (!session.ownerUid.trim()) {
    issues.push({
      code: "missing-owner",
      message: "The survey session does not have an owner.",
      severity: "error",
      field: "ownerUid",
    });
  }

  if (!session.location) {
    issues.push({
      code: "missing-location",
      message: "Location information is required before submission.",
      severity: "error",
      field: "location",
    });
  }

  if (!session.survey) {
    issues.push({
      code: "missing-survey",
      message: "Survey information is required before submission.",
      severity: "error",
      field: "survey",
    });
  }

  if (!session.specimenFormType) {
    issues.push({
      code: "missing-specimen-form-type",
      message: "A specimen entry method must be selected.",
      severity: "error",
      field: "specimenFormType",
    });
  }

  if (!Array.isArray(session.specimens)) {
    issues.push({
      code: "invalid-specimens",
      message: "The specimen collection is not valid.",
      severity: "error",
      field: "specimens",
    });
  } else {
    const rows = specimenRows(session);

    if (rows.length === 0) {
      issues.push({
        code: "no-specimens",
        message:
          "No mussel specimen records are present. Confirm that this survey intentionally contains no specimens.",
        severity: "warning",
        field: "specimens",
      });
    }

    rows.forEach((row, index) => {
      const rowNumber = index + 1;
      const scientificName = cleanText(
        row.ScientificName ?? row.scientificName,
      );

      if (!scientificName) {
        issues.push({
          code: "missing-scientific-name",
          message: `Specimen row ${rowNumber} is missing a Scientific Name.`,
          severity: "error",
          field: `specimens.${index}.ScientificName`,
        });
      }

      if (
        row.Quantity !== undefined &&
        row.Quantity !== null &&
        row.Quantity !== "" &&
        positiveQuantity(row.Quantity) === null
      ) {
        issues.push({
          code: "invalid-quantity",
          message: `Specimen row ${rowNumber} has an invalid Quantity.`,
          severity: "error",
          field: `specimens.${index}.Quantity`,
        });
      }

      if (!cleanText(row.Condition)) {
        issues.push({
          code: "missing-condition",
          message: `Specimen row ${rowNumber} does not include Condition.`,
          severity: "warning",
          field: `specimens.${index}.Condition`,
        });
      }

      if (!cleanText(row.SexMaturity)) {
        issues.push({
          code: "missing-sex-maturity",
          message: `Specimen row ${rowNumber} does not include Sex/Maturity.`,
          severity: "warning",
          field: `specimens.${index}.SexMaturity`,
        });
      }
    });
  }

  if (!collectionIdFromSession(session)) {
    issues.push({
      code: "missing-collection-id",
      message:
        "The survey does not contain a valid Collection ID.",
      severity: "error",
      field: "survey.CollectionID",
    });
  }

  return issues;
}

function createHistoryEvent(
  input: {
    id: string;
    type: SubmissionHistoryEvent["type"];
    occurredAt: string;
    actorType: SubmissionHistoryEvent["actorType"];
    actorUid: string | null;
    actorDisplayName: string | null;
    message: string;
    fromBusinessStatus: SubmissionHistoryEvent["fromBusinessStatus"];
    toBusinessStatus: SubmissionHistoryEvent["toBusinessStatus"];
    fromProcessingState: SubmissionHistoryEvent["fromProcessingState"];
    toProcessingState: SubmissionHistoryEvent["toProcessingState"];
    details?: Record<string, unknown>;
  },
): SubmissionHistoryEvent {
  return {
    id: input.id,
    type: input.type,
    occurredAt: input.occurredAt,
    actorType: input.actorType,
    actorUid: input.actorUid,
    actorDisplayName: input.actorDisplayName,
    message: input.message,
    fromBusinessStatus: input.fromBusinessStatus,
    toBusinessStatus: input.toBusinessStatus,
    fromProcessingState: input.fromProcessingState,
    toProcessingState: input.toProcessingState,
    ...(input.details ? { details: input.details } : {}),
  };
}

function createInitialProcessing(
  queuedAt: string,
  warnings: SubmissionValidationIssue[],
): SubmissionProcessing {
  return {
    businessStatus: "Queued",
    processingState: "Pending",

    queuedAt,
    processingStartedAt: null,
    processingCompletedAt: null,
    archivedAt: null,
    mergedAt: null,
    rejectedAt: null,

    rejectionReason: null,

    driveFileId: null,
    driveFileName: null,
    driveWebViewUrl: null,

    mergedByUid: null,
    mergedByDisplayName: null,

    retryCount: 0,
    lastAttemptAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,

    validationIssues: warnings,
  };
}

export function buildSurveySubmission(
  input: SubmissionBuildInput,
): SubmissionBuildResult {
  const { session, submitter } = input;
  const issues = validateSubmissionSession(session);

  const errors = issues.filter(
    (issue) => issue.severity === "error",
  );
  const warnings = issues.filter(
    (issue) => issue.severity === "warning",
  );

  if (!submitter.uid.trim()) {
    errors.push({
      code: "missing-submitter-uid",
      message: "The submitting user does not have a valid UID.",
      severity: "error",
      field: "submitter.uid",
    });
  }

  if (!submitter.email.trim()) {
    warnings.push({
      code: "missing-submitter-email",
      message:
        "The submitting user's email address is not available.",
      severity: "warning",
      field: "submitter.email",
    });
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      warnings,
    };
  }

  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const status: SubmissionStatus = input.status ?? "Queued";
  const submissionId = createSubmissionId(
    submitter,
    submissionDateFromSession(session),
    session.id,
  );

  const metadata: SubmissionMetadata = {
    submissionId,
    collectionId: collectionIdFromSession(session),

    submittedByUid: submitter.uid.trim(),
    submittedByEmail: submitter.email.trim(),
    submittedByDisplayName: submitter.displayName.trim(),
    ownerUid: session.ownerUid.trim(),

    appVersion: input.appVersion ?? DEFAULT_APP_VERSION,
    schemaVersion: SUBMISSION_SCHEMA_VERSION,
    specimenFormType: session.specimenFormType ?? null,

    createdAt: nowIso,
    device: getSubmissionDeviceMetadata(),
  };

  const payload: SubmissionPayload = {
    location: session.location,
    survey: session.survey,
    specimens: session.specimens,
  };

  const processing = createInitialProcessing(nowIso, warnings);
  processing.businessStatus = status;

  const history: SubmissionHistoryEvent[] = [
    createHistoryEvent({
      id: `${submissionId}_CREATED`,
      type: "Created",
      occurredAt: nowIso,
      actorType: "user",
      actorUid: submitter.uid,
      actorDisplayName: submitter.displayName || null,
      message: "Survey submission package created.",
      fromBusinessStatus: null,
      toBusinessStatus: "Draft",
      fromProcessingState: null,
      toProcessingState: "Pending",
    }),
    createHistoryEvent({
      id: `${submissionId}_QUEUED`,
      type: "Queued",
      occurredAt: nowIso,
      actorType: "user",
      actorUid: submitter.uid,
      actorDisplayName: submitter.displayName || null,
      message: "Survey added to the Firestore submission queue.",
      fromBusinessStatus: "Draft",
      toBusinessStatus: status,
      fromProcessingState: "Pending",
      toProcessingState: "Pending",
      details: {
        warningCount: warnings.length,
      },
    }),
  ];

  const submission: SurveySubmission = {
    schemaVersion: SUBMISSION_SCHEMA_VERSION,
    metadata,
    payload,
    processing,
    history,
  };

  return {
    ok: true,
    submission,
    warnings,
  };
}

function failure(
  code: SubmitSurveyFailureCode,
  message: string,
  options?: {
    errors?: SubmissionValidationIssue[];
    warnings?: SubmissionValidationIssue[];
    cause?: unknown;
  },
): SubmitSurveyResult {
  return {
    ok: false,
    code,
    message,
    errors: options?.errors ?? [],
    warnings: options?.warnings ?? [],
    ...(options?.cause !== undefined
      ? { cause: options.cause }
      : {}),
  };
}

function firestoreFailureCode(error: unknown): SubmitSurveyFailureCode {
  const code = cleanText(asRecord(error).code).toLowerCase();

  if (code.includes("permission-denied")) {
    return "permission-denied";
  }

  if (code.includes("already-exists")) {
    return "duplicate-submission";
  }

  return "firestore-write-failed";
}

function firestoreFailureMessage(
  code: SubmitSurveyFailureCode,
): string {
  if (code === "permission-denied") {
    return "Firestore denied permission to create this submission.";
  }

  if (code === "duplicate-submission") {
    return "This survey has already been submitted.";
  }

  return "The survey could not be written to the Firestore submission queue.";
}

function documentSubmission(
  data: DocumentData,
): SurveySubmission | null {
  if (
    !data ||
    typeof data !== "object" ||
    typeof data.schemaVersion !== "number" ||
    !data.metadata ||
    !data.processing
  ) {
    return null;
  }

  return data as SurveySubmission;
}

export async function submitSurvey(
  input: SubmitSurveyInput,
): Promise<SubmitSurveyResult> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    return failure(
      "authentication-required",
      "You must be signed in before submitting a survey.",
    );
  }

  if (currentUser.uid !== input.submitter.uid) {
    return failure(
      "authentication-required",
      "The signed-in account does not match the submitting user.",
    );
  }

  if (input.session.ownerUid !== input.submitter.uid) {
    return failure(
      "owner-mismatch",
      "This survey belongs to a different user and cannot be submitted from this account.",
    );
  }

  if (
    typeof navigator !== "undefined" &&
    !navigator.onLine
  ) {
    return failure(
      "offline",
      "An internet connection is required to add this survey to the Firestore queue.",
    );
  }

  const built = buildSurveySubmission({
    session: input.session,
    submitter: input.submitter,
    appVersion: input.appVersion,
    status: "Queued",
  });

  if (!built.ok) {
    return failure(
      "validation-failed",
      "The survey contains validation errors and was not submitted.",
      {
        errors: built.errors,
        warnings: built.warnings,
      },
    );
  }

  const { submission, warnings } = built;
  const submissionRef = doc(
    db,
    SUBMISSIONS_COLLECTION,
    submission.metadata.submissionId,
  );

  try {
    /*
     * Write first.
     *
     * Non-admin users may CREATE their own submission, but a preflight
     * getDoc() can be denied when the target document does not exist yet.
     * Writing first allows Firestore to evaluate the create rule directly.
     *
     * If this document already exists, setDoc() is evaluated as an UPDATE.
     * Non-admin users are intentionally not allowed to update queued
     * submissions, so an existing submission cannot be overwritten.
     */
    await setDoc(submissionRef, {
      ...submission,

      /**
       * Firestore-authoritative queue timestamps.
       *
       * ISO timestamps inside the typed submission remain useful offline and
       * for display. These server timestamps provide authoritative ordering
       * for backend processors and administrative queue views.
       */
      serverTimestamps: {
        createdAt: serverTimestamp(),
        queuedAt: serverTimestamp(),
      },
    });

    return {
      ok: true,
      submission,
      submissionId: submission.metadata.submissionId,
      warnings,
    };
  } catch (error) {
    const code = firestoreFailureCode(error);

    /*
     * A retry of an already-successful submission can be reported as
     * permission-denied because setDoc() is now an UPDATE. Once the document
     * exists, its owner can read it. If it is the same survey, treat that as
     * the original successful submission rather than an error.
     */
    if (code === "permission-denied") {
      try {
        const existingSnapshot = await getDoc(submissionRef);

        if (existingSnapshot.exists()) {
          const existing = documentSubmission(existingSnapshot.data());

          if (
            existing &&
            existing.metadata.ownerUid === input.submitter.uid &&
            existing.metadata.collectionId ===
              submission.metadata.collectionId
          ) {
            return {
              ok: true,
              submission: existing,
              submissionId: existing.metadata.submissionId,
              warnings:
                existing.processing?.validationIssues ?? warnings,
            };
          }

          if (existing) {
            return failure(
              "duplicate-submission",
              "A different submission already uses this submission ID.",
              { warnings },
            );
          }
        }
      } catch {
        // Preserve the original Firestore error below.
      }
    }

    return failure(code, firestoreFailureMessage(code), {
      warnings,
      cause: error,
    });
  }
}

export async function getSubmission(
  submissionId: string,
): Promise<SurveySubmission | null> {
  const trimmedId = submissionId.trim();

  if (!trimmedId) return null;

  const snapshot = await getDoc(
    doc(db, SUBMISSIONS_COLLECTION, trimmedId),
  );

  if (!snapshot.exists()) return null;

  return documentSubmission(snapshot.data());
}

export async function listMySubmissions(
  ownerUid: string,
  maximumResults = DEFAULT_LIST_LIMIT,
): Promise<SurveySubmission[]> {
  const trimmedUid = ownerUid.trim();

  if (!trimmedUid) return [];

  const submissionsQuery = query(
    collection(db, SUBMISSIONS_COLLECTION),
    where("metadata.ownerUid", "==", trimmedUid),
    limit(Math.max(1, maximumResults)),
  );

  const snapshot = await getDocs(submissionsQuery);

  return snapshot.docs
    .map((item) => documentSubmission(item.data()))
    .filter(
      (item): item is SurveySubmission => item !== null,
    )
    .sort((left, right) =>
      right.metadata.createdAt.localeCompare(
        left.metadata.createdAt,
      ),
    );
}
