// Backend-agnostic data facade. `configureDataBackend({ provider, ... })` once at
// app startup, then call these without passing a db/client handle — they dispatch
// to Firestore or Supabase. Migration tracker: docs/supabase-migration-plan.md.
//
// Ported: tasks, goals.  Pending: sports, challenges, reminders, finance, vices,
// knowledge, integrations, devActivity, calendar, spotify, characteristics,
// pushTokens.
export * from "./backend";
export * from "./tasks";
export * from "./goals";
