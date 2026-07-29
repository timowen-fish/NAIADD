"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submissionBusinessStatus = submissionBusinessStatus;
exports.submissionPayload = submissionPayload;
exports.listSubmissionQueue = listSubmissionQueue;
exports.approveSubmission = approveSubmission;
exports.rejectSubmission = rejectSubmission;
exports.archiveSubmission = archiveSubmission;
exports.retrySubmission = retrySubmission;
const firestore_1 = require("firebase/firestore");
const firebase_1 = require("../firebase");
const SUBMISSIONS_COLLECTION = "submissions";
const DEFAULT_QUEUE_LIMIT = 500;
function isSubmissionStatus(value) {
    return (value === "Draft" ||
        value === "Queued" ||
        value === "Approved" ||
        value === "Archived" ||
        value === "Merged" ||
        value === "Rejected");
}
function normalizeSubmission(documentId, data) {
    if (!data ||
        typeof data !== "object" ||
        typeof data.schemaVersion !== "number" ||
        !data.metadata ||
        typeof data.metadata !== "object") {
        return null;
    }
    const submission = data;
    if (!submission.metadata.submissionId) {
        submission.metadata.submissionId = documentId;
    }
    return {
        documentId,
        submission,
    };
}
function historyEventId(now = new Date()) {
    return `HIST_${now.getTime()}_${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`;
}
function actorType(profile) {
    return profile.role === "admin" ? "admin" : "dba";
}
function processingDefaults(submission) {
    const current = submission.processing;
    const status = submissionBusinessStatus(submission);
    return {
        businessStatus: status,
        processingState: current?.processingState ?? "Pending",
        queuedAt: current?.queuedAt ??
            submission.metadata.queuedAt ??
            submission.metadata.createdAt,
        processingStartedAt: current?.processingStartedAt ?? null,
        processingCompletedAt: current?.processingCompletedAt ?? null,
        approvedAt: current?.approvedAt ?? null,
        archivedAt: current?.archivedAt ?? submission.metadata.archivedAt ?? null,
        mergedAt: current?.mergedAt ?? submission.metadata.mergedAt ?? null,
        rejectedAt: current?.rejectedAt ?? submission.metadata.rejectedAt ?? null,
        rejectionReason: current?.rejectionReason ??
            submission.metadata.rejectionReason ??
            null,
        driveFileId: current?.driveFileId ?? submission.metadata.driveFileId ?? null,
        driveFileName: current?.driveFileName ?? null,
        driveWebViewUrl: current?.driveWebViewUrl ?? null,
        approvedByUid: current?.approvedByUid ?? null,
        approvedByDisplayName: current?.approvedByDisplayName ?? null,
        mergedByUid: current?.mergedByUid ?? null,
        mergedByDisplayName: current?.mergedByDisplayName ?? null,
        retryCount: current?.retryCount ?? 0,
        lastAttemptAt: current?.lastAttemptAt ?? null,
        lastErrorCode: current?.lastErrorCode ?? null,
        lastErrorMessage: current?.lastErrorMessage ?? null,
        validationIssues: current?.validationIssues ?? [],
    };
}
function appendHistoryEvent(submission, type, profile, message, fromBusinessStatus, toBusinessStatus, fromProcessingState, toProcessingState, details) {
    const now = new Date();
    const event = {
        id: historyEventId(now),
        type,
        occurredAt: now.toISOString(),
        actorType: actorType(profile),
        actorUid: profile.uid,
        actorDisplayName: profile.displayName || profile.email || profile.uid,
        message,
        fromBusinessStatus,
        toBusinessStatus,
        fromProcessingState,
        toProcessingState,
        ...(details ? { details } : {}),
    };
    return [...(submission.history ?? []), event];
}
async function updateSubmissionStatus(documentId, nextStatus, profile, eventType, message, options = {}) {
    const submissionRef = (0, firestore_1.doc)(firebase_1.db, SUBMISSIONS_COLLECTION, documentId);
    await (0, firestore_1.runTransaction)(firebase_1.db, async (transaction) => {
        const snapshot = await transaction.get(submissionRef);
        if (!snapshot.exists()) {
            throw new Error(`Submission ${documentId} no longer exists.`);
        }
        const submission = snapshot.data();
        const currentStatus = submissionBusinessStatus(submission);
        const processing = processingDefaults(submission);
        const now = new Date().toISOString();
        if (currentStatus === "Merged") {
            throw new Error("Merged submissions cannot be changed.");
        }
        if (nextStatus === "Approved" && currentStatus !== "Queued") {
            throw new Error(`Only Queued submissions can be approved. This submission is ${currentStatus}.`);
        }
        if (nextStatus === "Rejected" &&
            currentStatus !== "Queued" &&
            currentStatus !== "Approved") {
            throw new Error(`Only Queued or Approved submissions can be rejected. This submission is ${currentStatus}.`);
        }
        const nextProcessing = {
            ...processing,
            businessStatus: nextStatus,
        };
        if (nextStatus === "Approved") {
            nextProcessing.approvedAt = now;
            nextProcessing.approvedByUid = profile.uid;
            nextProcessing.approvedByDisplayName =
                profile.displayName || profile.email || profile.uid;
            nextProcessing.rejectedAt = null;
            nextProcessing.rejectionReason = null;
        }
        if (nextStatus === "Rejected") {
            nextProcessing.rejectedAt = now;
            nextProcessing.rejectionReason =
                options.reason?.trim() || "Rejected by reviewer.";
        }
        if (nextStatus === "Archived") {
            nextProcessing.archivedAt = now;
        }
        const history = appendHistoryEvent(submission, eventType, profile, message, currentStatus, nextStatus, processing.processingState, processing.processingState, options.reason ? { reason: options.reason } : undefined);
        transaction.update(submissionRef, {
            metadata: {
                ...submission.metadata,
                status: nextStatus,
                approvedAt: nextStatus === "Approved"
                    ? now
                    : submission.metadata.approvedAt ?? null,
                archivedAt: nextStatus === "Archived"
                    ? now
                    : submission.metadata.archivedAt ?? null,
                rejectedAt: nextStatus === "Rejected"
                    ? now
                    : submission.metadata.rejectedAt ?? null,
                rejectionReason: nextStatus === "Rejected"
                    ? nextProcessing.rejectionReason
                    : submission.metadata.rejectionReason ?? null,
            },
            processing: nextProcessing,
            history,
        });
    });
}
function submissionBusinessStatus(submission) {
    const processingStatus = submission.processing?.businessStatus;
    if (isSubmissionStatus(processingStatus)) {
        return processingStatus;
    }
    if (isSubmissionStatus(submission.metadata.status)) {
        return submission.metadata.status;
    }
    return "Queued";
}
function submissionPayload(submission) {
    return submission.payload ?? submission.data ?? {
        location: null,
        survey: null,
        specimens: [],
    };
}
async function listSubmissionQueue(maximumResults = DEFAULT_QUEUE_LIMIT) {
    const queueQuery = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, SUBMISSIONS_COLLECTION), (0, firestore_1.limit)(Math.max(1, maximumResults)));
    const snapshot = await (0, firestore_1.getDocs)(queueQuery);
    return snapshot.docs
        .map((document) => normalizeSubmission(document.id, document.data()))
        .filter((item) => item !== null)
        .sort((left, right) => right.submission.metadata.createdAt.localeCompare(left.submission.metadata.createdAt));
}
async function approveSubmission(documentId, profile) {
    await updateSubmissionStatus(documentId, "Approved", profile, "Approved", "Submission approved for publication.");
}
async function rejectSubmission(documentId, reason, profile) {
    const cleanedReason = reason.trim();
    if (!cleanedReason) {
        throw new Error("Enter a rejection reason.");
    }
    await updateSubmissionStatus(documentId, "Rejected", profile, "Rejected", `Submission rejected: ${cleanedReason}`, { reason: cleanedReason });
}
async function archiveSubmission(documentId, profile) {
    await updateSubmissionStatus(documentId, "Archived", profile, "Archived", "Submission archived.");
}
async function retrySubmission(documentId, profile) {
    const submissionRef = (0, firestore_1.doc)(firebase_1.db, SUBMISSIONS_COLLECTION, documentId);
    await (0, firestore_1.runTransaction)(firebase_1.db, async (transaction) => {
        const snapshot = await transaction.get(submissionRef);
        if (!snapshot.exists()) {
            throw new Error(`Submission ${documentId} no longer exists.`);
        }
        const submission = snapshot.data();
        const processing = processingDefaults(submission);
        if (processing.processingState !== "Failed") {
            throw new Error("Only submissions in a Failed processing state can be retried.");
        }
        const now = new Date().toISOString();
        const nextProcessing = {
            ...processing,
            processingState: "Pending",
            retryCount: processing.retryCount + 1,
            lastAttemptAt: now,
            lastErrorCode: null,
            lastErrorMessage: null,
        };
        const history = appendHistoryEvent(submission, "Retried", profile, "Submission processing retry requested.", processing.businessStatus, processing.businessStatus, processing.processingState, "Pending", { retryCount: nextProcessing.retryCount });
        transaction.update(submissionRef, {
            processing: nextProcessing,
            history,
        });
    });
}
//# sourceMappingURL=submissionQueueService.js.map