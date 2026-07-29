import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

initializeApp();

const db = getFirestore();

type SetUserActiveStatusRequest = {
  uid?: unknown;
  active?: unknown;
};

export const setUserActiveStatus = onCall(
  {
    region: "us-east1",
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in.",
      );
    }

    const administratorUid = request.auth.uid;
    const administratorSnapshot = await db
      .collection("users")
      .doc(administratorUid)
      .get();

    if (!administratorSnapshot.exists) {
      throw new HttpsError(
        "permission-denied",
        "Administrator profile not found.",
      );
    }

    const administrator = administratorSnapshot.data();

    if (
      administrator?.role !== "admin" ||
      administrator?.active === false
    ) {
      throw new HttpsError(
        "permission-denied",
        "Only an active administrator can change account access.",
      );
    }

    const data = request.data as SetUserActiveStatusRequest;
    const uid =
      typeof data.uid === "string" ? data.uid.trim() : "";
    const active = data.active;

    if (!uid || typeof active !== "boolean") {
      throw new HttpsError(
        "invalid-argument",
        "A valid user ID and active status are required.",
      );
    }

    if (uid === administratorUid && !active) {
      throw new HttpsError(
        "failed-precondition",
        "You cannot deactivate your own account.",
      );
    }

    try {
      await getAuth().updateUser(uid, {
        disabled: !active,
      });
    } catch (error) {
      const code =
        error &&
        typeof error === "object" &&
        "code" in error
          ? String(error.code)
          : "";

      if (code.includes("user-not-found")) {
        throw new HttpsError(
          "not-found",
          "The Firebase Authentication account was not found.",
        );
      }

      throw new HttpsError(
        "internal",
        "Firebase Authentication could not update this account.",
      );
    }

    await db.collection("users").doc(uid).set(
      {
        active,
        updatedAt: FieldValue.serverTimestamp(),
        accountStatusUpdatedAt: FieldValue.serverTimestamp(),
        accountStatusUpdatedByUid: administratorUid,
      },
      { merge: true },
    );

    return {
      uid,
      active,
    };
  },
);
