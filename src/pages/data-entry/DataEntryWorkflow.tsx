import { useEffect, useMemo, useRef, useState } from "react";
import type { UserProfile } from "../../types/user";
import type {
  DataEntryStep,
  SpecimenFormType,
  SurveySession,
} from "../../types/surveySession";
import LocationStep from "./LocationStep";
import SurveyInfoStep from "./SurveyInfoStep";
import SpecimenTypeSelector from "./SpecimenTypeSelector";
import type { MusselObservationTable } from "./SpecimenStandardStep";
import StandardMusselProcessingStep from "./StandardMusselProcessingStep";
import QuadsStep from "./QuadsStep";
import MusselramaStep from "./MusselramaStep";
import ReviewStep from "./ReviewStep";
import SubmitStep from "./SubmitStep";
import {
  clearSurveySession,
  createSurveySession,
  deleteSurveyDraft,
  loadSurveySession,
  saveSurveySession,
  WORKFLOW_SESSION_EVENT,
  WORKFLOW_STEP_EVENT,
} from "../../services/surveySessionService";
import "../../styles/DataEntryWorkflow.css";

const steps: Array<{ id: DataEntryStep; label: string }> = [
  { id: "location", label: "Location" },
  { id: "survey", label: "Survey Information" },
  { id: "specimens", label: "Specimens" },
  { id: "review", label: "Review" },
  { id: "submit", label: "Submit" },
];

function loadNormalizedSession(ownerUid: string): SurveySession {
  const loaded = loadSurveySession(ownerUid);

  return {
    ...loaded,
    specimenFormType: loaded.specimenFormType ?? null,
    specimens: Array.isArray(loaded.specimens) ? loaded.specimens : [],
  };
}

