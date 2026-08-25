import { type FirebaseApp, type FirebaseOptions, getApps, initializeApp } from "firebase/app";

export function initFirebaseApp(config: FirebaseOptions): FirebaseApp {
  const existing = getApps();
  return existing.length > 0 ? existing[0]! : initializeApp(config);
}
