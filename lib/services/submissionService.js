"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSubmissionId = createSubmissionId;
exports.getSubmissionDeviceMetadata = getSubmissionDeviceMetadata;
exports.validateSubmissionSession = validateSubmissionSession;
exports.buildSurveySubmission = buildSurveySubmission;
exports.submitSurvey = submitSurvey;
exports.getSubmission = getSubmission;
exports.listMySubmissions = listMySubmissions;
const firestore_1 = require("firebase/firestore");
const firebase_1 = require("../firebase");
const submission_1 = require("../types/submission");
const DEFAULT_APP_VERSION = "0.0.0";
const SUBMISSIONS_COLLECTION = "submissions";
const DEFAULT_LIST_LIMIT = 100;
function asRecord(value) {
    return value && typeof value === "object"
        ? value
        : {};
}
function cleanText(value) {
    return value === undefined || value === null
        ? ""
        : String(value).trim();
}
function collectionIdFromSession(session) {
    return cleanText(session.collectionId);
}
function makeSubmitterCode(displayName, email, uid) {
    const emailPrefix = email.split("@")[0] ?? "";
    const source = displayName || emailPrefix || uid.slice(0, 8);
    const words = source
        .trim()
        .split(/[\s._-]+/)
        .filter(Boolean);
    let code = "";
    if (words.length >= 2) {
        code = `${words[0][0] ?? ""}${words.at(-1) ?? ""}`;
    }
    else {
        code = words[0] ?? "";
    }
    return (code
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase()
        .slice(0, 12) || "USER");
}
function timestampCode(date) {
    const pad = (value) => String(value).padStart(2, "0");
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
function stableCode(source, length = 4) {
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
function validDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
function submissionDateFromSession(session) {
    return (validDate(session.createdAt) ??
        validDate(session.updatedAt) ??
        new Date());
}
function createSubmissionId(submitter, date = new Date(), stableKey) {
    const submitterCode = makeSubmitterCode(submitter.displayName, submitter.email, submitter.uid);
    const suffix = stableCode(stableKey ??
        `${submitter.uid}|${date.toISOString()}`);
    return `SUB_${submitterCode}_${timestampCode(date)}_${suffix}`;
}
function getSubmissionDeviceMetadata() {
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
function validateSubmissionSession(session) {
    const issues = [];
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
    }
    else if (session.specimens.length === 0) {
        issues.push({
            code: "no-specimens",
            message: "No specimen records are present. Confirm this is an intentional no-fish survey.",
            severity: "warning",
            field: "specimens",
        });
    }
    if (!collectionIdFromSession(session)) {
        issues.push({
            code: "missing-collection-id",
            message: "The survey does not contain a valid Collection ID.",
            severity: "error",
            field: "survey.CollectionID",
        });
    }
    return issues;
}
function createHistoryEvent(input) {
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
function createInitialProcessing(queuedAt, warnings) {
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
function buildSurveySubmission(input) {
    const { session, submitter } = input;
    const issues = validateSubmissionSession(session);
    const errors = issues.filter((issue) => issue.severity === "error");
    const warnings = issues.filter((issue) => issue.severity === "warning");
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
            message: "The submitting user's email address is not available.",
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
    const status = input.status ?? "Queued";
    const submissionId = createSubmissionId(submitter, submissionDateFromSession(session), session.id);
    const metadata = {
        submissionId,
        collectionId: collectionIdFromSession(session),
        submittedByUid: submitter.uid.trim(),
        submittedByEmail: submitter.email.trim(),
        submittedByDisplayName: submitter.displayName.trim(),
        ownerUid: session.ownerUid.trim(),
        appVersion: input.appVersion ?? DEFAULT_APP_VERSION,
        schemaVersion: submission_1.SUBMISSION_SCHEMA_VERSION,
        specimenFormType: session.specimenFormType ?? null,
        createdAt: nowIso,
        device: getSubmissionDeviceMetadata(),
    };
    const payload = {
        location: session.location,
        survey: session.survey,
        specimens: session.specimens,
    };
    const processing = createInitialProcessing(nowIso, warnings);
    processing.businessStatus = status;
    const history = [
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
    const submission = {
        schemaVersion: submission_1.SUBMISSION_SCHEMA_VERSION,
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
function failure(code, message, options) {
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
function firestoreFailureCode(error) {
    const code = cleanText(asRecord(error).code).toLowerCase();
    if (code.includes("permission-denied")) {
        return "permission-denied";
    }
    if (code.includes("already-exists")) {
        return "duplicate-submission";
    }
    return "firestore-write-failed";
}
function firestoreFailureMessage(code) {
    if (code === "permission-denied") {
        return "Firestore denied permission to create this submission.";
    }
    if (code === "duplicate-submission") {
        return "This survey has already been submitted.";
    }
    return "The survey could not be written to the Firestore submission queue.";
}
function documentSubmission(data) {
    if (!data ||
        typeof data !== "object" ||
        typeof data.schemaVersion !== "number" ||
        !data.metadata ||
        !data.processing) {
        return null;
    }
    return data;
}
async function submitSurvey(input) {
    const currentUser = firebase_1.auth.currentUser;
    if (!currentUser) {
        return failure("authentication-required", "You must be signed in before submitting a survey.");
    }
    if (currentUser.uid !== input.submitter.uid) {
        return failure("authentication-required", "The signed-in account does not match the submitting user.");
    }
    if (input.session.ownerUid !== input.submitter.uid) {
        return failure("owner-mismatch", "This survey belongs to a different user and cannot be submitted from this account.");
    }
    if (typeof navigator !== "undefined" &&
        !navigator.onLine) {
        return failure("offline", "An internet connection is required to add this survey to the Firestore queue.");
    }
    const built = buildSurveySubmission({
        session: input.session,
        submitter: input.submitter,
        appVersion: input.appVersion,
        status: "Queued",
    });
    if (!built.ok) {
        return failure("validation-failed", "The survey contains validation errors and was not submitted.", {
            errors: built.errors,
            warnings: built.warnings,
        });
    }
    const { submission, warnings } = built;
    const submissionRef = (0, firestore_1.doc)(firebase_1.db, SUBMISSIONS_COLLECTION, submission.metadata.submissionId);
    try {
        const existingSnapshot = await (0, firestore_1.getDoc)(submissionRef);
        if (existingSnapshot.exists()) {
            const existing = documentSubmission(existingSnapshot.data());
            if (existing &&
                existing.metadata.ownerUid === input.submitter.uid &&
                existing.metadata.collectionId ===
                    submission.metadata.collectionId) {
                return {
                    ok: true,
                    submission: existing,
                    submissionId: existing.metadata.submissionId,
                    warnings: existing.processing?.validationIssues ?? warnings,
                };
            }
            return failure("duplicate-submission", "A different submission already uses this submission ID.", { warnings });
        }
        await (0, firestore_1.setDoc)(submissionRef, {
            ...submission,
            /**
             * Firestore-authoritative queue timestamps.
             *
             * ISO timestamps inside the typed submission remain useful offline and
             * for display. These server timestamps provide authoritative ordering
             * for backend processors and administrative queue views.
             */
            serverTimestamps: {
                createdAt: (0, firestore_1.serverTimestamp)(),
                queuedAt: (0, firestore_1.serverTimestamp)(),
            },
        });
        return {
            ok: true,
            submission,
            submissionId: submission.metadata.submissionId,
            warnings,
        };
    }
    catch (error) {
        const code = firestoreFailureCode(error);
        return failure(code, firestoreFailureMessage(code), {
            warnings,
            cause: error,
        });
    }
}
async function getSubmission(submissionId) {
    const trimmedId = submissionId.trim();
    if (!trimmedId)
        return null;
    const snapshot = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, SUBMISSIONS_COLLECTION, trimmedId));
    if (!snapshot.exists())
        return null;
    return documentSubmission(snapshot.data());
}
async function listMySubmissions(ownerUid, maximumResults = DEFAULT_LIST_LIMIT) {
    const trimmedUid = ownerUid.trim();
    if (!trimmedUid)
        return [];
    const submissionsQuery = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, SUBMISSIONS_COLLECTION), (0, firestore_1.where)("metadata.ownerUid", "==", trimmedUid), (0, firestore_1.limit)(Math.max(1, maximumResults)));
    const snapshot = await (0, firestore_1.getDocs)(submissionsQuery);
    return snapshot.docs
        .map((item) => documentSubmission(item.data()))
        .filter((item) => item !== null)
        .sort((left, right) => right.metadata.createdAt.localeCompare(left.metadata.createdAt));
}
//# sourceMappingURL=submissionService.js.map