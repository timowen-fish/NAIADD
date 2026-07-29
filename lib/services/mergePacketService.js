"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MERGE_PACKET_SCHEMA_VERSION = void 0;
exports.buildMergePacket = buildMergePacket;
exports.mergePacketFilename = mergePacketFilename;
exports.downloadMergePacket = downloadMergePacket;
exports.MERGE_PACKET_SCHEMA_VERSION = 1;
function safeTimestamp(date) {
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
function buildMergePacket({ records, generatedBy, now = new Date(), }) {
    if (records.length === 0) {
        throw new Error("Select at least one submission before building a merge packet.");
    }
    const seenDocumentIds = new Set();
    for (const record of records) {
        if (seenDocumentIds.has(record.documentId)) {
            throw new Error(`The selected records contain duplicate Firestore document ID ${record.documentId}.`);
        }
        seenDocumentIds.add(record.documentId);
    }
    return {
        packetSchemaVersion: exports.MERGE_PACKET_SCHEMA_VERSION,
        packetId: `MERGE_${safeTimestamp(now)}_${crypto.randomUUID()}`,
        generatedAt: now.toISOString(),
        generatedBy,
        source: "Firestore submissions",
        summary: {
            submissionCount: records.length,
            collectionIds: records.map(({ submission }) => submission.metadata.collectionId),
            submissionIds: records.map(({ submission }) => submission.metadata.submissionId),
            firestoreDocumentIds: records.map(({ documentId }) => documentId),
        },
        submissions: records.map((record) => ({
            firestoreDocumentId: record.documentId,
            submission: record.submission,
        })),
    };
}
function mergePacketFilename(packet) {
    const generatedAt = new Date(packet.generatedAt);
    const timestamp = Number.isNaN(generatedAt.getTime())
        ? packet.generatedAt.replace(/[^0-9]/g, "").slice(0, 14)
        : safeTimestamp(generatedAt);
    return `VADMA_MergePacket_${timestamp}_${packet.summary.submissionCount}_submissions.json`;
}
function downloadMergePacket(packet) {
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
//# sourceMappingURL=mergePacketService.js.map