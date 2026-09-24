import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * Shared retro-brutalist primitives for the Knowledge app — mirrors
 * apps/web/src/components/ui.tsx so both surfaces read as one product.
 */

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const CARD_BASE = "rounded-md border-2 border-foreground bg-surface";

export function cardClassName(opts: { padding?: "sm" | "md" | "lg"; className?: string } = {}) {
  const { padding = "md", className } = opts;
  const pad = padding === "sm" ? "p-3" : padding === "lg" ? "p-5" : "p-4";
  return cx(CARD_BASE, pad, className);
}

export function Card({
  padding = "md",
  className,
  ...rest
}: { padding?: "sm" | "md" | "lg" } & ComponentPropsWithoutRef<"div">) {
  return <div className={cardClassName({ padding, className })} {...rest} />;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("font-mono text-xs font-bold tracking-[0.2em] text-primary uppercase", className)}>
      {children}
    </p>
  );
}

export function SectionHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <Eyebrow className="tracking-[0.3em]">{eyebrow}</Eyebrow>
        <h2 className="mt-1 text-xl font-bold tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "border-foreground bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--foreground)] active:translate-y-0 active:shadow-none",
  secondary:
    "border-foreground bg-surface text-foreground shadow-[2px_2px_0_0_var(--foreground)] hover:-translate-y-0.5 hover:bg-accent/15 active:translate-y-0 active:shadow-none",
  ghost: "border-transparent text-muted hover:border-foreground/30 hover:text-foreground",
  danger: "border-danger bg-danger/10 text-danger hover:bg-danger/20",
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
}: { variant?: ButtonVariant; size?: ButtonSize } & ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border-2 font-bold transition disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      {...rest}
    />
  );
}

export type BadgeTone = "neutral" | "primary" | "success" | "danger" | "warning" | "info";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "border-foreground/30 text-muted",
  primary: "border-primary text-primary",
  success: "border-success text-success",
  danger: "border-danger text-danger",
  warning: "border-warning text-warning",
  info: "border-info text-info",
};

export function Badge({
  tone = "neutral",
  className,
  ...rest
}: { tone?: BadgeTone } & ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cx(
        "rounded-full border-2 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide",
        BADGE_TONE[tone],
        className,
      )}
      {...rest}
    />
  );
}

const FIELD_BASE =
  "rounded-md border-2 border-foreground bg-background outline-none transition focus:shadow-[2px_2px_0_0_var(--primary)] disabled:opacity-50";

export function Input({ className, ...rest }: ComponentPropsWithoutRef<"input">) {
  return <input className={cx(FIELD_BASE, "px-3 py-2 text-sm placeholder:text-muted", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentPropsWithoutRef<"textarea">) {
  return (
    <textarea className={cx(FIELD_BASE, "resize-y px-3 py-2 text-sm placeholder:text-muted", className)} {...rest} />
  );
}

export function ErrorText({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return <p className={cx("text-sm text-danger", className)}>{children}</p>;
}

export function ProgressBar({ progress }: { progress: number }) {
  const pct = Math.min(100, Math.max(0, progress * 100));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full border-2 border-foreground bg-background">
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
