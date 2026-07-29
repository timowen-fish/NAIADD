import type {
  DataEntryStep,
  SurveySession,
} from "../types/surveySession";

const ACTIVE_SESSION_PREFIX = "naiadd.surveySession";
const DRAFTS_PREFIX = "naiadd.surveyDrafts";

export const WORKFLOW_STEP_EVENT = "naiadd-workflow-step";
export const WORKFLOW_SESSION_EVENT = "naiadd-workflow-session";

type AnyRecord = Record<string, unknown>;

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
  fishCount: number;
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

function countFish(session: SurveySession): number {
  return session.specimens.reduce((total, specimen) => {
    const row = asRecord(specimen);
    const commonName = textValue(
      row,
      ["CommonName", "commonName"],
      "",
    );

    if (!commonName || commonName === "NoFish") {
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
    const commonName = textValue(
      row,
      ["CommonName", "commonName"],
      "",
    );

    if (commonName && commonName !== "NoFish") {
      species.add(commonName.toLowerCase());
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

  const fishCount = countFish(normalized);
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
        ["CommonName", "commonName"],
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
    fishCount,
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
  dispatchSessionEvent(next);

  return next;
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

  dispatchSessionEvent();
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
