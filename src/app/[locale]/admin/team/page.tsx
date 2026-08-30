import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listTeam } from "@/lib/team";
import { TeamManager } from "@/components/admin/team-manager";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const admin = await requireAdmin();
  const members = await listTeam();

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="text-[20px] leading-tight font-bold tracking-tight text-ink">
          Team & codes
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          Who can sign in, what they can see, and their sign-in codes.
        </p>
      </header>

      <TeamManager members={members} currentUserId={admin.id} />
    </div>
  );
}
