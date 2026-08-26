import AsyncStorage from "@react-native-async-storage/async-storage";
import { initFirebaseApp } from "@life-client/shared";
// @firebase/auth's package.json lists a top-level "types" condition ahead of its
// "react-native" condition, so tsc's declaration resolution always lands on the
// generic auth-public.d.ts, which omits getReactNativePersistence — even though
// Metro resolves the real "react-native" JS bundle correctly at runtime and it's there.
// @ts-expect-error — see comment above; real implementation exists at runtime.
import { getReactNativePersistence, initializeAuth } from "@firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// `initializeAuth`/`getFirestore` throw immediately if the config is
// missing/invalid (e.g. EXPO_PUBLIC_FIREBASE_API_KEY not set yet), which would
// otherwise crash the app before the login screen even has a chance to render.
// Treat that as an explicit "not configured" state instead.
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey);

export const firebaseApp = isFirebaseConfigured ? initFirebaseApp(firebaseConfig) : null;
export const auth = firebaseApp
  ? initializeAuth(firebaseApp, { persistence: getReactNativePersistence(AsyncStorage) })
  : null;
// ignoreUndefinedProperties lets patches omit/clear optional fields (e.g.
// `dueDate: undefined` to clear it) without Firestore throwing on the
// literal `undefined` — matches the admin SDK setting used server-side.
export const db = firebaseApp ? initializeFirestore(firebaseApp, { ignoreUndefinedProperties: true }) : null;

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

// The deployed web app's origin (e.g. https://life-client.vercel.app) — its
// /api/oauth/* routes handle the OAuth exchange; there's no separate backend.
export const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_APP_URL ?? "";

// The deployed Knowledge app's origin (e.g. https://life-client-knowledge.vercel.app) —
// its own separate Next.js deployment (apps/knowledge); its /api/knowledge/* routes
// handle AI generation.
export const KNOWLEDGE_APP_URL = process.env.EXPO_PUBLIC_KNOWLEDGE_APP_URL ?? "";