export default function DataEntryWorkflow({
  profile,
}: {
  profile: UserProfile;
}) {
  const [session, setSession] = useState<SurveySession>(() =>
    loadNormalizedSession(profile.uid),
  );
  const activeSessionIdRef = useRef(session.id);
  const [step, setStep] = useState<DataEntryStep>(
    () => loadNormalizedSession(profile.uid).currentStep,
  );
  const [showSpecimenSelector, setShowSpecimenSelector] = useState(
    () => !loadNormalizedSession(profile.uid).specimenFormType,
  );
  const [pendingSpecimenType, setPendingSpecimenType] =
    useState<SpecimenFormType | null>(
      () => loadNormalizedSession(profile.uid).specimenFormType ?? null,
    );

  useEffect(() => {
    activeSessionIdRef.current = session.id;
    saveSurveySession(session);
  }, [session]);

  useEffect(() => {
    const handleActivatedSession = (event: Event): void => {
      const activated = (event as CustomEvent<SurveySession | undefined>)
        .detail;

      if (!activated || activated.ownerUid !== profile.uid) {
        return;
      }

      /*
       * saveSurveySession() broadcasts WORKFLOW_SESSION_EVENT after every
       * normal Data Entry save. DataEntryWorkflow is itself the source of
       * those saves, so re-loading the same session here creates a render /
       * save / event loop and can blank the application after advancing from
       * Location to Survey Information.
       *
       * Only react when a DIFFERENT saved draft has been activated from
       * outside this workflow (for example, Continue Editing on Drafts).
       */
      if (activated.id === activeSessionIdRef.current) {
        return;
      }

      const next = {
        ...activated,
        specimenFormType: activated.specimenFormType ?? null,
        specimens: Array.isArray(activated.specimens)
          ? activated.specimens
          : [],
      };

      activeSessionIdRef.current = next.id;
      setSession(next);
      setStep(next.currentStep);
      setPendingSpecimenType(next.specimenFormType);
      setShowSpecimenSelector(!next.specimenFormType);
    };

    window.addEventListener(
      WORKFLOW_SESSION_EVENT,
      handleActivatedSession,
    );

    return () => {
      window.removeEventListener(
        WORKFLOW_SESSION_EVENT,
        handleActivatedSession,
      );
    };
  }, [profile.uid]);

  function update(
    patch: Partial<SurveySession>,
    nextStep?: DataEntryStep,
  ): void {
    setSession((current) => ({
      ...current,
      ...patch,
      currentStep: nextStep ?? current.currentStep,
      specimenFormType:
        patch.specimenFormType !== undefined
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

  function openFreshSurvey(): void {
    const fresh = createSurveySession(profile.uid);

    setSession({
      ...fresh,
      specimenFormType: null,
      specimens: [],
    });
    setStep("location");
    setPendingSpecimenType(null);
    setShowSpecimenSelector(true);
  }

  useEffect(() => {
    const listener = (event: Event): void => {
      const requested = (event as CustomEvent<DataEntryStep>).detail;

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

    window.addEventListener(WORKFLOW_STEP_EVENT, listener);

    return () => {
      window.removeEventListener(WORKFLOW_STEP_EVENT, listener);
    };
  }, [session.specimenFormType]);

  const completion = useMemo(
    () => ({
      location: Boolean(session.location),
      survey: Boolean(session.survey),
      specimens: Boolean(
        session.specimenFormType && session.specimens.length > 0,
      ),
      review: Boolean(
        session.location &&
          session.survey &&
          session.specimenFormType &&
          session.specimens.length > 0,
      ),
      submit: false,
    }),
    [session],
  );

  function newSurvey(): void {
    const confirmed = window.confirm(
      "Start a new survey? Your current survey will remain available on the Drafts page.",
    );

    if (!confirmed) {
      return;
    }

    clearSurveySession(profile.uid);
    openFreshSurvey();
  }

  function goToStep(nextStep: DataEntryStep): void {
    if (nextStep === "specimens") {
      setPendingSpecimenType(session.specimenFormType ?? null);
      setShowSpecimenSelector(!session.specimenFormType);
    }

    update({}, nextStep);
  }

  function continueFromSpecimenSelector(): void {
    if (!pendingSpecimenType) {
      return;
    }

    const changingType =
      Boolean(session.specimenFormType) &&
      session.specimenFormType !== pendingSpecimenType;

    if (changingType && session.specimens.length > 0) {
      const confirmed = window.confirm(
        "Changing specimen entry methods will clear the specimen rows already entered for this survey. Continue?",
      );

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

  function returnToSpecimenSelector(): void {
    setPendingSpecimenType(session.specimenFormType ?? null);
    setShowSpecimenSelector(true);
  }

  function saveSpecimens(rows: MusselObservationTable[]): void {
    update({ specimens: rows }, "review");
  }

  function handleSubmittedSurvey(): void {
    deleteSurveyDraft(profile.uid, session.id);
    clearSurveySession(profile.uid);
    openFreshSurvey();
  }

  const specimenProps = {
    siteID: session.location?.SiteID,
    draftMusselRows: session.specimens as MusselObservationTable[],
    onBack: returnToSpecimenSelector,
    onContinueToSaveDraft: saveSpecimens,
  };

  return (
    <div className="data-entry-workflow">
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
        {steps.map((item) => (
          <button
            key={item.id}
            type="button"
            className={step === item.id ? "active" : ""}
            onClick={() => goToStep(item.id)}
          >
            <span>{completion[item.id] ? "✓" : "○"}</span>
            {item.label}
          </button>
        ))}
      </div>

      {step === "location" && (
        <LocationStep
          profile={profile}
          savedLocation={session.location}
          onLocationSaved={(location) =>
            update({ location }, "survey")
          }
        />
      )}

      {step === "survey" && session.location && (
        <SurveyInfoStep
          location={session.location}
          initialSurvey={session.survey}
          onBack={() => goToStep("location")}
          onSurveySaved={(survey) => {
            update({ survey }, "specimens");
            setPendingSpecimenType(
              session.specimenFormType ?? null,
            );
            setShowSpecimenSelector(!session.specimenFormType);
          }}
        />
      )}

      {step === "survey" && !session.location && (
        <Placeholder
          title="Location required"
          text="Complete the Location step before entering survey information."
          action={() => goToStep("location")}
        />
      )}

      {step === "specimens" &&
        session.location &&
        session.survey &&
        showSpecimenSelector && (
          <SpecimenTypeSelector
            selectedType={pendingSpecimenType}
            onSelect={setPendingSpecimenType}
            onContinue={continueFromSpecimenSelector}
            onBack={() => goToStep("survey")}
          />
        )}

      {step === "specimens" &&
        session.location &&
        session.survey &&
        !showSpecimenSelector &&
        session.specimenFormType === "standard_mussel" && (
          <StandardMusselProcessingStep {...specimenProps} />
        )}

      {step === "specimens" &&
        session.location &&
        session.survey &&
        !showSpecimenSelector &&
        session.specimenFormType === "quads" && (
          <QuadsStep {...specimenProps} />
        )}

      {step === "specimens" &&
        session.location &&
        session.survey &&
        !showSpecimenSelector &&
        session.specimenFormType === "musselrama" && (
          <MusselramaStep {...specimenProps} />
        )}

      {step === "specimens" &&
        (!session.location || !session.survey) && (
          <Placeholder
            title="Survey information required"
            text="Complete Location and Survey Information before entering specimens."
            action={() =>
              goToStep(
                session.location ? "survey" : "location",
              )
            }
          />
        )}

      {step === "review" && (
        <ReviewStep
          session={session}
          onEditLocation={() => goToStep("location")}
          onEditSurvey={() => goToStep("survey")}
          onEditSpecimens={() => goToStep("specimens")}
          onContinue={() => goToStep("submit")}
        />
      )}

      {step === "submit" && (
        <SubmitStep
          session={session}
          onBack={() => goToStep("review")}
          onStartNewSurvey={handleSubmittedSurvey}
        />
      )}
    </div>
  );
}

function Placeholder({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: () => void;
}) {
  return (
    <section className="workflow-placeholder">
      <span>◇</span>
      <h2>{title}</h2>
      <p>{text}</p>

      {action && (
        <button type="button" onClick={action}>
          Continue
        </button>
      )}
    </section>
  );
}
