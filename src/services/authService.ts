import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth, authPersistenceReady } from "../firebase";

const WORKSTATION_CREDENTIAL_URL =
  "http://127.0.0.1:43128/workstation-credential";

export type WorkstationAutoLoginResult =
  | "success"
  | "none"
  | "invalid"
  | "unavailable";

function authErrorCode(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "code" in error
    ? String(error.code)
    : "";
}

async function saveWorkstationCredential(
  email: string,
  password: string,
): Promise<void> {
  try {
    await fetch(WORKSTATION_CREDENTIAL_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        password,
      }),
    });
  } catch {
    // The helper is optional on ordinary/mobile devices.
  }
}

export async function clearWorkstationCredential(): Promise<void> {
  try {
    await fetch(WORKSTATION_CREDENTIAL_URL, {
      method: "DELETE",
    });
  } catch {
    // Helper unavailable.
  }
}

export async function loginWithEmailPassword(
  email: string,
  password: string,
): Promise<void> {
  await authPersistenceReady;
  await signInWithEmailAndPassword(auth, email, password);
  await saveWorkstationCredential(email, password);
}

export async function tryStoredWorkstationLogin(): Promise<
  WorkstationAutoLoginResult
> {
  await authPersistenceReady;

  let credential: { email?: unknown; password?: unknown };

  try {
    const response = await fetch(WORKSTATION_CREDENTIAL_URL, {
      method: "GET",
      cache: "no-store",
    });

    if (response.status === 404) return "none";
    if (!response.ok) return "unavailable";

    credential = (await response.json()) as {
      email?: unknown;
      password?: unknown;
    };
  } catch {
    return "unavailable";
  }

  if (
    typeof credential.email !== "string" ||
    typeof credential.password !== "string" ||
    !credential.email.trim() ||
    !credential.password
  ) {
    return "none";
  }

  try {
    await signInWithEmailAndPassword(
      auth,
      credential.email.trim(),
      credential.password,
    );
    return "success";
  } catch (error) {
    const code = authErrorCode(error);

    if (
      code === "auth/invalid-credential" ||
      code === "auth/wrong-password" ||
      code === "auth/user-not-found" ||
      code === "auth/user-disabled"
    ) {
      await clearWorkstationCredential();
      return "invalid";
    }

    return "unavailable";
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  await authPersistenceReady;
  await sendPasswordResetEmail(auth, email);
}

export async function logout(): Promise<void> {
  await authPersistenceReady;
  await signOut(auth);
}
