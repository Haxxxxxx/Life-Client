import { cert, getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";

// FIREBASE_SERVICE_ACCOUNT_BASE64 is the base64-encoding of the service account
// JSON downloaded from Firebase Console -> Project settings -> Service accounts.
// Set it directly as a Vercel env var (never commit it, never paste it in chat).
function loadServiceAccount() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_BASE64 is not set — see README.md for how to generate and set it.",
    );
  }
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));
}

let cached: Firestore | null = null;

function getAdminDb(): Firestore {
  if (!cached) {
    const app = getApps().length > 0 ? getApps()[0]! : initializeApp({ credential: cert(loadServiceAccount()) });
    cached = getFirestore(app);
  }
  return cached;
}

// A lazy proxy: initializing (and thus reading FIREBASE_SERVICE_ACCOUNT_BASE64)
// only happens on first actual use, not at module-import time — Next.js loads
// this module while statically analyzing routes during `next build`, which
// runs before real env vars are available, and a throw there fails the build.
export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    const real = getAdminDb();
    const value = Reflect.get(real, prop);
    // Firestore's methods rely on internal `this` state, so a plain
    // Reflect.get would hand back a function bound to nothing (or to this
    // proxy) once called as `adminDb.method(...)` — rebind it to the real
    // instance explicitly.
    return typeof value === "function" ? value.bind(real) : value;
  },
});
