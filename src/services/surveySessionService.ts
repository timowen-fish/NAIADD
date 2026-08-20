import type {
  DataEntryStep,
  SurveySession,
} from "../types/surveySession";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";

const ACTIVE_SESSION_PREFIX = "naiadd.surveySession";
const DRAFTS_PREFIX = "naiadd.surveyDrafts";

export const WORKFLOW_STEP_EVENT = "naiadd-workflow-step";
export const WORKFLOW_SESSION_EVENT = "naiadd-workflow-session";

type AnyRecord = Record<string, unknown>;

const USER_DRAFTS_COLLECTION = "drafts";
const USER_DELETED_DRAFTS_COLLECTION = "deletedDrafts";

function userDraftRef(uid: string, sessionId: string) {
  return doc(db, "users", uid, USER_DRAFTS_COLLECTION, sessionId);
}

function deletedDraftRef(uid: string, sessionId: string) {
  return doc(db, "users", uid, USER_DELETED_DRAFTS_COLLECTION, sessionId);
}

function syncDraftToCloud(session: SurveySession): void {
  void setDoc(userDraftRef(session.ownerUid, session.id), {
    session,
    updatedAt: session.updatedAt,
  })
    .then(() =>
      deleteDoc(deletedDraftRef(session.ownerUid, session.id)).catch(
        () => undefined,
      ),
    )
    .catch((error) => {
      console.warn("Unable to sync survey draft to Firestore.", error);
    });
}

function syncDraftDeletionToCloud(uid: string, sessionId: string): void {
  const deletedAt = new Date().toISOString();

  void Promise.all([
    deleteDoc(userDraftRef(uid, sessionId)),
    setDoc(deletedDraftRef(uid, sessionId), {
      id: sessionId,
      deletedAt,
    }),
  ]).catch((error) => {
    console.warn("Unable to sync survey draft deletion to Firestore.", error);
  });
}

export type SurveyDraftStatus =
  | "not-started"
  | "in-progress"
  | "ready-to-submit";

export type SurveyDraftMetadata = {
  id: string;
  collectionId: string;
  ownerUid: string;
  waterbody: string;
  siteName: string;
  surveyDate: string;
  specimenFormType: SurveySession["specimenFormType"];
  specimenCount: number;
  speciesCount: number;
  progressPercent: number;
  completedSteps: number;
  totalSteps: number;
  currentStep: DataEntryStep;
  status: SurveyDraftStatus;
  createdAt: string;
  updatedAt: string;
  searchableText: string;
};

export type SurveyDraftRecord = {
  session: SurveySession;
  metadata: SurveyDraftMetadata;
};


type ExternalSurveyState = {
  drafts: SurveySession[];
  activeSession: SurveySession | null;
};


const OFFLINE_HELPER_BASE_URL = "http://127.0.0.1:43128";
const OFFLINE_HELPER_SURVEY_STATE_URL =
  `${OFFLINE_HELPER_BASE_URL}/survey-state`;

type HelperUserStatePackage<T> = {
  format: "NAIADD_OFFLINE_USER_STATE_V1";
  uid: string;
  updatedAt: string;
  data: T;
};

