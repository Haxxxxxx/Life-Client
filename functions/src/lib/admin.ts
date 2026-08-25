import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const adminApp = getApps().length > 0 ? getApps()[0]! : initializeApp();
export const db = getFirestore(adminApp);
