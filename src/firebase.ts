import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDpkfFb84QzFqtYq-ig9Zo90M95gt4rp3k",
  authDomain: "vadma2.firebaseapp.com",
  projectId: "vadma2",
  storageBucket: "vadma2.firebasestorage.app",
  messagingSenderId: "422493120352",
  appId: "1:422493120352:web:cac7cb5272f9e944fce005",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
