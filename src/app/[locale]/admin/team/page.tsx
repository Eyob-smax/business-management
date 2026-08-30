import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listTeam } from "@/lib/team";
import { TeamManager } from "@/components/admin/team-manager";
import { NeedsInternet } from "@/components/pwa/needs-internet";
import { getTranslations } from "next-intl/server";

/** The browser tab, in the reader's own language. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("team") };
}

export default async function TeamPage() {
  const admin = await requireAdmin();
  const members = await listTeam();
  const o = await getTranslations("Offline");
  const t = await getTranslations("AdminTeam");

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="text-[20px] leading-tight font-bold tracking-tight text-ink">
          {t("pageTitle")}
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          {t("pageSubtitle")}
        </p>
      </header>

      <NeedsInternet message={o("needsInternetTeam")}>
        <TeamManager members={members} currentUserId={admin.id} />
      </NeedsInternet>
    </div>
  );
}
