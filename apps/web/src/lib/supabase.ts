import { createSupabaseBrowserClient, type SupabaseClient } from "@life-client/shared";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Browser Supabase client, or null when the env isn't configured (mirrors `db`). */
export const supabase: SupabaseClient | null =
  url && anonKey ? createSupabaseBrowserClient(url, anonKey) : null;
