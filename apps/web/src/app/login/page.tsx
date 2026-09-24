"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorText } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
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
    <main className="relative flex flex-1 items-center justify-center overflow-hidden p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-56 -right-40 h-[620px] w-[620px] rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--primary) 28%, transparent), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-64 -left-56 h-[720px] w-[720px] rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--primary) 12%, transparent), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
      />

      <div className="relative w-full max-w-[440px] rounded-3xl border border-border bg-surface px-10 py-12 text-center shadow-2xl shadow-black/40">
        <div className="mb-5 flex items-center justify-center gap-2 font-mono text-xs font-bold tracking-[0.25em] text-primary uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <span>Life OS · Est. 2026</span>
        </div>
        <h1 className="text-[34px] font-bold tracking-tight text-foreground">
          Life <span className="text-primary">Client</span>
        </h1>
        <p className="mx-auto mt-3.5 max-w-[300px] text-sm leading-relaxed text-muted">
          Tasks, sports, dev activity, and your agenda — one calm dashboard for your whole life.
        </p>
        <button
          type="button"
          onClick={handleSignIn}
          disabled={signingIn || loading}
          className="mt-8 flex w-full items-center justify-center gap-2.5 rounded-2xl border border-border-strong bg-foreground px-5 py-3.5 text-sm font-semibold text-[#161310] transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          <span
            aria-hidden
            className="h-[18px] w-[18px] shrink-0 rounded-full"
            style={{ background: "conic-gradient(from 90deg, #4285F4, #34A853, #FBBC05, #EA4335, #4285F4)" }}
          />
          <span>{signingIn ? "Signing in…" : "Continue with Google"}</span>
        </button>
        <ErrorText className="mx-auto mt-4 max-w-sm text-center">{error}</ErrorText>
        <div className="mt-7 flex items-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <span className="font-mono text-[10px] tracking-[0.15em] whitespace-nowrap text-muted uppercase">
            Secure sign-in
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
      </div>
    </main>
  );
}
