import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { channelReadiness } from "@/lib/digest/channels";
import { telegramReadiness } from "@/lib/telegram/access";
import { recentDigestRuns } from "@/lib/digest/send";
import { SettingsForm } from "@/components/admin/settings-form";
import { DigestSettingsCard } from "@/components/admin/digest-settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { business, notify, digest } = await getSettings();

  // Which channels actually have credentials on this deployment. Read on the
  // server so the secrets themselves never reach the browser.
  const readiness = channelReadiness();
  const telegram = telegramReadiness();
  const runs = await recentDigestRuns(8).catch(() => []);

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="text-[20px] leading-tight font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          How the business is set up and how profit is worked out.
        </p>
      </header>

      <SettingsForm business={business} notify={notify} />

      <DigestSettingsCard
        digest={digest}
        readiness={readiness}
        telegram={telegram}
        timezone={business.timezone}
        runs={runs.map((r) => ({
          id: r.id,
          businessDate: r.businessDate,
          channel: r.channel,
          sentCount: r.sentCount,
          failedCount: r.failedCount,
          error: r.error,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