async function writeSurveyStateToHelper(
  uid: string,
  state: ExternalSurveyState,
): Promise<boolean> {
  try {
    const payload: HelperUserStatePackage<ExternalSurveyState> = {
      format: "NAIADD_OFFLINE_USER_STATE_V1",
      uid,
      updatedAt: new Date().toISOString(),
      data: state,
    };

    const response = await fetch(OFFLINE_HELPER_SURVEY_STATE_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function readSurveyStateFromHelper(
  uid: string,
): Promise<ExternalSurveyState | null> {
  try {
    const response = await fetch(OFFLINE_HELPER_SURVEY_STATE_URL, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) return null;

    const payload =
      (await response.json()) as Partial<
        HelperUserStatePackage<ExternalSurveyState>
      >;

    if (
      payload.format !== "NAIADD_OFFLINE_USER_STATE_V1" ||
      payload.uid !== uid ||
      !payload.data
    ) {
      return null;
    }

    return payload.data;
  } catch {
    return null;
  }
}

function readActiveSession(uid: string): SurveySession | null {
  try {
    const raw = localStorage.getItem(activeSessionKey(uid));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    return isSurveySession(parsed, uid)
      ? normalizeSession(parsed)
      : null;
  } catch {
    return null;
  }
}

const surveyBackupQueues = new Map<string, Promise<void>>();

function backupSurveyStateExternally(uid: string): Promise<void> {
  const previous = surveyBackupQueues.get(uid) ?? Promise.resolve();

  const next = previous
    .catch(() => undefined)
    .then(async () => {
      /*
       * Read the state only when this queued write actually runs.
       * That guarantees a slower, older helper request can never finish
       * after a newer survey state and overwrite it.
       */
      const state: ExternalSurveyState = {
        drafts: readDrafts(uid),
        activeSession: readActiveSession(uid),
      };

      const helperSaved = await writeSurveyStateToHelper(uid, state);

      if (!helperSaved) {
        console.warn("Unable to write NAIADD survey-state backup to Offline Helper.");
      }
    })
    .finally(() => {
      if (surveyBackupQueues.get(uid) === next) {
        surveyBackupQueues.delete(uid);
      }
    });

  surveyBackupQueues.set(uid, next);
  return next;
}

export async function flushSurveyStateBackup(uid: string): Promise<void> {
  await backupSurveyStateExternally(uid);
}

async function restoreSurveyStateFromExternal(
  uid: string,
): Promise<ExternalSurveyState | null> {
  try {
    const helperState = await readSurveyStateFromHelper(uid);

    if (!helperState) return null;

    const externalDrafts = Array.isArray(helperState.drafts)
      ? helperState.drafts
          .filter((item): item is SurveySession =>
            isSurveySession(item, uid),
          )
          .map(normalizeSession)
      : [];

    const externalActive =
      helperState.activeSession &&
      isSurveySession(helperState.activeSession, uid)
        ? normalizeSession(helperState.activeSession)
        : null;

    if (externalDrafts.length > 0) {
      writeDrafts(uid, [
        ...readDrafts(uid),
        ...externalDrafts,
      ]);
    }

    if (externalActive) {
      const localActive = readActiveSession(uid);

      if (
        !localActive ||
        externalActive.updatedAt.localeCompare(
          localActive.updatedAt,
        ) > 0
      ) {
        writeActiveSession(externalActive);
      }
    }

    return {
      drafts: externalDrafts,
      activeSession: externalActive,
    };
  } catch (error) {
    console.warn("Unable to restore external survey-state backup.", error);
    return null;
  }
}

function activeSessionKey(uid: string): string {
  return `${ACTIVE_SESSION_PREFIX}.${uid}`;
}

function draftsKey(uid: string): string {
  return `${DRAFTS_PREFIX}.${uid}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function timestampCode(date: Date): string {
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

function submitterCode(uid: string): string {
  return (
    uid
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 8) || "USER"
  );
}

function randomCode(length = 4): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);

  return Array.from(
    values,
    (value) => alphabet[value % alphabet.length],
  ).join("");
}

function createCollectionId(uid: string): string {
  return `COLL_${submitterCode(uid)}_${timestampCode(
    new Date(),
  )}_${randomCode()}`;
}

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

function textValue(
  record: AnyRecord,
  keys: readonly string[],
  fallback = "",
): string {
  const value = firstValue(record, keys);

  if (value === null) {
    return fallback;
  }

  if (Array.isArray(value)) {
    const joined = value.map(String).filter(Boolean).join(", ");
    return joined || fallback;
  }

  return String(value).trim() || fallback;
}

function numericValue(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStep(value: unknown): DataEntryStep {
  if (
    value === "location" ||
    value === "survey" ||
    value === "specimens" ||
    value === "review" ||
    value === "submit"
  ) {
    return value;
  }

  return "location";
}

function isSurveySession(
  value: unknown,
  ownerUid?: string,
): value is SurveySession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as Partial<SurveySession>;

  if (
    typeof session.id !== "string" ||
    !session.id.trim() ||
    typeof session.ownerUid !== "string" ||
    !session.ownerUid.trim()
  ) {
    return false;
  }

  if (ownerUid && session.ownerUid !== ownerUid) {
    return false;
  }

  return true;
}

function normalizeSession(
  session: SurveySession,
): SurveySession {
  const now = new Date().toISOString();

  return {
    ...session,
    collectionId:
      session.collectionId || createCollectionId(session.ownerUid),
    currentStep: normalizeStep(session.currentStep),
    location: session.location ?? null,
    survey: session.survey ?? null,
    specimenFormType: session.specimenFormType ?? null,
    specimens: Array.isArray(session.specimens)
      ? session.specimens
      : [],
    createdAt: session.createdAt || now,
    updatedAt: session.updatedAt || now,
    version: 1,
  };
}

function readDrafts(uid: string): SurveySession[] {
  try {
    const raw = localStorage.getItem(draftsKey(uid));

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is SurveySession =>
        isSurveySession(item, uid),
      )
      .map(normalizeSession)
      .sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      );
  } catch {
    return [];
  }
}

function writeDrafts(
  uid: string,
  sessions: SurveySession[],
): SurveySession[] {
  const unique = new Map<string, SurveySession>();

  for (const session of sessions) {
    if (!isSurveySession(session, uid)) {
      continue;
    }

    const normalized = normalizeSession(session);
    const existing = unique.get(normalized.id);

    if (
      !existing ||
      normalized.updatedAt.localeCompare(existing.updatedAt) > 0
    ) {
      unique.set(normalized.id, normalized);
    }
  }

  const sorted = Array.from(unique.values()).sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
  );

  localStorage.setItem(draftsKey(uid), JSON.stringify(sorted));

  return sorted;
}

function upsertDraft(session: SurveySession): SurveySession[] {
  const drafts = readDrafts(session.ownerUid);
  const existingIndex = drafts.findIndex(
    (draft) => draft.id === session.id,
  );

  if (existingIndex >= 0) {
    drafts[existingIndex] = session;
  } else {
    drafts.push(session);
  }

  return writeDrafts(session.ownerUid, drafts);
}

function writeActiveSession(session: SurveySession): void {
  localStorage.setItem(
    activeSessionKey(session.ownerUid),
    JSON.stringify(session),
  );
}

function dispatchSessionEvent(
  session?: SurveySession,
): void {
  window.dispatchEvent(
    new CustomEvent(WORKFLOW_SESSION_EVENT, {
      detail: session,
    }),
  );
}

function countSpecimens(session: SurveySession): number {
  return session.specimens.reduce((total, specimen) => {
    const row = asRecord(specimen);
    const speciesName = textValue(
      row,
      ["ScientificName", "scientificName", "Species", "species"],
      "",
    );

    if (
      !speciesName ||
      speciesName === "NoSpecimen" ||
      speciesName === "No Specimen"
    ) {
      return total;
    }

    return (
      total +
      (numericValue(
        firstValue(row, ["Quantity", "quantity"]),
      ) ?? 1)
    );
  }, 0);
}

function countSpecies(session: SurveySession): number {
  const species = new Set<string>();

  for (const specimen of session.specimens) {
    const row = asRecord(specimen);
    const speciesName = textValue(
      row,
      ["ScientificName", "scientificName", "Species", "species"],
      "",
    );

    if (
      speciesName &&
      speciesName !== "NoSpecimen" &&
      speciesName !== "No Specimen"
    ) {
      species.add(speciesName.toLowerCase());
    }
  }

  return species.size;
}

function completedStepCount(session: SurveySession): number {
  let completed = 0;

  if (session.location) {
    completed += 1;
  }

  if (session.survey) {
    completed += 1;
  }

  if (
    session.specimenFormType &&
    session.specimens.length > 0
  ) {
    completed += 1;
  }

  if (
    session.location &&
    session.survey &&
    session.specimenFormType &&
    session.specimens.length > 0
  ) {
    completed += 1;
  }

  return completed;
}

export function getSurveyDraftMetadata(
  session: SurveySession,
): SurveyDraftMetadata {
  const normalized = normalizeSession(session);
  const location = asRecord(normalized.location);
  const survey = asRecord(normalized.survey);

  const waterbody = textValue(
    location,
    ["Waterbody", "waterbody"],
    "Unnamed Waterbody",
  );

  const siteName = textValue(
    location,
    ["SiteName", "siteName"],
    "Unnamed Site",
  );

  const surveyDate = textValue(
    survey,
    [
      "Survey_Date",
      "SurveyDate",
      "surveyDate",
      "Date",
      "date",
    ],
    "",
  );

  const specimenCount = countSpecimens(normalized);
  const speciesCount = countSpecies(normalized);
  const completedSteps = completedStepCount(normalized);
  const totalSteps = 4;
  const progressPercent = Math.round(
    (completedSteps / totalSteps) * 100,
  );

  const status: SurveyDraftStatus =
    completedSteps === 0
      ? "not-started"
      : completedSteps === totalSteps
        ? "ready-to-submit"
        : "in-progress";

  const searchableText = [
    normalized.id,
    normalized.collectionId,
    waterbody,
    siteName,
    surveyDate,
    normalized.specimenFormType ?? "",
    ...normalized.specimens.map((specimen) =>
      textValue(
        asRecord(specimen),
        ["ScientificName", "scientificName", "Species", "species"],
        "",
      ),
    ),
  ]
    .join(" ")
    .toLowerCase();

  return {
    id: normalized.id,
    collectionId: normalized.collectionId,
    ownerUid: normalized.ownerUid,
    waterbody,
    siteName,
    surveyDate,
    specimenFormType: normalized.specimenFormType,
    specimenCount,
    speciesCount,
    progressPercent,
    completedSteps,
    totalSteps,
    currentStep: normalized.currentStep,
    status,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    searchableText,
  };
}

export function createSurveySession(
  uid: string,
): SurveySession {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    collectionId: createCollectionId(uid),
    ownerUid: uid,
    currentStep: "location",
    location: null,
    survey: null,
    specimenFormType: null,
    specimens: [],
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

/**
 * Returns every locally saved survey belonging to the user.
 *
 * The legacy single active session is automatically migrated into the draft
 * collection the first time this function is called.
 */
export function listSurveyDrafts(
  uid: string,
): SurveySession[] {
  const drafts = readDrafts(uid);

  try {
    const rawActive = localStorage.getItem(activeSessionKey(uid));

    if (!rawActive) {
      return drafts;
    }

    const parsedActive = JSON.parse(rawActive) as unknown;

    if (!isSurveySession(parsedActive, uid)) {
      localStorage.removeItem(activeSessionKey(uid));
      return drafts;
    }

    const active = normalizeSession(parsedActive);

    if (!drafts.some((draft) => draft.id === active.id)) {
      return writeDrafts(uid, [...drafts, active]);
    }

    return drafts;
  } catch {
    return drafts;
  }
}

/**
 * Returns drafts with derived display and search metadata.
 *
 * This is optional and does not change the existing listSurveyDrafts API.
 */
export function listSurveyDraftRecords(
  uid: string,
): SurveyDraftRecord[] {
  return listSurveyDrafts(uid).map((session) => ({
    session,
    metadata: getSurveyDraftMetadata(session),
  }));
}

/**
 * Loads the current Data Entry survey.
 *
 * Existing callers continue to use this function exactly as before. The
 * active survey is also retained in the multiple-draft collection.
 */
export function loadSurveySession(
  uid: string,
): SurveySession {
  try {
    const raw = localStorage.getItem(activeSessionKey(uid));

    if (!raw) {
      return createSurveySession(uid);
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!isSurveySession(parsed, uid)) {
      localStorage.removeItem(activeSessionKey(uid));
      return createSurveySession(uid);
    }

    const session = normalizeSession(parsed);
    writeActiveSession(session);
    upsertDraft(session);

    return session;
  } catch {
    return createSurveySession(uid);
  }
}

/**
 * Saves the active survey and adds or updates it in the user's draft list.
 */
export function saveSurveySession(
  session: SurveySession,
): SurveySession {
  const next = normalizeSession({
    ...session,
    collectionId:
      session.collectionId ||
      createCollectionId(session.ownerUid),
    updatedAt: new Date().toISOString(),
  });

  writeActiveSession(next);
  upsertDraft(next);
  syncDraftToCloud(next);
  backupSurveyStateExternally(next.ownerUid);
  dispatchSessionEvent(next);

  return next;
}

/**
 * Creates a new locally saved draft without changing the active Data Entry
 * survey until activateSurveyDraft is called.
 */
export function createSurveyDraft(
  uid: string,
): SurveySession {
  const session = createSurveySession(uid);

  upsertDraft(session);
  syncDraftToCloud(session);
  backupSurveyStateExternally(session.ownerUid);
  dispatchSessionEvent(session);

  return session;
}

/**
 * Makes an existing saved draft the active Data Entry survey.
 */
export function activateSurveyDraft(
  uid: string,
  sessionId: string,
): SurveySession {
  const session = readDrafts(uid).find(
    (draft) => draft.id === sessionId,
  );

  if (!session) {
    throw new Error("Survey draft not found.");
  }

  const next = normalizeSession({
    ...session,
    updatedAt: new Date().toISOString(),
  });

  writeActiveSession(next);
  upsertDraft(next);
  syncDraftToCloud(next);
  backupSurveyStateExternally(next.ownerUid);
  dispatchSessionEvent(next);

  return next;
}

/**
 * Makes an existing draft active and waits until its complete state has
 * reached the durable offline helper before navigation occurs.
 */
export async function activateSurveyDraftDurably(
  uid: string,
  sessionId: string,
): Promise<SurveySession> {
  const session = activateSurveyDraft(uid, sessionId);
  await flushSurveyStateBackup(uid);
  return session;
}

/**
 * Creates a new editable copy of an existing draft.
 *
 * The copy receives a new session ID and Collection ID so it can eventually
 * be submitted independently.
 */
export function duplicateSurveyDraft(
  uid: string,
  sessionId: string,
): SurveySession {
  const source = readDrafts(uid).find(
    (draft) => draft.id === sessionId,
  );

  if (!source) {
    throw new Error("Survey draft not found.");
  }

  const now = new Date().toISOString();

  const duplicate: SurveySession = normalizeSession({
    ...source,
    id: crypto.randomUUID(),
    collectionId: createCollectionId(uid),
    ownerUid: uid,
    currentStep:
      source.currentStep === "submit"
        ? "review"
        : source.currentStep,
    createdAt: now,
    updatedAt: now,
    version: 1,
  });

  upsertDraft(duplicate);
  syncDraftToCloud(duplicate);
  backupSurveyStateExternally(duplicate.ownerUid);
  dispatchSessionEvent(duplicate);

  return duplicate;
}

/**
 * Deletes a locally saved draft.
 *
 * When the deleted draft is currently active, the active-session pointer is
 * cleared. The next Data Entry visit will begin with a new unsaved survey.
 */
export function deleteSurveyDraft(
  uid: string,
  sessionId: string,
): void {
  const remaining = readDrafts(uid).filter(
    (draft) => draft.id !== sessionId,
  );

  writeDrafts(uid, remaining);

  try {
    const rawActive = localStorage.getItem(activeSessionKey(uid));

    if (rawActive) {
      const active = JSON.parse(rawActive) as unknown;

      if (
        isSurveySession(active, uid) &&
        active.id === sessionId
      ) {
        localStorage.removeItem(activeSessionKey(uid));
      }
    }
  } catch {
    localStorage.removeItem(activeSessionKey(uid));
  }

  syncDraftDeletionToCloud(uid, sessionId);
  backupSurveyStateExternally(uid);
  dispatchSessionEvent();
}

export async function syncSurveyDrafts(uid: string): Promise<SurveySession[]> {
  try {
    await restoreSurveyStateFromExternal(uid);

    const [cloudSnapshot, deletedSnapshot] = await Promise.all([
      getDocs(collection(db, "users", uid, USER_DRAFTS_COLLECTION)),
      getDocs(collection(db, "users", uid, USER_DELETED_DRAFTS_COLLECTION)),
    ]);

    const deleted = new Map<string, string>();
    deletedSnapshot.docs.forEach((item) => {
      const data = item.data() as { deletedAt?: unknown };
      deleted.set(
        item.id,
        typeof data.deletedAt === "string" ? data.deletedAt : "",
      );
    });

    const merged = new Map<string, SurveySession>();

    readDrafts(uid).forEach((session) => {
      const deletedAt = deleted.get(session.id);
      if (!deletedAt || session.updatedAt.localeCompare(deletedAt) > 0) {
        merged.set(session.id, session);
      }
    });

    cloudSnapshot.docs.forEach((item) => {
      const data = item.data() as { session?: unknown };
      if (!isSurveySession(data.session, uid)) return;

      const session = normalizeSession(data.session);
      const deletedAt = deleted.get(session.id);
      if (deletedAt && deletedAt.localeCompare(session.updatedAt) >= 0) return;

      const existing = merged.get(session.id);
      if (!existing || session.updatedAt.localeCompare(existing.updatedAt) > 0) {
        merged.set(session.id, session);
      }
    });

    const result = writeDrafts(uid, [...merged.values()]);

    await Promise.all(
      result.map((session) =>
        setDoc(userDraftRef(uid, session.id), {
          session,
          updatedAt: session.updatedAt,
        }),
      ),
    );

    backupSurveyStateExternally(uid);
    dispatchSessionEvent();
    return result;
  } catch (error) {
    console.warn("Unable to synchronize survey drafts.", error);
    return listSurveyDrafts(uid);
  }
}

/**
 * Returns one saved draft by its session ID.
 */
export function getSurveyDraft(
  uid: string,
  sessionId: string,
): SurveySession | null {
  return (
    readDrafts(uid).find((draft) => draft.id === sessionId) ??
    null
  );
}

/**
 * Returns the derived metadata for one saved draft.
 */
export function getSurveyDraftRecord(
  uid: string,
  sessionId: string,
): SurveyDraftRecord | null {
  const session = getSurveyDraft(uid, sessionId);

  if (!session) {
    return null;
  }

  return {
    session,
    metadata: getSurveyDraftMetadata(session),
  };
}

/**
 * Clears only the active Data Entry pointer.
 *
 * Saved draft records remain available on the Drafts page.
 */
export function clearSurveySession(uid: string): void {
  localStorage.removeItem(activeSessionKey(uid));
  backupSurveyStateExternally(uid);
  dispatchSessionEvent();
}

export function requestWorkflowStep(
  step: DataEntryStep,
): void {
  window.dispatchEvent(
    new CustomEvent(WORKFLOW_STEP_EVENT, {
      detail: step,
    }),
  );
}
