import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./settings-form";
import { WebsiteTutorials } from "./tutorials";
import { createClient } from "@/lib/supabase/server";
import { emailConfigured } from "@/lib/email";
import { Badge } from "@/components/ui";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  const supabase = await createClient();
  const { data: tuts } = await supabase.from("tutorials").select("id, title, url").order("sort").order("created_at");
  const email = emailConfigured();
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageHeader title="Settings" subtitle="Tutorial videos, contact details and notifications." />
      <SettingsForm initial={settings} />
      <section className="flex flex-col gap-4 border-t border-line-soft pt-6">
        <h2 className="text-[15px] font-semibold">Website training</h2>
        <WebsiteTutorials items={(tuts ?? []) as { id: string; title: string; url: string }[]} />
      </section>
      <section className="flex flex-col gap-3 border-t border-line-soft pt-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Email notifications</h2>
          {email ? <Badge tone="green">Sending</Badge> : <Badge tone="amber">Not connected</Badge>}
        </div>
        <p className="text-[13px] text-body">
          {email
            ? "Emails go out through Resend for the events below."
            : "Nothing is emailed yet. Add RESEND_API_KEY and EMAIL_FROM in Vercel → Settings → Environment Variables, then redeploy. Everything else works without it."}
        </p>
        <div className="grid gap-4 text-[13px] sm:grid-cols-2">
          <div><p className="mb-1 font-medium">Clients are emailed when</p><ul className="list-disc pl-5 text-body"><li>content needs their approval</li><li>you ask for missing onboarding details</li><li>a website design is ready to review</li><li>you reply to or complete a request</li></ul></div>
          <div><p className="mb-1 font-medium">You are emailed when</p><ul className="list-disc pl-5 text-body"><li>a client submits onboarding</li><li>a client asks for content changes</li><li>a client approves or comments on a design</li><li>a client sends or replies to a request</li></ul></div>
        </div>
      </section>
    </div>
  );
}
