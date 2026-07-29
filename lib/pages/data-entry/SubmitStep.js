"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SubmitStep;
const react_1 = require("react");
const firebase_1 = require("../../firebase");
const submissionService_1 = require("../../services/submissionService");
const surveySessionService_1 = require("../../services/surveySessionService");
require("../../styles/SubmitStep.css");
function asRecord(value) {
    return value && typeof value === "object"
        ? value
        : {};
}
function firstValue(record, keys) {
    for (const key of keys) {
        const value = record[key];
        if (value !== undefined &&
            value !== null &&
            String(value).trim() !== "") {
            return value;
        }
    }
    return null;
}
function display(value, fallback = "—") {
    if (value === undefined ||
        value === null ||
        String(value).trim() === "") {
        return fallback;
    }
    if (Array.isArray(value)) {
        return value.map(String).filter(Boolean).join(", ") || fallback;
    }
    return String(value);
}
function numeric(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
function formatDateTime(value) {
    if (!value)
        return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}
function specimenTypeLabel(type) {
    if (type === "gillnet")
        return "Gill Net Survey";
    if (type === "cm_tally")
        return "Centimeter Tally";
    if (type === "standard")
        return "Standard Fish Processing";
    return "Not selected";
}
function validationMessage(issues) {
    if (issues.length === 0) {
        return "The survey could not be submitted.";
    }
    return issues.map((issue) => issue.message).join(" ");
}
function SubmitStep({ session, onBack, onStartNewSurvey, }) {
    const [screenState, setScreenState] = (0, react_1.useState)("ready");
    const [stage, setStage] = (0, react_1.useState)("package");
    const [message, setMessage] = (0, react_1.useState)("");
    const [submission, setSubmission] = (0, react_1.useState)(null);
    const [warnings, setWarnings] = (0, react_1.useState)([]);
    const location = asRecord(session.location);
    const survey = asRecord(session.survey);
    const rows = (0, react_1.useMemo)(() => Array.isArray(session.specimens)
        ? session.specimens.map(asRecord)
        : [], [session.specimens]);
    const realRows = (0, react_1.useMemo)(() => rows.filter((row) => {
        const commonName = display(firstValue(row, ["CommonName", "commonName"]), "");
        return commonName !== "" && commonName !== "NoFish";
    }), [rows]);
    const totalFish = (0, react_1.useMemo)(() => realRows.reduce((sum, row) => sum +
        (numeric(firstValue(row, ["Quantity", "quantity"])) ?? 1), 0), [realRows]);
    const speciesCount = (0, react_1.useMemo)(() => new Set(realRows
        .map((row) => display(firstValue(row, ["CommonName", "commonName"]), ""))
        .filter(Boolean)).size, [realRows]);
    const waterbody = display(firstValue(location, ["Waterbody", "waterbody"]));
    const siteName = display(firstValue(location, ["SiteName", "siteName"]));
    const collectionId = display(firstValue(survey, [
        "CollectionID",
        "CollectionId",
        "collectionID",
        "collectionId",
    ]), session.id);
    const surveyType = display(firstValue(survey, [
        "Survey_Type",
        "SurveyType",
        "surveyType",
        "Geartype",
    ]));
    async function saveDraft() {
        setScreenState("saving");
        setMessage("");
        setWarnings([]);
        try {
            (0, surveySessionService_1.saveSurveySession)({
                ...session,
                currentStep: "submit",
            });
            await delay(300);
            setMessage(`Draft saved ${formatDateTime(new Date().toISOString())}.`);
            setScreenState("saved");
        }
        catch (error) {
            setMessage(error instanceof Error
                ? error.message
                : "The draft could not be saved.");
            setScreenState("failed");
        }
    }
    async function submitToDba() {
        setMessage("");
        setWarnings([]);
        (0, surveySessionService_1.saveSurveySession)({
            ...session,
            currentStep: "submit",
        });
        if (!navigator.onLine) {
            setScreenState("offline");
            return;
        }
        const currentUser = firebase_1.auth.currentUser;
        if (!currentUser) {
            setMessage("Your sign-in session is no longer available. Sign in again before submitting.");
            setScreenState("failed");
            return;
        }
        setScreenState("submitting");
        setStage("package");
        try {
            await delay(250);
            setStage("validate");
            await delay(250);
            setStage("queue");
            const result = await (0, submissionService_1.submitSurvey)({
                session: {
                    ...session,
                    currentStep: "submit",
                },
                submitter: {
                    uid: currentUser.uid,
                    email: currentUser.email ?? "",
                    displayName: currentUser.displayName ?? "",
                },
            });
            if (!result.ok) {
                if (result.code === "offline") {
                    setScreenState("offline");
                    return;
                }
                setWarnings(result.warnings);
                setMessage(result.code === "validation-failed"
                    ? validationMessage(result.errors)
                    : result.message);
                setScreenState("failed");
                return;
            }
            setSubmission(result.submission);
            setWarnings(result.warnings);
            setScreenState("success");
        }
        catch (error) {
            setMessage(error instanceof Error
                ? error.message
                : "The submission could not be added to the DBA queue.");
            setScreenState("failed");
        }
    }
    if (screenState === "submitting") {
        const progress = stage === "package"
            ? 34
            : stage === "validate"
                ? 68
                : 100;
        return (<main className="submitStep submitCenteredState">
        <section className="submitProgressCard">
          <div className="submitStateIcon uploading">⇧</div>
          <p className="submitKicker">Submit to DBA</p>
          <h2>Preparing survey submission</h2>
          <p>
            Keep this page open while VADMA validates the survey and
            adds it to the secure Firestore queue.
          </p>

          <div className="submitProgressTrack" aria-label={`${progress}% complete`}>
            <span style={{ width: `${progress}%` }}/>
          </div>

          <div className="submitStageList">
            <StageRow complete={stage !== "package"} active={stage === "package"} text="Building submission package"/>
            <StageRow complete={stage === "queue"} active={stage === "validate"} text="Validating survey data"/>
            <StageRow complete={false} active={stage === "queue"} text="Adding survey to Firestore queue"/>
          </div>
        </section>
      </main>);
    }
    if (screenState === "success" && submission) {
        const queuedAt = submission.processing?.queuedAt ??
            submission.metadata.queuedAt ??
            submission.metadata.createdAt;
        return (<main className="submitStep submitCenteredState">
        <section className="submitResultCard success">
          <div className="submitStateIcon">✓</div>
          <p className="submitKicker">Submission Complete</p>
          <h2>Survey queued successfully</h2>
          <p>
            The completed survey is now stored in VADMA&apos;s secure
            Firestore submission queue and is ready for DBA
            processing.
          </p>

          <div className="submitResultSummary">
            <ResultRow label="Submission ID" value={submission.metadata.submissionId} mono/>
            <ResultRow label="Collection ID" value={submission.metadata.collectionId} mono/>
            <ResultRow label="Waterbody" value={waterbody}/>
            <ResultRow label="Site" value={siteName}/>
            <ResultRow label="Fish" value={String(totalFish)}/>
            <ResultRow label="Species" value={String(speciesCount)}/>
            <ResultRow label="Queue Status" value={submission.processing?.businessStatus ??
                "Queued"}/>
            <ResultRow label="Queued" value={formatDateTime(queuedAt)}/>
          </div>

          {warnings.length > 0 && (<div className="submitInlineMessage success">
              <span>!</span>
              Submitted with {warnings.length} validation{" "}
              {warnings.length === 1 ? "warning" : "warnings"}.
            </div>)}

          <div className="submitResultActions">
            <button type="button" className="submitPrimaryButton" onClick={onStartNewSurvey}>
              + Start New Survey
            </button>

            <button type="button" className="submitSecondaryButton" onClick={onBack}>
              View Survey Review
            </button>
          </div>

          <p className="submitAuditNote">
            Firestore queue record created. Starting a new survey
            will remove this completed survey from local drafts.
          </p>
        </section>
      </main>);
    }
    if (screenState === "offline") {
        return (<main className="submitStep submitCenteredState">
        <section className="submitResultCard warning">
          <div className="submitStateIcon">⌁</div>
          <p className="submitKicker">No Internet Connection</p>
          <h2>Your survey is still safe</h2>
          <p>
            The survey remains saved on this device. Return to this
            page and submit after an internet connection is
            available.
          </p>

          <div className="submitResultActions">
            <button type="button" className="submitPrimaryButton" onClick={() => {
                setMessage("");
                setScreenState("ready");
            }}>
              Check Again
            </button>

            <button type="button" className="submitSecondaryButton" onClick={onBack}>
              Return to Review
            </button>
          </div>
        </section>
      </main>);
    }
    if (screenState === "failed") {
        return (<main className="submitStep submitCenteredState">
        <section className="submitResultCard danger">
          <div className="submitStateIcon">!</div>
          <p className="submitKicker">
            Submission Not Completed
          </p>
          <h2>No survey data was lost</h2>
          <p>
            VADMA kept the survey saved locally. Correct any listed
            issues, retry, or return to the review page.
          </p>

          {message && (<div className="submitInlineMessage danger">
              {message}
            </div>)}

          {warnings.length > 0 && (<div className="submitInlineMessage danger">
              {warnings
                    .map((warning) => warning.message)
                    .join(" ")}
            </div>)}

          <div className="submitResultActions">
            <button type="button" className="submitPrimaryButton" onClick={submitToDba}>
              Retry
            </button>

            <button type="button" className="submitSecondaryButton" onClick={onBack}>
              Return to Review
            </button>
          </div>
        </section>
      </main>);
    }
    return (<main className="submitStep">
      <button type="button" className="submitBackButton" onClick={onBack}>
        ← Back to Review
      </button>

      <section className="submitHero">
        <div>
          <p className="submitKicker">Final Step</p>
          <h2>Save or submit this survey</h2>
          <p>
            Everything has been reviewed. Choose whether to keep
            working later or submit the completed survey to the DBA
            queue.
          </p>
        </div>

        <div className="submitReadyBadge">
          <span>✓</span>
          <div>
            <strong>Ready</strong>
            <small>Review complete</small>
          </div>
        </div>
      </section>

      <section className="submitSummaryCard">
        <div className="submitSummaryHeading">
          <div>
            <p className="submitKicker">Submission Summary</p>
            <h3>{waterbody}</h3>
            <span>{siteName}</span>
          </div>

          <span className="submitMethodBadge">
            {specimenTypeLabel(session.specimenFormType)}
          </span>
        </div>

        <div className="submitSummaryGrid">
          <SummaryItem label="Collection ID" value={collectionId} mono/>
          <SummaryItem label="Survey Type" value={surveyType}/>
          <SummaryItem label="Fish" value={String(totalFish)}/>
          <SummaryItem label="Species" value={String(speciesCount)}/>
          <SummaryItem label="Last Saved" value={formatDateTime(session.updatedAt)}/>
        </div>
      </section>

      {(screenState === "saved" || message) && (<div className="submitInlineMessage success">
          <span>✓</span>
          {message}
        </div>)}

      <div className="submitChoiceGrid">
        <section className="submitChoiceCard draft">
          <div className="submitChoiceIcon">▣</div>
          <p className="submitKicker">Keep Working Later</p>
          <h3>Save Draft</h3>
          <p>
            Keep the entire survey on this device and return to it
            without losing your place.
          </p>

          <ul>
            <li>Preserves all entered fields</li>
            <li>Available without internet</li>
            <li>Can be reopened from Drafts</li>
          </ul>

          <button type="button" className="submitSecondaryAction" disabled={screenState === "saving"} onClick={saveDraft}>
            {screenState === "saving"
            ? "Saving…"
            : "Save Draft"}
          </button>
        </section>

        <section className="submitChoiceCard primary">
          <div className="submitChoiceIcon">⇧</div>
          <p className="submitKicker">Completed Survey</p>
          <h3>Submit to DBA</h3>
          <p>
            Validate the finished survey and add it to the secure
            Firestore queue for DBA processing.
          </p>

          <ul>
            <li>Builds an immutable survey package</li>
            <li>Runs final validation</li>
            <li>Creates an auditable submission record</li>
          </ul>

          <button type="button" className="submitPrimaryAction" onClick={submitToDba}>
            Submit Survey
          </button>
        </section>
      </div>

      <section className="submitSafetyNote">
        <span>◆</span>
        <div>
          <strong>Your survey is automatically saved</strong>
          <p>
            Closing the app or losing connectivity will not erase
            the current local survey session.
          </p>
        </div>
      </section>
    </main>);
}
function StageRow({ complete, active, text, }) {
    return (<div className={active ? "active" : complete ? "complete" : ""}>
      <span>{complete ? "✓" : active ? "•" : "○"}</span>
      <strong>{text}</strong>
    </div>);
}
function SummaryItem({ label, value, mono = false, }) {
    return (<div className="submitSummaryItem">
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>
        {value}
      </strong>
    </div>);
}
function ResultRow({ label, value, mono = false, }) {
    return (<div>
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>
        {value}
      </strong>
    </div>);
}
//# sourceMappingURL=SubmitStep.js.map