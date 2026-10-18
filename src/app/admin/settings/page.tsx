import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageHeader title="Settings" subtitle="Tutorial videos and details clients see during onboarding." />
      <SettingsForm initial={settings} />
    </div>
  );
}
