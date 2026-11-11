"use client";

import { useEffect, useState } from "react";
import { TextButton } from "@/components/ui";

/**
 * Two-tap delete.
 *
 * Delete was one click and permanent on tasks, goals, challenges,
 * transactions and reading items — no confirmation, no undo. A modal is heavy
 * for a row action and `window.confirm` is a native grey box that breaks the
 * page's look, so this confirms in place: the first click arms it, the second
 * commits.
 *
 * It lives in its own module rather than ui.tsx because it needs state, and
 * ui.tsx has no "use client" directive — adding one there would make every
 * primitive in it client-only for all consumers.
 *
 * Deliberately not toast-based undo: that needs a provider, a queue, and a way
 * to reverse a Firestore delete, none of which exist yet. Worth revisiting.
 */
export function ConfirmButton({
  onConfirm,
  label = "Delete",
  confirmLabel = "Sure?",
  className,
}: {
  onConfirm: () => void;
  label?: string;
  confirmLabel?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    // Disarms itself, so a half-pressed control can't sit armed and swallow a
    // later unrelated click as a confirmation.
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <TextButton
      tone="danger"
      aria-label={armed ? `Confirm ${label.toLowerCase()}` : label}
      className={[armed ? "bg-danger/10 ring-1 ring-danger/40" : "", className].filter(Boolean).join(" ")}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </TextButton>
  );
}
