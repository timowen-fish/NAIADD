import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import type {
  UserProfile,
  UserProfileUpdate,
} from "../types/user";

const USERS_COLLECTION = "users";

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const userRef = doc(db, USERS_COLLECTION, user.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    const newProfile: UserProfile = {
      uid: user.uid,
      email: user.email ?? "",
      displayName: user.displayName ?? "",
      role: "viewer",
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };

    await setDoc(userRef, newProfile);
    return newProfile;
  }

  const existingProfile = snapshot.data() as UserProfile;

  await updateDoc(userRef, {
    email: user.email ?? "",
    displayName: user.displayName ?? existingProfile.displayName ?? "",
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  });

  return {
    ...existingProfile,
    email: user.email ?? existingProfile.email ?? "",
    displayName: user.displayName ?? existingProfile.displayName ?? "",
  };
}

export async function getUserProfile(
  uid: string,
): Promise<UserProfile | null> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    return null;
  }

  return {
    uid: snapshot.id,
    ...(snapshot.data() as Omit<UserProfile, "uid">),
  };
}

export async function listUserProfiles(): Promise<UserProfile[]> {
  const snapshot = await getDocs(collection(db, USERS_COLLECTION));

  return snapshot.docs.map((userDocument) => ({
    uid: userDocument.id,
    ...(userDocument.data() as Omit<UserProfile, "uid">),
  }));
}

export async function updateUserProfile(
  uid: string,
  updates: UserProfileUpdate,
): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);

  await updateDoc(userRef, {
    displayName: updates.displayName.trim(),
    role: updates.role,
    active: updates.active,
    updatedAt: serverTimestamp(),
  });
}
