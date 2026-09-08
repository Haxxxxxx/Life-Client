import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client-side Supabase client. Uses the anon key — every table is guarded by RLS
 * (`user_id = auth.uid()`), so this is safe to ship to the browser / app.
 */
export function createSupabaseBrowserClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/**
 * Server-side Supabase client with the service-role key — bypasses RLS. Only for
 * trusted server contexts (sync services, cron, API routes that have already
 * verified the caller). Never expose the service-role key to a client bundle.
 */
export function createSupabaseServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type { SupabaseClient };
