import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * Shared dark command-center primitives for the Knowledge app: soft
 * borders, calm surfaces, one warm accent. Every page should build on these
 * instead of re-declaring the same card/badge/button classes.
 */

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

const CARD_BASE = "rounded-2xl border border-border bg-surface";
const CARD_INTERACTIVE =
  "transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-xl hover:shadow-black/20";

export function cardClassName(opts: { padding?: "sm" | "md" | "lg"; interactive?: boolean; className?: string } = {}) {
  const { padding = "md", interactive = false, className } = opts;
  const pad = padding === "sm" ? "p-3" : padding === "lg" ? "p-5" : "p-4";
  return cx(CARD_BASE, pad, interactive && cx(CARD_INTERACTIVE, "shadow-lg shadow-black/10"), className);
}

export function Card({
  padding = "md",
  className,
  ...rest
}: { padding?: "sm" | "md" | "lg" } & ComponentPropsWithoutRef<"div">) {
  return <div className={cardClassName({ padding, className })} {...rest} />;
}

export function CardLink({
  padding = "lg",
  className,
  ...rest
}: { padding?: "sm" | "md" | "lg" } & ComponentPropsWithoutRef<typeof Link>) {
  return <Link className={cardClassName({ padding, interactive: true, className })} {...rest} />;
}

export function CardExternalLink({
  padding = "lg",
  className,
  ...rest
}: { padding?: "sm" | "md" | "lg" } & ComponentPropsWithoutRef<"a">) {
  return (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className={cardClassName({ padding, interactive: true, className })}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("font-mono text-xs font-bold tracking-[0.2em] text-primary uppercase", className)}>
      {children}
    </p>
  );
}

/** Small header used above a section within a page (dashboard tiles, list groups). */
export function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-0.5 text-lg font-bold tracking-tight text-foreground">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/** Top-of-page header: eyebrow + h1 + description + optional right-aligned action. */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <Eyebrow className="tracking-[0.3em]">{eyebrow}</Eyebrow>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-md shadow-black/20 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20 active:translate-y-0",
  secondary:
    "border border-border bg-surface text-foreground hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-2 active:translate-y-0",
  ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
  danger: "bg-danger/10 border border-danger/30 text-danger hover:bg-danger/15",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} & ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold transition disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

export type BadgeTone = "neutral" | "primary" | "success" | "danger" | "warning" | "info";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "border-border-strong text-muted",
  primary: "border-primary text-primary",
  success: "border-success text-success",
  danger: "border-danger text-danger",
  warning: "border-warning text-warning",
  info: "border-info text-info",
};

const BADGE_TONE_SUBTLE: Record<BadgeTone, string> = {
  neutral: "border-border-strong bg-surface-2 text-muted",
  primary: "border-primary bg-primary/10 text-primary",
  success: "border-success bg-success/10 text-success",
  danger: "border-danger bg-danger/10 text-danger",
  warning: "border-warning bg-warning/10 text-warning",
  info: "border-info bg-info/10 text-info",
};

export function Badge({
  tone = "neutral",
  subtle = false,
  className,
  ...rest
}: { tone?: BadgeTone; subtle?: boolean } & ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cx(
        "rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide",
        subtle ? BADGE_TONE_SUBTLE[tone] : BADGE_TONE[tone],
        className,
      )}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

const FIELD_BASE =
  "rounded-xl border border-border bg-background outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

const FIELD_SIZE = {
  sm: "px-2.5 py-1.5 text-sm",
  md: "px-3.5 py-2 text-sm",
};

export function Input({
  size = "md",
  className,
  ...rest
}: { size?: keyof typeof FIELD_SIZE } & Omit<ComponentPropsWithoutRef<"input">, "size">) {
  return <input className={cx(FIELD_BASE, FIELD_SIZE[size], "placeholder:text-muted", className)} {...rest} />;
}

export function Textarea({
  size = "md",
  className,
  ...rest
}: { size?: keyof typeof FIELD_SIZE } & ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={cx(FIELD_BASE, "resize-y", FIELD_SIZE[size], "placeholder:text-muted", className)} {...rest} />;
}

// ---------------------------------------------------------------------------
// Feedback / status
// ---------------------------------------------------------------------------

export function ErrorText({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return <p className={cx("text-sm text-danger", className)}>{children}</p>;
}

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("text-sm text-muted italic", className)}>{children}</p>;
}

// ---------------------------------------------------------------------------
// Data display
// ---------------------------------------------------------------------------

export function ProgressBar({ progress, tone = "primary" }: { progress: number; tone?: "primary" | BadgeTone }) {
  const pct = Math.min(100, Math.max(0, progress * 100));
  const fill =
    tone === "primary"
      ? "bg-primary"
      : {
          neutral: "bg-muted",
          primary: "bg-primary",
          success: "bg-success",
          danger: "bg-danger",
          warning: "bg-warning",
          info: "bg-info",
        }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={cx("h-full rounded-full transition-all", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const STAT_TILE_TONE: Record<"primary" | "danger" | "neutral", string> = {
  primary: "text-primary",
  danger: "text-danger",
  neutral: "",
};

export function StatTile({
  value,
  label,
  tone = "neutral",
}: {
  value: ReactNode;
  label: string;
  tone?: keyof typeof STAT_TILE_TONE;
}) {
  return (
    <div className={cardClassName({ padding: "sm", className: "text-center" })}>
      <p className={cx("text-2xl font-bold text-foreground", STAT_TILE_TONE[tone])}>{value}</p>
      <p className="font-mono text-[10px] text-muted uppercase">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth screens (login pages)
// ---------------------------------------------------------------------------

/** Decorative glow blobs + dot-grid, absolutely positioned behind a centered card. Parent needs `relative overflow-hidden`. */
export function AmbientGlow() {
  return (
    <>
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
    </>
  );
}

export function GoogleSignInButton({
  pending,
  ...rest
}: { pending: boolean } & ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      disabled={pending}
      className="mt-8 flex w-full items-center justify-center gap-2.5 rounded-2xl border border-border-strong bg-foreground px-5 py-3.5 text-sm font-semibold text-[#161310] transition hover:-translate-y-0.5 disabled:opacity-50"
      {...rest}
    >
      <span
        aria-hidden
        className="h-[18px] w-[18px] shrink-0 rounded-full"
        style={{ background: "conic-gradient(from 90deg, #4285F4, #34A853, #FBBC05, #EA4335, #4285F4)" }}
      />
      <span>{pending ? "Signing in…" : "Continue with Google"}</span>
    </button>
  );
}
