import type { UserProfile } from "../types/user";
import {
  backupSavedQueriesToHelper,
  restoreSavedQueriesFromHelper,
} from "./queryDataSessionService";
import {
  restoreSnapshotFromHelper,
  syncSnapshotIfNeeded,
} from "./snapshotService";
import { syncSurveyDrafts } from "./surveySessionService";
import { syncVadmaTheme } from "../theme/themeService";

const OFFLINE_HELPER_USER_PROFILE_URL =
  "http://127.0.0.1:43128/user-profile";

type DurableUserPackage = {
  format: "NAIADD_OFFLINE_USER_PROFILE_V1";
  uid: string;
  updatedAt: string;
  profile: UserProfile;
};

export async function saveWorkstationProfile(
  profile: UserProfile,
): Promise<boolean> {
  try {
    window.localStorage.setItem("naiadd.offlineUserUid", profile.uid);
  } catch {
    // The helper profile still remains authoritative.
  }

  try {
    const response = await fetch(OFFLINE_HELPER_USER_PROFILE_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "NAIADD_OFFLINE_USER_PROFILE_V1",
        uid: profile.uid,
        updatedAt: new Date().toISOString(),
        profile,
      } satisfies DurableUserPackage),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function loadWorkstationProfile(): Promise<UserProfile | null> {
  try {
    const response = await fetch(OFFLINE_HELPER_USER_PROFILE_URL, {
      cache: "no-store",
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as Partial<DurableUserPackage>;

    if (
      payload.format !== "NAIADD_OFFLINE_USER_PROFILE_V1" ||
      !payload.uid ||
      !payload.profile ||
      payload.profile.uid !== payload.uid
    ) {
      return null;
    }

    try {
      window.localStorage.setItem("naiadd.offlineUserUid", payload.uid);
    } catch {
      // Ignore browser storage restrictions.
    }

    return payload.profile;
  } catch {
    return null;
  }
}

export async function synchronizeUserState(
  profile: UserProfile,
): Promise<void> {
  await saveWorkstationProfile(profile);

  /*
   * Apply the durable workstation theme first so the localhost/offline UI
   * adopts the user's selected appearance before the heavier snapshot/draft
   * synchronization work begins.
   */
  await syncVadmaTheme(profile.uid).catch(() => undefined);

  await restoreSnapshotFromHelper().catch(() => false);
  await restoreSavedQueriesFromHelper(profile.uid).catch(() => []);
  await syncSurveyDrafts(profile.uid).catch(() => []);

  if (typeof navigator === "undefined" || navigator.onLine) {
    await syncSnapshotIfNeeded().catch((error) => {
      console.warn("Unable to synchronize NAIADD snapshot.", error);
    });

    await backupSavedQueriesToHelper(profile.uid).catch(() => undefined);
  }
}
