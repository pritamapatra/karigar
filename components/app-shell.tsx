"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignoutButton } from "@/components/signout-button";
import { NAV, type NavId } from "@/lib/nav";
import { cn } from "@/lib/utils";

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  items,
  children,
}: {
  items: NavId[];
  children: React.ReactNode;
}) {
  const isActive = useActive();

  return (
    <div className="min-h-screen bg-white md:pl-24">
      <nav
        aria-label="Main"
        className="glass fixed inset-y-0 left-0 z-40 hidden w-24 flex-col items-center gap-2 border-y-0 border-l-0 py-6 md:flex"
      >
        <span className="bg-gold mb-4 h-8 w-8 rounded-xl" aria-hidden="true" />
        {items.map((id) => {
          const { href, label, icon: Icon } = NAV[id];
          const active = isActive(href);
          return (
            <Link
              key={id}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 w-20 flex-col items-center justify-center gap-1 rounded-2xl text-[13px] leading-[18px] font-medium",
                active
                  ? "bg-gold-wash text-gold-ink"
                  : "text-ink-2 hover:bg-surface",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
        <div className="mt-auto">
          <SignoutButton />
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[1040px] p-6 pb-28 md:pb-6">
        <div className="mb-3 flex justify-end md:hidden">
          <SignoutButton />
        </div>
        {children}
      </main>

      <nav
        aria-label="Main"
        className="glass fixed inset-x-4 bottom-4 z-40 flex justify-around rounded-full p-1 md:hidden"
      >
        {items.slice(0, 4).map((id) => {
          const { href, label, icon: Icon } = NAV[id];
          const active = isActive(href);
          return (
            <Link
              key={id}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 min-w-16 flex-col items-center justify-center rounded-full px-3 text-[12px] leading-4 font-medium",
                active ? "bg-gold-wash text-gold-ink" : "text-ink-2",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
