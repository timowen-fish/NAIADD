"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DataEntryWorkflow;
const react_1 = require("react");
const LocationStep_1 = __importDefault(require("./LocationStep"));
const SurveyInfoStep_1 = __importDefault(require("./SurveyInfoStep"));
const SpecimenTypeSelector_1 = __importDefault(require("./SpecimenTypeSelector"));
const SpecimenStandardStep_1 = __importDefault(require("./SpecimenStandardStep"));
const SpecimenGillnetStep_1 = __importDefault(require("./SpecimenGillnetStep"));
const SpecimenCMTallyStep_1 = __importDefault(require("./SpecimenCMTallyStep"));
const ReviewStep_1 = __importDefault(require("./ReviewStep"));
const SubmitStep_1 = __importDefault(require("./SubmitStep"));
const surveySessionService_1 = require("../../services/surveySessionService");
require("../../styles/DataEntryWorkflow.css");
const steps = [
    { id: "location", label: "Location" },
    { id: "survey", label: "Survey Information" },
    { id: "specimens", label: "Specimens" },
    { id: "review", label: "Review" },
    { id: "submit", label: "Submit" },
];
function loadNormalizedSession(ownerUid) {
    const loaded = (0, surveySessionService_1.loadSurveySession)(ownerUid);
    return {
        ...loaded,
        specimenFormType: loaded.specimenFormType ?? null,
        specimens: Array.isArray(loaded.specimens) ? loaded.specimens : [],
    };
}
function DataEntryWorkflow({ profile, }) {
    const [session, setSession] = (0, react_1.useState)(() => loadNormalizedSession(profile.uid));
    const [step, setStep] = (0, react_1.useState)(() => loadNormalizedSession(profile.uid).currentStep);
    const [showSpecimenSelector, setShowSpecimenSelector] = (0, react_1.useState)(() => !loadNormalizedSession(profile.uid).specimenFormType);
    const [pendingSpecimenType, setPendingSpecimenType] = (0, react_1.useState)(() => loadNormalizedSession(profile.uid).specimenFormType ?? null);
    (0, react_1.useEffect)(() => {
        (0, surveySessionService_1.saveSurveySession)(session);
    }, [session]);
    function update(patch, nextStep) {
        setSession((current) => ({
            ...current,
            ...patch,
            currentStep: nextStep ?? current.currentStep,
            specimenFormType: patch.specimenFormType !== undefined
                ? patch.specimenFormType
                : current.specimenFormType ?? null,
            specimens: Array.isArray(patch.specimens)
                ? patch.specimens
                : Array.isArray(current.specimens)
                    ? current.specimens
                    : [],
        }));
        if (nextStep) {
            setStep(nextStep);
        }
    }
    function openFreshSurvey() {
        const fresh = (0, surveySessionService_1.createSurveySession)(profile.uid);
        setSession({
            ...fresh,
            specimenFormType: null,
            specimens: [],
        });
        setStep("location");
        setPendingSpecimenType(null);
        setShowSpecimenSelector(true);
    }
    (0, react_1.useEffect)(() => {
        const listener = (event) => {
            const requested = event.detail;
            if (!steps.some((item) => item.id === requested)) {
                return;
            }
            setStep(requested);
            if (requested === "specimens") {
                setShowSpecimenSelector(!session.specimenFormType);
                setPendingSpecimenType(session.specimenFormType ?? null);
            }
            setSession((current) => ({
                ...current,
                currentStep: requested,
                specimens: Array.isArray(current.specimens)
                    ? current.specimens
                    : [],
            }));
        };
        window.addEventListener(surveySessionService_1.WORKFLOW_STEP_EVENT, listener);
        return () => {
            window.removeEventListener(surveySessionService_1.WORKFLOW_STEP_EVENT, listener);
        };
    }, [session.specimenFormType]);
    const completion = (0, react_1.useMemo)(() => ({
        location: Boolean(session.location),
        survey: Boolean(session.survey),
        specimens: Boolean(session.specimenFormType && session.specimens.length > 0),
        review: Boolean(session.location &&
            session.survey &&
            session.specimenFormType &&
            session.specimens.length > 0),
        submit: false,
    }), [session]);
    function newSurvey() {
        const confirmed = window.confirm("Start a new survey? Your current survey will remain available on the Drafts page.");
        if (!confirmed) {
            return;
        }
        (0, surveySessionService_1.clearSurveySession)(profile.uid);
        openFreshSurvey();
    }
    function goToStep(nextStep) {
        if (nextStep === "specimens") {
            setPendingSpecimenType(session.specimenFormType ?? null);
            setShowSpecimenSelector(!session.specimenFormType);
        }
        update({}, nextStep);
    }
    function continueFromSpecimenSelector() {
        if (!pendingSpecimenType) {
            return;
        }
        const changingType = Boolean(session.specimenFormType) &&
            session.specimenFormType !== pendingSpecimenType;
        if (changingType && session.specimens.length > 0) {
            const confirmed = window.confirm("Changing specimen entry methods will clear the specimen rows already entered for this survey. Continue?");
            if (!confirmed) {
                return;
            }
        }
        update({
            specimenFormType: pendingSpecimenType,
            specimens: changingType ? [] : session.specimens,
        });
        setShowSpecimenSelector(false);
    }
    function returnToSpecimenSelector() {
        setPendingSpecimenType(session.specimenFormType ?? null);
        setShowSpecimenSelector(true);
    }
    function saveSpecimens(rows) {
        update({ specimens: rows }, "review");
    }
    function handleSubmittedSurvey() {
        (0, surveySessionService_1.deleteSurveyDraft)(profile.uid, session.id);
        (0, surveySessionService_1.clearSurveySession)(profile.uid);
        openFreshSurvey();
    }
    const specimenProps = {
        siteID: session.location?.SiteID,
        draftFishRows: session.specimens,
        onBack: returnToSpecimenSelector,
        onContinueToSaveDraft: saveSpecimens,
    };
    return (<div className="data-entry-workflow">
      <header className="workflow-header">
        <div>
          <p>Data Entry</p>
          <h1>{steps.find((item) => item.id === step)?.label}</h1>
          <span>Automatically saved on this device</span>
        </div>

        <button type="button" onClick={newSurvey}>
          Start New Survey
        </button>
      </header>

      <div className="workflow-step-strip">
        {steps.map((item) => (<button key={item.id} type="button" className={step === item.id ? "active" : ""} onClick={() => goToStep(item.id)}>
            <span>{completion[item.id] ? "✓" : "○"}</span>
            {item.label}
          </button>))}
      </div>

      {step === "location" && (<LocationStep_1.default profile={profile} savedLocation={session.location} onLocationSaved={(location) => update({ location }, "survey")}/>)}

      {step === "survey" && session.location && (<SurveyInfoStep_1.default location={session.location} initialSurvey={session.survey} onBack={() => goToStep("location")} onSurveySaved={(survey) => {
                update({ survey }, "specimens");
                setPendingSpecimenType(session.specimenFormType ?? null);
                setShowSpecimenSelector(!session.specimenFormType);
            }}/>)}

      {step === "survey" && !session.location && (<Placeholder title="Location required" text="Complete the Location step before entering survey information." action={() => goToStep("location")}/>)}

      {step === "specimens" &&
            session.location &&
            session.survey &&
            showSpecimenSelector && (<SpecimenTypeSelector_1.default selectedType={pendingSpecimenType} onSelect={setPendingSpecimenType} onContinue={continueFromSpecimenSelector} onBack={() => goToStep("survey")}/>)}

      {step === "specimens" &&
            session.location &&
            session.survey &&
            !showSpecimenSelector &&
            session.specimenFormType === "standard" && (<SpecimenStandardStep_1.default {...specimenProps}/>)}

      {step === "specimens" &&
            session.location &&
            session.survey &&
            !showSpecimenSelector &&
            session.specimenFormType === "gillnet" && (<SpecimenGillnetStep_1.default {...specimenProps}/>)}

      {step === "specimens" &&
            session.location &&
            session.survey &&
            !showSpecimenSelector &&
            session.specimenFormType === "cm_tally" && (<SpecimenCMTallyStep_1.default {...specimenProps}/>)}

      {step === "specimens" &&
            (!session.location || !session.survey) && (<Placeholder title="Survey information required" text="Complete Location and Survey Information before entering specimens." action={() => goToStep(session.location ? "survey" : "location")}/>)}

      {step === "review" && (<ReviewStep_1.default session={session} onEditLocation={() => goToStep("location")} onEditSurvey={() => goToStep("survey")} onEditSpecimens={() => goToStep("specimens")} onContinue={() => goToStep("submit")}/>)}

      {step === "submit" && (<SubmitStep_1.default session={session} onBack={() => goToStep("review")} onStartNewSurvey={handleSubmittedSurvey}/>)}
    </div>);
}
function Placeholder({ title, text, action, }) {
    return (<section className="workflow-placeholder">
      <span>◇</span>
      <h2>{title}</h2>
      <p>{text}</p>

      {action && (<button type="button" onClick={action}>
          Continue
        </button>)}
    </section>);
}
//# sourceMappingURL=DataEntryWorkflow.js.map