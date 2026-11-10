"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AmbientGlow, ErrorText, GoogleSignInButton } from "@/components/ui";
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
    <main className="relative flex flex-1 items-center justify-center overflow-hidden p-8">
      <AmbientGlow />

      <div className="relative w-full max-w-[440px] rounded-3xl border border-border bg-surface px-10 py-12 text-center shadow-2xl shadow-black/40">
        <div className="mb-5 flex items-center justify-center gap-2 font-mono text-xs font-bold tracking-[0.25em] text-primary uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <span>Part of Life Client</span>
        </div>
        <h1 className="text-[34px] font-bold tracking-tight text-foreground">Knowledge</h1>
        <p className="mx-auto mt-3.5 max-w-[300px] text-sm leading-relaxed text-muted">
          A daily lesson, coding drills, new words, and articles worth reading.
        </p>
        <GoogleSignInButton pending={signingIn || loading} onClick={handleSignIn} />
        <ErrorText className="mx-auto mt-4 max-w-sm text-center">{error}</ErrorText>
        <div className="mt-7 flex items-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <span className="font-mono text-micro tracking-[0.15em] whitespace-nowrap text-muted uppercase">
            Secure sign-in
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
      </div>
    </main>
  );
}
