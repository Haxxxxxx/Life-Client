"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [user, loading, router]);

  async function handleSignIn() {
    setError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="rounded-2xl border-2 border-foreground bg-surface px-10 py-12 text-center shadow-[6px_6px_0_0_var(--primary)]">
        <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">
          Part of Life Client
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Knowledge</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm text-muted">
          A daily lesson, coding drills, new words, and articles worth reading.
        </p>
        <button
          type="button"
          onClick={handleSignIn}
          disabled={signingIn || loading}
          className="mt-8 rounded-full border-2 border-foreground bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--foreground)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--foreground)] active:translate-y-0 active:shadow-none disabled:opacity-50"
        >
          {signingIn ? "Signing in…" : "Continue with Google"}
        </button>
        {error && <p className="mx-auto mt-4 max-w-sm text-center text-sm text-danger">{error}</p>}
      </div>
    </main>
  );
}
