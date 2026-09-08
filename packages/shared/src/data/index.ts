// Backend-agnostic data facade. `configureDataBackend({ provider, firestore |
// client })` once at app startup, then call these without a db/client handle —
// they dispatch to Firestore or Supabase. Tracker: docs/supabase-migration-plan.md
export * from "./backend";
export * from "./tasks";
export * from "./goals";
export * from "./sports";
export * from "./challenges";
export * from "./reminders";
export * from "./finance";
export * from "./vices";
export * from "./calendar";
export * from "./spotify";
export * from "./devActivity";
export * from "./integrations";
export * from "./pushTokens";
export * from "./knowledge";
export * from "./characteristics";
