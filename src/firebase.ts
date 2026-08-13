import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDwRKUnfgeNpd-y2gmM0575HGHilLF-Z2g",
  authDomain: "naiadd.firebaseapp.com",
  projectId: "naiadd",
  storageBucket: "naiadd.firebasestorage.app",
  messagingSenderId: "368936200425",
  appId: "1:368936200425:web:0c1e8a3442299071f62878",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

/**
 * Force Firebase Auth to persist across browser/PWA restarts.
 * This is intentionally initialized once and awaited by App/login before
 * relying on authentication state.
 */
export const authPersistenceReady = setPersistence(
  auth,
  browserLocalPersistence,
).catch((error) => {
  console.error(
    "Unable to enable persistent Firebase authentication.",
    error,
  );
  throw error;
});

export const db = getFirestore(app);

export default app;