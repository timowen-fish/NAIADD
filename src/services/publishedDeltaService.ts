import {
  collection,
  doc,
  getDoc,
  runTransaction,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import type { UserProfile } from "../types/user";
import type { SurveySubmission } from "../types/submission";
import {
  submissionBusinessStatus,
  type SubmissionQueueRecord,
} from "./submissionQueueService";
import { buildMergePacket } from "./mergePacketService";

const SUBMISSIONS_COLLECTION = "submissions";
const PUBLISHED_DELTAS_COLLECTION = "publishedDeltas";
const DELTA_INDEX_COLLECTION = "deltaIndex";
const DELTA_INDEX_DOCUMENT = "current";

const DELTA_SCHEMA_VERSION = 1;
const ROWS_PER_CHUNK = 100;
const MAX_SUBMISSIONS_PER_PUBLISH = 400;

type AnyRecord = Record<string, unknown>;

type MergePacketLike = {
  summary?: {
    submissionCount?: number;
    rowCount?: number;
  };
  rowsToAppend?: AnyRecord[];
  rows?: AnyRecord[];
  flattenedRows?: AnyRecord[];
  audit?: unknown[];
};

export type PublishedDeltaStatus =
  | "Publishing"
  | "Published"
  | "Failed"
  | "Archived";

export type PublishedDeltaMetadata = {
  deltaId: string;
  schemaVersion: number;
  status: PublishedDeltaStatus;
  createdAt: string;
  createdByUid: string;
  createdByName: string;
  createdByEmail: string;
  submissionCount: number;
  rowCount: number;
  rowChunkCount: number;
  submissionIds: string[];
  firestoreDocumentIds: string[];
  collectionIds: string[];
  siteIds: string[];
  checksum: string;
  errorMessage?: string;
  publishedAt?: string;
};

export type PublishedDeltaIndexEntry = {
  deltaId: string;
  publishedAt: string;
  createdByUid: string;
  createdByName: string;
  submissionCount: number;
  rowCount: number;
  checksum: string;
};

export type PublishedDeltaIndex = {
  schemaVersion: number;
  updatedAt: string;
  activeDeltaIds: string[];
  activeDeltas: PublishedDeltaIndexEntry[];
};

export type PublishSelectedSubmissionsResult = {
  deltaId: string;
  submissionCount: number;
  rowCount: number;
  collectionCount: number;
  siteCount: number;
  checksum: string;
  publishedAt: string;
};

type StagedDelta = {
  metadata: PublishedDeltaMetadata;
  rows: AnyRecord[];
  submissions: Array<{
    documentId: string;
    submission: SurveySubmission;
  }>;
};

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object"
    ? (value as AnyRecord)
    : {};
}

function asNonEmptyString(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function firstString(
  record: AnyRecord,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const value = asNonEmptyString(record[key]);
    if (value) return value;
  }

  return "";
}

function uniqueStrings(values: Iterable<string>): string[] {
  return Array.from(
    new Set(Array.from(values).map((value) => value.trim()).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));
}

