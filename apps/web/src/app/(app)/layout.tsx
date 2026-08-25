"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks", label: "Tasks" },
  { href: "/sports", label: "Sports" },
  { href: "/integrations", label: "Integrations" },
  { href: "/profile", label: "Profile" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOutUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center font-mono text-xs uppercase tracking-widest text-muted">
        Loading…
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col justify-between border-b-2 border-foreground bg-surface p-4 md:w-56 md:border-b-0 md:border-r-2 md:p-6">
        <div>
          <p className="mb-6 text-lg font-bold tracking-tight">
            Life <span className="text-primary">Client</span>
          </p>
          <nav className="flex gap-2 md:flex-col">
            {NAV_ITEMS.map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md border-2 px-3 py-2 font-mono text-xs font-bold tracking-wide uppercase transition ${
                    active
                      ? "border-foreground bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)]"
                      : "border-transparent text-muted hover:border-foreground/30 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="mt-6 hidden items-center gap-3 md:flex">
          {user.photoURL && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoURL}
              alt=""
              className="h-8 w-8 rounded-full border-2 border-foreground"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.displayName ?? user.email}</p>
            <button
              type="button"
              onClick={() => signOutUser()}
              className="font-mono text-xs text-primary hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
