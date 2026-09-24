import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * Shared retro-brutalist primitives for the Life Client web app: thick
 * borders, hard offset shadows, mono-uppercase labels. Every page should
 * build on these instead of re-declaring the same card/badge/button classes.
 */

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

const CARD_BASE = "rounded-md border-2 border-foreground bg-surface";
const CARD_INTERACTIVE =
  "transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--foreground)] active:translate-y-0";

export function cardClassName(opts: { padding?: "sm" | "md" | "lg"; interactive?: boolean; className?: string } = {}) {
  const { padding = "md", interactive = false, className } = opts;
  const pad = padding === "sm" ? "p-3" : padding === "lg" ? "p-5" : "p-4";
  return cx(CARD_BASE, pad, interactive && cx(CARD_INTERACTIVE, "shadow-[3px_3px_0_0_var(--foreground)]"), className);
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
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
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
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{title}</h1>
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
    "border-foreground bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--foreground)] active:translate-y-0 active:shadow-none",
  secondary:
    "border-foreground bg-surface text-foreground shadow-[2px_2px_0_0_var(--foreground)] hover:-translate-y-0.5 hover:bg-accent/15 active:translate-y-0 active:shadow-none",
  ghost: "border-transparent text-muted hover:border-foreground/30 hover:text-foreground",
  danger:
    "border-danger bg-danger/10 text-danger hover:bg-danger/20",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
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
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border-2 font-mono font-bold tracking-wide uppercase transition disabled:pointer-events-none disabled:opacity-50",
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
  neutral: "border-foreground/30 text-muted",
  primary: "border-primary text-primary",
  success: "border-success text-success",
  danger: "border-danger text-danger",
  warning: "border-warning text-warning",
  info: "border-info text-info",
};

const BADGE_TONE_SUBTLE: Record<BadgeTone, string> = {
  neutral: "border-foreground/30 bg-foreground/5 text-muted",
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
        "rounded-full border-2 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide",
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
  "rounded-md border-2 border-foreground bg-background outline-none transition focus:shadow-[2px_2px_0_0_var(--primary)] disabled:opacity-50";

const FIELD_SIZE = {
  sm: "px-2 py-1.5 text-sm",
  md: "px-3 py-2 text-sm",
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
    <div className="h-3 w-full overflow-hidden rounded-full border-2 border-foreground bg-surface">
      <div className={cx("h-full transition-all", fill)} style={{ width: `${pct}%` }} />
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
      <p className={cx("text-2xl font-bold", STAT_TILE_TONE[tone])}>{value}</p>
      <p className="font-mono text-[10px] text-muted uppercase">{label}</p>
    </div>
  );
}
