"use client";
/**
 * Thumb-reach navigation. Fixed to the bottom, safe-area aware, labels always
 * visible (icon-only bars are a guessing game for occasional users).
 */
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Also mark active for these path prefixes. */
  match?: string[];
  badge?: number;
};

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  const isActive = (item: NavItem) => {
    if (pathname === item.href) return true;
    const prefixes = item.match ?? [item.href];
    return prefixes.some((p) => p !== "/" && pathname.startsWith(p + "/"));
  };

  return (
    <nav
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/92 backdrop-blur-lg"
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-3xl items-stretch">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 transition-colors",
                  active ? "text-brand" : "text-ink-3 active:text-ink-2",
                )}
              >
                {active ? (
                  <span className="absolute top-0 h-[2.5px] w-8 rounded-full bg-brand" />
                ) : null}
                <span className="relative">
                  {item.icon}
                  {item.badge ? (
                    <span className="nums absolute -top-1.5 -right-2 flex min-w-4 items-center justify-center rounded-full bg-loss px-1 text-[10px] font-bold text-white">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span className="text-[10.5px] font-semibold tracking-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
