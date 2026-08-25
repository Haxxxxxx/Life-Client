import { initFirebaseApp } from "@life-client/shared";
import type { FirebaseApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";
import { type Firestore, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Every consumer of `auth`/`db` in this app touches them only from useEffect or
// event handlers (never at module/render scope), so it's safe to skip creating
// real Firebase clients during server-side prerendering — this also stops the
// production build from failing before NEXT_PUBLIC_FIREBASE_* env vars exist.
const isBrowser = typeof window !== "undefined";

export const firebaseApp: FirebaseApp | null = isBrowser ? initFirebaseApp(firebaseConfig) : null;
export const auth: Auth = isBrowser ? getAuth(firebaseApp!) : (null as unknown as Auth);
export const db: Firestore = isBrowser ? getFirestore(firebaseApp!) : (null as unknown as Firestore);

export const FUNCTIONS_BASE_URL = process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ?? "";
