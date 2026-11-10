export * from "./types";
export * from "./firebase";
export * from "./tasks";
export * from "./sports";
export * from "./integrations";
export * from "./devActivity";
export * from "./prOutcome";
export * from "./calendar";
export * from "./calendarApi";
export * from "./characteristics";
export * from "./reminders";
export * from "./knowledge";
export * from "./knowledgeApi";
export * from "./remindersApi";
export * from "./spotify";
export * from "./spotifyApi";
export * from "./challenges";
export * from "./goals";
export * from "./pushTokens";
export * from "./recurrence";
export * from "./finance";
export * from "./streaks";
export * from "./vices";
// Supabase data layer (migration in progress — docs/supabase-migration-plan.md).
// Names are `*Sb`-suffixed so they sit alongside the Firestore helpers.
export * from "./supabase";
// Backend-agnostic facade — `data.subscribeTasks(uid, cb)` etc. Namespaced to
// avoid clashing with the direct Firestore exports during the transition.
export * as data from "./data";
// Setup entry points are also top-level (like initFirebaseApp) — no name clash.
export { configureDataBackend, isDataBackendConfigured, type DataBackend } from "./data/backend";