function chunkArray<T>(items: readonly T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function timestampForId(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "_",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function createDeltaId(date = new Date()): string {
  return `DELTA_${timestampForId(date)}_${randomSuffix()}`;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  const record = value as AnyRecord;
  const keys = Object.keys(record).sort();

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "This browser does not support the cryptographic checksum required to publish a delta.",
    );
  }

  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function mergePacketRows(packet: MergePacketLike): AnyRecord[] {
  const candidate =
    packet.rowsToAppend ??
    packet.flattenedRows ??
    packet.rows ??
    [];

  if (!Array.isArray(candidate)) {
    throw new Error(
      "The merge packet service did not return a valid flattened row array.",
    );
  }

  return candidate.map(asRecord);
}

function validateSelectedRecords(
  records: readonly SubmissionQueueRecord[],
): void {
  if (records.length === 0) {
    throw new Error("Select at least one approved submission to publish.");
  }

  if (records.length > MAX_SUBMISSIONS_PER_PUBLISH) {
    throw new Error(
      `Publish no more than ${MAX_SUBMISSIONS_PER_PUBLISH} submissions at a time.`,
    );
  }

  const errors: string[] = [];
  const documentIds = new Set<string>();
  const submissionIds = new Set<string>();
  const collectionIds = new Set<string>();

  records.forEach((record, index) => {
    const label = `Selection ${index + 1}`;
    const metadata = record.submission.metadata;
    const status = submissionBusinessStatus(record.submission);

    if (!record.documentId) {
      errors.push(`${label}: Firestore document ID is missing.`);
    } else if (documentIds.has(record.documentId)) {
      errors.push(
        `${label}: duplicate Firestore document ID ${record.documentId}.`,
      );
    } else {
      documentIds.add(record.documentId);
    }

    if (status !== "Approved") {
      errors.push(
        `${label}: submission ${metadata.submissionId || record.documentId} is ${status}, not Approved.`,
      );
    }

    const submissionId = asNonEmptyString(metadata.submissionId);
    if (!submissionId) {
      errors.push(`${label}: Submission ID is missing.`);
    } else if (submissionIds.has(submissionId)) {
      errors.push(`${label}: duplicate Submission ID ${submissionId}.`);
    } else {
      submissionIds.add(submissionId);
    }

    const collectionId = asNonEmptyString(metadata.collectionId);
    if (!collectionId) {
      errors.push(`${label}: Collection ID is missing.`);
    } else if (collectionIds.has(collectionId)) {
      errors.push(`${label}: duplicate Collection ID ${collectionId}.`);
    } else {
      collectionIds.add(collectionId);
    }

    const payload = record.submission.payload;
    const payloadRecord = asRecord(payload);

    if (!payload || typeof payload !== "object") {
      errors.push(`${label}: submission payload is missing.`);
      return;
    }

    if (!payloadRecord.location || typeof payloadRecord.location !== "object") {
      errors.push(`${label}: location data is missing.`);
    }

    if (!payloadRecord.survey || typeof payloadRecord.survey !== "object") {
      errors.push(`${label}: survey data is missing.`);
    }

    if (!Array.isArray(payloadRecord.specimens)) {
      errors.push(`${label}: specimen rows are missing.`);
    }
  });

  if (errors.length > 0) {
    throw new Error(
      `The selected submissions cannot be published:\n${errors.join("\n")}`,
    );
  }
}

function collectSiteIds(rows: readonly AnyRecord[]): string[] {
  return uniqueStrings(
    rows.map((row) =>
      firstString(row, [
        "SiteID",
        "siteID",
        "siteId",
        "LocationID",
        "locationId",
      ]),
    ),
  );
}

async function buildStagedDelta(
  records: readonly SubmissionQueueRecord[],
  profile: UserProfile,
): Promise<StagedDelta> {
  validateSelectedRecords(records);

  const now = new Date();
  const createdAt = now.toISOString();
  const deltaId = createDeltaId(now);

  const packet = buildMergePacket({
    records: [...records],
    generatedBy: {
      uid: profile.uid,
      displayName: profile.displayName || "",
      email: profile.email || "",
    },
  }) as MergePacketLike;

  const rows = mergePacketRows(packet);

  if (rows.length === 0) {
    throw new Error(
      "The selected submissions produced zero flattened rows. Nothing was published.",
    );
  }

  const firestoreDocumentIds = uniqueStrings(
    records.map((record) => record.documentId),
  );
  const submissionIds = uniqueStrings(
    records.map((record) =>
      asNonEmptyString(record.submission.metadata.submissionId),
    ),
  );
  const collectionIds = uniqueStrings(
    records.map((record) =>
      asNonEmptyString(record.submission.metadata.collectionId),
    ),
  );
  const siteIds = collectSiteIds(rows);

  const checksumSource = {
    deltaId,
    schemaVersion: DELTA_SCHEMA_VERSION,
    firestoreDocumentIds,
    submissionIds,
    collectionIds,
    rows,
  };

  const checksum = await sha256Hex(stableSerialize(checksumSource));
  const rowChunks = chunkArray(rows, ROWS_PER_CHUNK);

  const metadata: PublishedDeltaMetadata = {
    deltaId,
    schemaVersion: DELTA_SCHEMA_VERSION,
    status: "Publishing",
    createdAt,
    createdByUid: profile.uid,
    createdByName: profile.displayName || "",
    createdByEmail: profile.email || "",
    submissionCount: records.length,
    rowCount: rows.length,
    rowChunkCount: rowChunks.length,
    submissionIds,
    firestoreDocumentIds,
    collectionIds,
    siteIds,
    checksum,
  };

  return {
    metadata,
    rows,
    submissions: records.map((record) => ({
      documentId: record.documentId,
      submission: record.submission,
    })),
  };
}

async function stageDelta(delta: StagedDelta): Promise<void> {
  const deltaRef = doc(
    db,
    PUBLISHED_DELTAS_COLLECTION,
    delta.metadata.deltaId,
  );

  await setDoc(deltaRef, delta.metadata);

  const rowChunks = chunkArray(delta.rows, ROWS_PER_CHUNK);

  for (let start = 0; start < rowChunks.length; start += 400) {
    const batch = writeBatch(db);
    const batchChunks = rowChunks.slice(start, start + 400);

    batchChunks.forEach((rows, localIndex) => {
      const chunkIndex = start + localIndex;
      const chunkId = String(chunkIndex + 1).padStart(6, "0");
      const chunkRef = doc(
        collection(deltaRef, "rowChunks"),
        chunkId,
      );

      batch.set(chunkRef, {
        deltaId: delta.metadata.deltaId,
        chunkIndex,
        rowStart: chunkIndex * ROWS_PER_CHUNK,
        rowCount: rows.length,
        rows,
      });
    });

    await batch.commit();
  }

  for (let start = 0; start < delta.submissions.length; start += 400) {
    const batch = writeBatch(db);
    const batchSubmissions = delta.submissions.slice(start, start + 400);

    batchSubmissions.forEach(({ documentId, submission }) => {
      const submissionCopyRef = doc(
        collection(deltaRef, "sourceSubmissions"),
        documentId,
      );

      batch.set(submissionCopyRef, {
        deltaId: delta.metadata.deltaId,
        sourceDocumentId: documentId,
        submission,
      });
    });

    await batch.commit();
  }
}

function normalizeDeltaIndex(value: unknown): PublishedDeltaIndex {
  const record = asRecord(value);

  const activeDeltas = Array.isArray(record.activeDeltas)
    ? record.activeDeltas
        .map(asRecord)
        .map((entry) => ({
          deltaId: asNonEmptyString(entry.deltaId),
          publishedAt: asNonEmptyString(entry.publishedAt),
          createdByUid: asNonEmptyString(entry.createdByUid),
          createdByName: asNonEmptyString(entry.createdByName),
          submissionCount: Number(entry.submissionCount) || 0,
          rowCount: Number(entry.rowCount) || 0,
          checksum: asNonEmptyString(entry.checksum),
        }))
        .filter((entry) => entry.deltaId)
    : [];

  const activeDeltaIds = uniqueStrings([
    ...(Array.isArray(record.activeDeltaIds)
      ? record.activeDeltaIds.map(asNonEmptyString)
      : []),
    ...activeDeltas.map((entry) => entry.deltaId),
  ]);

  return {
    schemaVersion:
      Number(record.schemaVersion) || DELTA_SCHEMA_VERSION,
    updatedAt: asNonEmptyString(record.updatedAt),
    activeDeltaIds,
    activeDeltas,
  };
}

async function finalizeDelta(delta: StagedDelta): Promise<string> {
  const publishedAt = new Date().toISOString();

  const deltaRef = doc(
    db,
    PUBLISHED_DELTAS_COLLECTION,
    delta.metadata.deltaId,
  );
  const indexRef = doc(
    db,
    DELTA_INDEX_COLLECTION,
    DELTA_INDEX_DOCUMENT,
  );

  await runTransaction(db, async (transaction) => {
    const deltaSnapshot = await transaction.get(deltaRef);

    if (!deltaSnapshot.exists()) {
      throw new Error(
        `Staged delta ${delta.metadata.deltaId} could not be found.`,
      );
    }

    const indexSnapshot = await transaction.get(indexRef);
    const currentIndex = normalizeDeltaIndex(
      indexSnapshot.exists() ? indexSnapshot.data() : null,
    );

    if (
      currentIndex.activeDeltaIds.includes(delta.metadata.deltaId)
    ) {
      throw new Error(
        `Delta ${delta.metadata.deltaId} is already active in the dataset index.`,
      );
    }

    for (const source of delta.submissions) {
      const sourceRef = doc(
        db,
        SUBMISSIONS_COLLECTION,
        source.documentId,
      );
      const sourceSnapshot = await transaction.get(sourceRef);

      if (!sourceSnapshot.exists()) {
        throw new Error(
          `Submission ${source.documentId} no longer exists.`,
        );
      }

      const currentSubmission =
        sourceSnapshot.data() as SurveySubmission;
      const currentStatus =
        submissionBusinessStatus(currentSubmission);

      if (currentStatus !== "Approved") {
        throw new Error(
          `Submission ${source.documentId} changed to ${currentStatus} before publication completed.`,
        );
      }
    }

    const indexEntry: PublishedDeltaIndexEntry = {
      deltaId: delta.metadata.deltaId,
      publishedAt,
      createdByUid: delta.metadata.createdByUid,
      createdByName: delta.metadata.createdByName,
      submissionCount: delta.metadata.submissionCount,
      rowCount: delta.metadata.rowCount,
      checksum: delta.metadata.checksum,
    };

    transaction.set(
      deltaRef,
      {
        status: "Published",
        publishedAt,
        errorMessage: null,
      },
      { merge: true },
    );

    transaction.set(
      indexRef,
      {
        schemaVersion: DELTA_SCHEMA_VERSION,
        updatedAt: publishedAt,
        activeDeltaIds: [
          ...currentIndex.activeDeltaIds,
          delta.metadata.deltaId,
        ],
        activeDeltas: [
          ...currentIndex.activeDeltas,
          indexEntry,
        ],
      } satisfies PublishedDeltaIndex,
    );

    delta.submissions.forEach((source) => {
      const sourceRef = doc(
        db,
        SUBMISSIONS_COLLECTION,
        source.documentId,
      );

      transaction.update(sourceRef, {
        "metadata.status": "Merged",
        "processing.businessStatus": "Merged",
        "processing.mergedAt": publishedAt,
        "processing.mergedByUid": delta.metadata.createdByUid,
        "processing.mergedByName": delta.metadata.createdByName,
        "processing.mergedByEmail": delta.metadata.createdByEmail,
        "processing.deltaId": delta.metadata.deltaId,
      });
    });
  });

  return publishedAt;
}

async function markDeltaFailed(
  deltaId: string,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof Error ? error.message : String(error);

  try {
    await setDoc(
      doc(db, PUBLISHED_DELTAS_COLLECTION, deltaId),
      {
        status: "Failed",
        errorMessage: message,
      },
      { merge: true },
    );
  } catch {
    // Preserve the original publication error.
  }
}

export async function publishSelectedSubmissions(
  records: readonly SubmissionQueueRecord[],
  profile: UserProfile,
): Promise<PublishSelectedSubmissionsResult> {
  const delta = await buildStagedDelta(records, profile);

  try {
    await stageDelta(delta);
    const publishedAt = await finalizeDelta(delta);

    return {
      deltaId: delta.metadata.deltaId,
      submissionCount: delta.metadata.submissionCount,
      rowCount: delta.metadata.rowCount,
      collectionCount: delta.metadata.collectionIds.length,
      siteCount: delta.metadata.siteIds.length,
      checksum: delta.metadata.checksum,
      publishedAt,
    };
  } catch (error) {
    await markDeltaFailed(delta.metadata.deltaId, error);
    throw error;
  }
}

export async function getPublishedDeltaIndex(): Promise<PublishedDeltaIndex> {
  const snapshot = await getDoc(
    doc(db, DELTA_INDEX_COLLECTION, DELTA_INDEX_DOCUMENT),
  );

  if (!snapshot.exists()) {
    return {
      schemaVersion: DELTA_SCHEMA_VERSION,
      updatedAt: "",
      activeDeltaIds: [],
      activeDeltas: [],
    };
  }

  return normalizeDeltaIndex(snapshot.data());
}
