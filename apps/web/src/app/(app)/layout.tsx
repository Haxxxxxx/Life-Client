"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { GlobalSearch } from "@/components/global-search";
import { usePushRegistration } from "@/hooks/use-push-registration";
import { useAuth } from "@/lib/auth-context";

function icon(children: ReactNode) {
  return (
    <svg
      aria-hidden
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: icon(
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>,
    ),
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: icon(
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <polyline points="8 12 11 15 16 9" />
      </>,
    ),
  },
  {
    href: "/goals",
    label: "Goals",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.5" />
      </>,
    ),
  },
  {
    href: "/sports",
    label: "Sports",
    icon: icon(<polyline points="3 13 8 13 10 6 14 19 16 13 21 13" />),
  },
  {
    href: "/agenda",
    label: "Agenda",
    icon: icon(
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="8" y1="3" x2="8" y2="7" />
        <line x1="16" y1="3" x2="16" y2="7" />
      </>,
    ),
  },
  {
    href: "/music",
    label: "Music",
    icon: icon(
      <>
        <path d="M10 17 V5 L20 3 V15" />
        <circle cx="7" cy="17" r="3" />
        <circle cx="17" cy="15" r="3" />
      </>,
    ),
  },
  {
    href: "/money",
    label: "Money",
    icon: icon(
      <>
        <rect x="3" y="7" width="18" height="12" rx="2" />
        <path d="M3 10 H21" />
        <circle cx="16.5" cy="14" r="1.2" />
      </>,
    ),
  },
  {
    href: "/integrations",
    label: "Integrations",
    icon: icon(
      <>
        <path d="M9 3 V8 M15 3 V8 M6 8 H18 V12 A6 6 0 0 1 6 12 V8 Z" />
        <line x1="12" y1="18" x2="12" y2="21" />
      </>,
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: icon(
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20 C4 15.5 7.5 13 12 13 C16.5 13 20 15.5 20 20" />
      </>,
    ),
  },
];

// Knowledge lives in its own deployable app (apps/knowledge) — link out to it
// rather than rendering it as an internal route.
const KNOWLEDGE_APP_URL = process.env.NEXT_PUBLIC_KNOWLEDGE_APP_URL;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOutUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  usePushRegistration(user?.uid);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center gap-2 font-mono text-xs uppercase tracking-widest text-muted">
        <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
        Loading…
      </main>
    );
  }

  const initial = (user.displayName || user.email || "?").charAt(0).toUpperCase();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="sticky top-0 z-10 flex max-h-screen shrink-0 flex-col justify-between overflow-y-auto border-b border-border bg-surface p-4 md:h-screen md:w-64 md:border-r md:border-b-0 md:p-6">
        <div className="flex flex-col gap-6">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary font-mono text-sm font-bold text-primary-foreground">
              L
            </span>
            <span className="text-[15px] font-bold tracking-tight text-foreground">Life Client</span>
          </Link>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-xl border border-border px-3.5 py-2.5 text-sm text-muted transition hover:border-border-strong hover:text-foreground"
          >
            {icon(
              <>
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.2" y2="16.2" />
              </>,
            )}
            <span className="flex-1 text-left">Search…</span>
            <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px]">⌘K</span>
          </button>

          <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
            {NAV_ITEMS.map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                    active ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
            {KNOWLEDGE_APP_URL && (
              <>
                <div className="mx-3.5 my-2 hidden h-px bg-border md:block" />
                <a
                  href={KNOWLEDGE_APP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
                >
                  <span>Knowledge</span>
                  {icon(
                    <>
                      <path d="M7 17 L17 7" />
                      <path d="M9 7 H17 V15" />
                    </>,
                  )}
                </a>
              </>
            )}
          </nav>
        </div>
        <div className="mt-4 flex items-center gap-3 border-t border-border pt-4 md:mt-6">
          {user.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoURL} alt="" className="h-9 w-9 shrink-0 rounded-full" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/80 font-mono text-sm font-bold text-primary-foreground">
              {initial}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{user.displayName || user.email}</p>
            <button type="button" onClick={() => signOutUser()} className="text-xs text-muted hover:text-foreground">
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
