import { useState } from "react";
import type { UserProfile } from "../../types/user";
import type { LocationRecord } from "../../types/location";
import ExistingSiteStep from "./ExistingSiteStep";
import LocationStepNew from "./LocationStepNew";
import "../../styles/LocationStep.css";

type View = "menu" | "existing" | "new";

type Props = {
  profile: UserProfile;
  savedLocation?: LocationRecord | null;
  onLocationSaved: (location: LocationRecord) => void;
};

export default function LocationStep({
  profile,
  savedLocation = null,
  onLocationSaved,
}: Props) {
  const [view, setView] = useState<View>("menu");

  function handleLocationSaved(location: LocationRecord) {
    onLocationSaved(location);
  }

  if (view === "existing") {
    return (
      <ExistingSiteStep
        onBack={() => setView("menu")}
        onLocationSaved={handleLocationSaved}
      />
    );
  }

  if (view === "new") {
    return (
      <LocationStepNew
        profile={profile}
        onBack={() => setView("menu")}
        onLocationSaved={handleLocationSaved}
      />
    );
  }

  return (
    <main className="app locationChoicePage">
      <section className="stepHeader">
        <div className="stepIcon">📍</div>
        <div>
          <p className="stepKicker">Add New Survey</p>
          <h1>Step 1 — Location</h1>
          <p>
            Choose whether you want to use an existing sampling site or create a
            new one.
          </p>
        </div>
      </section>

      <section className="infoPanel">
        <div className="infoBubble">i</div>
        <ul>
          <li>
            Use an existing site if the sampling location already exists in
            NAIADD.
          </li>
          <li>Create a new site if this is a brand-new sampling location.</li>
          <li>
            Saving the selected location opens Step 2 — Survey Information.
          </li>
        </ul>
      </section>

      <section className="choiceGrid">
        <button
          type="button"
          className="choiceCard existingSiteChoice"
          onClick={() => setView("existing")}
        >
          <div className="choiceCardOverlay">
            <div className="choiceIcon">⧉</div>
            <h2>Use Existing Sampling Site</h2>
            <p>
              Select a site from the site list or map, review its stored
              details, and use it for the current survey.
            </p>
            <span>Open Existing Site Workflow →</span>
          </div>
        </button>

        <button
          type="button"
          className="choiceCard createNewSiteChoice"
          onClick={() => setView("new")}
        >
          <div className="choiceCardOverlay">
            <div className="choiceIcon">＋</div>
            <h2>Create New Sampling Site</h2>
            <p>
              Create a site using map placement, GPS, spatial details, and the
              Waterbody reference list.
            </p>
            <span>Open New Site Workflow →</span>
          </div>
        </button>
      </section>

      {savedLocation && (
        <div className="locationSavedBanner">
          <strong>Current location:</strong> {savedLocation.SiteName} —{" "}
          {savedLocation.Waterbody}
          <button type="button" onClick={() => onLocationSaved(savedLocation)}>
            Continue to Survey Information
          </button>
        </div>
      )}
    </main>
  );
}
