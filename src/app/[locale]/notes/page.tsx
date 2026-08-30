import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canSignIn, canWrite, getAuthedUser } from "@/lib/auth";
import { getBusinessSettings } from "@/lib/settings";
import { listNoteThreads } from "@/lib/notes";
import { addDays, businessDateOf } from "@/lib/dates";
import { AppHeader } from "@/components/shell/app-header";
import { RoleNav } from "@/components/shell/role-nav";
import { NoteBoard } from "@/components/notes/note-board";

export const metadata: Metadata = { title: "Notes & messages" };

/**
 * Shared board for both roles. Shows the last 60 days plus anything pinned,
 * which keeps it useful without turning into an endless scroll.
 */
export default async function NotesPage() {
  const user = await getAuthedUser();
  if (!user) redirect("/login");
  if (!canSignIn(user.accessLevel)) redirect("/login?blocked=1");

  const business = await getBusinessSettings();
  const todayKey = businessDateOf(new Date(), business.timezone, business.dayCutoffHour);

  const threads = await listNoteThreads({
    from: addDays(todayKey, -60),
    to: todayKey,
    limit: 80,
  });

  return (
    <div className="min-h-dvh">
      <AppHeader
        title="Notes & messages"
        subtitle="Everyone in the family can read these"
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
