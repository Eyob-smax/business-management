"use client";
/**
 * Sticky top bar: where you are, whether your data is safe, and who you are.
 */
import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  LogOut,
  MessageSquare,
  Moon,
  Settings,
  Smartphone,
  Sun,
  SunMoon,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";
import { Avatar, Button, Divider, Segmented } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/overlay";
import { useTheme, type ThemeChoice } from "@/components/providers/theme-provider";
import { SyncPill } from "./sync-pill";
import { NotificationBell } from "./notification-bell";

export function AppHeader({
  title,
  subtitle,
  user,
  backHref,
  right,
  showBell,
}: {
  title: string;
  subtitle?: string;
  user: { name: string; role: "admin" | "staff"; avatar: string };
  backHref?: string;
  right?: React.ReactNode;
  showBell?: boolean;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const { theme, setTheme } = useTheme();

  return (
    <>
      <header className="pt-safe sticky top-0 z-30 border-b border-line bg-canvas/88 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-3">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="Back"
              className="-ml-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-2 transition active:scale-95"
            >
              <ChevronLeft className="size-5" />
            </Link>
          ) : null}

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[16px] leading-tight font-bold tracking-tight text-ink">
              {title}
            </h1>
            {subtitle ? (
              <p className="truncate text-[11.5px] leading-tight text-ink-3">{subtitle}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {right}
            <SyncPill />
            {showBell ? <NotificationBell /> : null}
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Account menu"
              className="ml-0.5 rounded-full transition active:scale-95"
            >
              <Avatar emoji={user.avatar} name={user.name} size={32} />
            </button>
          </div>
        </div>
      </header>

      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={user.name}
        subtitle={user.role === "admin" ? "Administrator" : "Staff"}
        size="sm"
      >
        <div className="space-y-1 pb-2">
          <MenuLink
            href="/notes"
            icon={<MessageSquare className="size-[18px]" />}
            label="Notes & messages"
            onNavigate={() => setMenuOpen(false)}
          />
          {user.role === "admin" ? (
            <>
              <MenuLink
                href="/admin/team"
                icon={<Users className="size-[18px]" />}
                label="Team & codes"
                onNavigate={() => setMenuOpen(false)}
              />
              <MenuLink
                href="/admin/settings"
                icon={<Settings className="size-[18px]" />}
                label="Settings"
                onNavigate={() => setMenuOpen(false)}
              />
              <MenuLink
                href="/shop"
                icon={<Smartphone className="size-[18px]" />}
                label="Mobile shop"
                onNavigate={() => setMenuOpen(false)}
              />
            </>
          ) : null}
          <MenuLink
            href="/change-code"
            icon={<Settings className="size-[18px]" />}
            label="Change my code"
            onNavigate={() => setMenuOpen(false)}
          />

          <Divider className="my-3" />

          <div className="px-1">
            <p className="mb-2 text-[12px] font-bold tracking-wide text-ink-3 uppercase">
              Appearance
            </p>
            <Segmented<ThemeChoice>
              value={theme}
              onChange={setTheme}
              options={[
                { value: "light", label: <Sun className="mx-auto size-4" />, hint: "Light" },
                { value: "system", label: <SunMoon className="mx-auto size-4" />, hint: "System" },
                { value: "dark", label: <Moon className="mx-auto size-4" />, hint: "Dark" },
              ]}
            />
          </div>

          <Divider className="my-3" />

          <form action={logout}>
            <Button
              type="submit"
              variant="ghost"
              block
              className="justify-start text-loss"
              icon={<LogOut className="size-[18px]" />}
            >
              Sign out
            </Button>
          </form>
        </div>
      </Sheet>
    </>
  );
}

function MenuLink({
  href,
  icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-2.5 text-[14.5px] font-medium text-ink transition",
        "hover:bg-surface-2 active:scale-[0.99]",
      )}
    >
      <span className="text-ink-3">{icon}</span>
      {label}
    </Link>
  );
}
