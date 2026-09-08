import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // The Supabase Vercel integration sets NEXT_SUPABASE_URL /
    // NEXT_SUPABASE_PUBLISHABLE_KEY (server-only names). The publishable key is
    // client-safe by design (RLS enforces access), so surface both to the
    // browser under the conventional NEXT_PUBLIC_ names.
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_SUPABASE_PUBLISHABLE_KEY ??
      "",
  },
};

export default nextConfig;
