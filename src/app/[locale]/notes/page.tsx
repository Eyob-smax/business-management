import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { canSignIn, canWrite, getAuthedUser } from "@/lib/auth";
import { getBusinessSettings } from "@/lib/settings";
import { listNoteThreads } from "@/lib/notes";
import { addDays, businessDateOf } from "@/lib/dates";
import { AppHeader } from "@/components/shell/app-header";
import { RoleNav } from "@/components/shell/role-nav";
import { NoteBoard } from "@/components/notes/note-board";

/** The browser tab, in the reader's own language. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("notes") };
}

/**
 * Shared board for both roles. Shows the last 60 days plus anything pinned,
 * which keeps it useful without turning into an endless scroll.
 */
export default async function NotesPage() {
  const user = await getAuthedUser();
  if (!user) redirect("/login");
  if (!canSignIn(user.accessLevel)) redirect("/login?blocked=1");

  const business = await getBusinessSettings();
  const t = await getTranslations("Notes");
  const todayKey = businessDateOf(new Date(), business.timezone, business.dayCutoffHour);

  const threads = await listNoteThreads({
    from: addDays(todayKey, -60),
    to: todayKey,
    limit: 80,
  });

  return (
    <div className="min-h-dvh">
      <AppHeader
        title={t("headerTitle")}
        subtitle={t("headerSubtitle")}
        user={user}
        backHref={user.role === "admin" ? "/admin" : "/staff"}
        showBell={user.role === "admin"}
      />

      <main className="mx-auto max-w-3xl px-4 pt-3 pb-20">
        <NoteBoard
          threads={threads}
          currentUser={user}
          noteDate={todayKey}
          canPost={canWrite(user.accessLevel)}
        />
      </main>

      <RoleNav role={user.role} />
    </div>
  );
}
