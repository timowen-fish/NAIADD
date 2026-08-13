import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth, authPersistenceReady } from "../firebase";

export async function loginWithEmailPassword(
  email: string,
  password: string,
): Promise<void> {
  await authPersistenceReady;
  await signInWithEmailAndPassword(auth, email, password);
}

export async function requestPasswordReset(email: string): Promise<void> {
  await authPersistenceReady;
  await sendPasswordResetEmail(auth, email);
}

export async function logout(): Promise<void> {
  await authPersistenceReady;
  await signOut(auth);
}
