// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

import { type App, cert, getApps, initializeApp } from "firebase-admin/app";
import { type Auth, getAuth } from "firebase-admin/auth";
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

let cachedApp: App | null = null;

function getAdminApp(): App {
  if (!cachedApp) {
    cachedApp = getApps().length > 0 ? getApps()[0]! : initializeApp({ credential: cert(loadServiceAccount()) });
  }
  return cachedApp;
}

// A lazy proxy: initializing (and thus reading FIREBASE_SERVICE_ACCOUNT_BASE64)
// only happens on first actual use, not at module-import time — Next.js loads
// this module while statically analyzing routes during `next build`, which
// runs before real env vars are available, and a throw there fails the build.
function lazyProxy<T extends object>(getReal: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const real = getReal();
      const value = Reflect.get(real as object, prop);
      // Methods on the real instance rely on internal `this` state, so a plain
      // Reflect.get would hand back a function bound to nothing (or to this
      // proxy) once called — rebind it to the real instance explicitly.
      return typeof value === "function" ? value.bind(real) : value;
    },
  });
}

// Optional fields (e.g. an OAuth response missing `refresh_token`/`scope`)
// naturally end up `undefined` in a patch object — Firestore's admin SDK
// otherwise throws on any `undefined` field value instead of just omitting it.
let settingsApplied = false;

function getAdminDb(): Firestore {
  const db = getFirestore(getAdminApp());
  if (!settingsApplied) {
    db.settings({ ignoreUndefinedProperties: true });
    settingsApplied = true;
  }
  return db;
}

export const adminDb: Firestore = lazyProxy(getAdminDb);
export const adminAuth: Auth = lazyProxy(() => getAuth(getAdminApp()));
