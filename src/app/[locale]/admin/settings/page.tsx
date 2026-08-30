import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { business, notify } = await getSettings();

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="text-[20px] leading-tight font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          How the business is set up and how profit is worked out.
        </p>
      </header>

      <SettingsForm business={business} notify={notify} />
    </div>
  );
}
