import type { SubmissionQueueRecord } from "./submissionQueueService";

export const MERGE_PACKET_SCHEMA_VERSION = 1 as const;

export type MergePacketGenerator = {
  uid: string;
  displayName: string;
  email: string;
};

export type MergePacket = {
  packetSchemaVersion: typeof MERGE_PACKET_SCHEMA_VERSION;
  packetId: string;
  generatedAt: string;
  generatedBy: MergePacketGenerator;
  source: "Firestore submissions";
  summary: {
    submissionCount: number;
    collectionIds: string[];
    submissionIds: string[];
    firestoreDocumentIds: string[];
  };
  submissions: Array<{
    firestoreDocumentId: string;
    submission: SubmissionQueueRecord["submission"];
  }>;
};

type BuildMergePacketInput = {
  records: SubmissionQueueRecord[];
  generatedBy: MergePacketGenerator;
  now?: Date;
};

function safeTimestamp(date: Date): string {
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

export function buildMergePacket({
  records,
  generatedBy,
  now = new Date(),
}: BuildMergePacketInput): MergePacket {
  if (records.length === 0) {
    throw new Error(
      "Select at least one submission before building a merge packet.",
    );
  }

  const seenDocumentIds = new Set<string>();

  for (const record of records) {
    if (seenDocumentIds.has(record.documentId)) {
      throw new Error(
        `The selected records contain duplicate Firestore document ID ${record.documentId}.`,
      );
    }

    seenDocumentIds.add(record.documentId);
  }

  return {
    packetSchemaVersion: MERGE_PACKET_SCHEMA_VERSION,
    packetId: `MERGE_${safeTimestamp(now)}_${crypto.randomUUID()}`,
    generatedAt: now.toISOString(),
    generatedBy,
    source: "Firestore submissions",
    summary: {
      submissionCount: records.length,
      collectionIds: records.map(
        ({ submission }) => submission.metadata.collectionId,
      ),
      submissionIds: records.map(
        ({ submission }) => submission.metadata.submissionId,
      ),
      firestoreDocumentIds: records.map(
        ({ documentId }) => documentId,
      ),
    },
    submissions: records.map((record) => ({
      firestoreDocumentId: record.documentId,
      submission: record.submission,
    })),
  };
}

export function mergePacketFilename(packet: MergePacket): string {
  const generatedAt = new Date(packet.generatedAt);
  const timestamp = Number.isNaN(generatedAt.getTime())
    ? packet.generatedAt.replace(/[^0-9]/g, "").slice(0, 14)
    : safeTimestamp(generatedAt);

  return `NAIADD_MergePacket_${timestamp}_${packet.summary.submissionCount}_submissions.json`;
}

export function downloadMergePacket(packet: MergePacket): string {
  const filename = mergePacketFilename(packet);
  const blob = new Blob([JSON.stringify(packet, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  return filename;
}
