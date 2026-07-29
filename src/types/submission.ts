import type {
  SpecimenFormType,
  SurveySession,
} from "./surveySession";

export const SUBMISSION_SCHEMA_VERSION = 1 as const;

export type SubmissionSchemaVersion =
  typeof SUBMISSION_SCHEMA_VERSION;

/**
 * Business lifecycle for a submitted survey.
 *
 * This describes the NAIADD submission lifecycle and DBA workflow.
 */
export type SubmissionStatus =
  | "Draft"
  | "Queued"
  | "Approved"
  | "Archived"
  | "Merged"
  | "Rejected";

/**
 * Technical processing state for the submission pipeline.
 *
 * This is intentionally separate from SubmissionStatus so a submission can,
 * for example, have a business status of "Queued" while a processor is
 * temporarily in a "Failed" state and awaiting retry.
 */
export type SubmissionProcessingState =
  | "Pending"
  | "Running"
  | "Completed"
  | "Failed"
  | "Cancelled";

export type SubmissionValidationSeverity =
  | "error"
  | "warning";

export type SubmissionValidationIssue = {
  code: string;
  message: string;
  severity: SubmissionValidationSeverity;
  field?: string;
};

export type SubmissionSubmitter = {
  uid: string;
  email: string;
  displayName: string;
};

export type SubmissionDeviceMetadata = {
  userAgent: string;
  platform: string;
  language: string;
  online: boolean;
};

export type SubmissionMetadata = {
  submissionId: string;
  collectionId: string;

  submittedByUid: string;
  submittedByEmail: string;
  submittedByDisplayName: string;
  ownerUid: string;

  appVersion: string;
  schemaVersion: SubmissionSchemaVersion;
  specimenFormType: SpecimenFormType | null;

  createdAt: string;
  device: SubmissionDeviceMetadata;

  /**
   * Transitional compatibility field.
   *
   * The current submission service writes status into metadata. The new
   * Firestore-backed service will treat processing.businessStatus as the
   * authoritative value. Keeping this optional allows the type file to be
   * introduced without breaking the current build.
   */
  status?: SubmissionStatus;

  /**
   * Transitional compatibility timestamps.
   *
   * These remain optional while the submission pipeline is migrated. The new
   * service will store lifecycle timestamps in processing.
   */
  queuedAt?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  archivedAt?: string | null;
  mergedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  driveFileId?: string | null;
};

export type SubmissionPayload = {
  location: SurveySession["location"];
  survey: SurveySession["survey"];
  specimens: SurveySession["specimens"];
};

export type SubmissionProcessing = {
  businessStatus: SubmissionStatus;
  processingState: SubmissionProcessingState;

  queuedAt: string | null;
  processingStartedAt: string | null;
  processingCompletedAt: string | null;
  approvedAt?: string | null;
  archivedAt: string | null;
  mergedAt: string | null;
  rejectedAt: string | null;

  rejectionReason: string | null;

  driveFileId: string | null;
  driveFileName: string | null;
  driveWebViewUrl: string | null;

  approvedByUid?: string | null;
  approvedByDisplayName?: string | null;

  mergedByUid: string | null;
  mergedByDisplayName: string | null;

  retryCount: number;
  lastAttemptAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;

  validationIssues: SubmissionValidationIssue[];
};

export type SubmissionHistoryEventType =
  | "Created"
  | "Queued"
  | "Approved"
  | "ProcessingStarted"
  | "ProcessingCompleted"
  | "ProcessingFailed"
  | "Archived"
  | "Merged"
  | "Rejected"
  | "Cancelled"
  | "Retried";

export type SubmissionHistoryActorType =
  | "user"
  | "system"
  | "processor"
  | "dba"
  | "admin";

export type SubmissionHistoryEvent = {
  id: string;
  type: SubmissionHistoryEventType;
  occurredAt: string;

  actorType: SubmissionHistoryActorType;
  actorUid: string | null;
  actorDisplayName: string | null;

  message: string;
  fromBusinessStatus: SubmissionStatus | null;
  toBusinessStatus: SubmissionStatus | null;
  fromProcessingState: SubmissionProcessingState | null;
  toProcessingState: SubmissionProcessingState | null;

  details?: Record<string, unknown>;
};

export type SurveySubmission = {
  schemaVersion: SubmissionSchemaVersion;
  metadata: SubmissionMetadata;

  /**
   * Immutable biological payload.
   */
  payload: SubmissionPayload;

  /**
   * Mutable workflow and processor state.
   */
  processing: SubmissionProcessing;

  /**
   * Append-only audit trail.
   */
  history: SubmissionHistoryEvent[];

};

export type SubmissionBuildInput = {
  session: SurveySession;
  submitter: SubmissionSubmitter;
  appVersion?: string;
  status?: SubmissionStatus;
  now?: Date;
};

export type SubmissionBuildResult =
  | {
      ok: true;
      submission: SurveySubmission;
      warnings: SubmissionValidationIssue[];
    }
  | {
      ok: false;
      errors: SubmissionValidationIssue[];
      warnings: SubmissionValidationIssue[];
    };

export type SubmitSurveyInput = {
  session: SurveySession;
  submitter: SubmissionSubmitter;
  appVersion?: string;
};

export type SubmitSurveySuccess = {
  ok: true;
  submission: SurveySubmission;
  submissionId: string;
  warnings: SubmissionValidationIssue[];
};

export type SubmitSurveyFailureCode =
  | "validation-failed"
  | "authentication-required"
  | "owner-mismatch"
  | "offline"
  | "permission-denied"
  | "duplicate-submission"
  | "firestore-write-failed"
  | "unknown";

export type SubmitSurveyFailure = {
  ok: false;
  code: SubmitSurveyFailureCode;
  message: string;
  errors: SubmissionValidationIssue[];
  warnings: SubmissionValidationIssue[];
  cause?: unknown;
};

export type SubmitSurveyResult =
  | SubmitSurveySuccess
  | SubmitSurveyFailure;
