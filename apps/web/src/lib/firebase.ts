import { initFirebaseApp } from "@life-client/shared";
import type { FirebaseApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";
import { type Firestore, initializeFirestore } from "firebase/firestore";

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

// `getAuth`/`getFirestore` throw immediately if the config is missing/invalid
// (e.g. NEXT_PUBLIC_FIREBASE_API_KEY not set yet), which would otherwise crash
// the whole app before the login page even has a chance to render. Treat that
// as an explicit "not configured" state instead.
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey);
const shouldInit = isBrowser && isFirebaseConfigured;

export const firebaseApp: FirebaseApp | null = shouldInit ? initFirebaseApp(firebaseConfig) : null;
export const auth: Auth | null = shouldInit ? getAuth(firebaseApp!) : null;
// ignoreUndefinedProperties stops Firestore throwing on a literal
// `undefined` in a write — it DROPS those keys, it does not clear the stored
// field. To clear one, pass `null`; updateTask turns that into deleteField().
// Matches the admin SDK setting used server-side.
export const db: Firestore | null = shouldInit
  ? initializeFirestore(firebaseApp!, { ignoreUndefinedProperties: true })
  : null;
