import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
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
export const db = getFirestore(app);

export default app;