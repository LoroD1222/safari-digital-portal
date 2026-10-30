import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./settings-form";
import { WebsiteTutorials } from "./tutorials";
import { createClient } from "@/lib/supabase/server";
import { emailConfigured } from "@/lib/email";
import { Badge } from "@/components/ui";
import { MonthlyReports } from "./reports";
import { CompressExisting } from "./compress-existing";
import { monthBounds } from "@/lib/dates";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  const supabase = await createClient();
  const { data: tuts } = await supabase.from("tutorials").select("id, title, url").order("sort").order("created_at");
  const email = emailConfigured();
  const { data: cl } = await supabase.from("clients").select("id, name").neq("account_status", "paused").order("name");
  const lastMonth = monthBounds(-1).label.split(" ")[0];
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
          <div><p className="mb-1 font-medium">Clients are emailed when</p><ul className="list-disc pl-5 text-body"><li>a new inquiry arrives (website form, or added by you), with Reply on WhatsApp and Reply by email buttons</li><li>a new month starts: their results report</li><li>content needs their approval</li><li>you ask for missing onboarding details</li><li>a website design is ready to review</li><li>you reply to or complete a request</li></ul></div>
          <div><p className="mb-1 font-medium">You are emailed when</p><ul className="list-disc pl-5 text-body"><li>a client submits onboarding</li><li>a client asks for content changes</li><li>a client approves or comments on a design</li><li>a client sends or replies to a request</li></ul></div>
        </div>
      </section>
      <section className="flex flex-col gap-3 border-t border-line-soft pt-6">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold">Monthly reports</h2>
          <p className="text-[13px] text-slate">Every client gets last month&apos;s results by email on the 1st: inquiries, bookings, ad spend, cost per inquiry, posts and website visitors. Each client gets it once a month. Clients with no activity are skipped.</p>
        </div>
        <MonthlyReports clients={(cl ?? []) as { id: string; name: string }[]} month={lastMonth} />
      </section>
      <section className="flex flex-col gap-3 border-t border-line-soft pt-6">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold">Storage</h2>
          <p className="text-[13px] text-slate">New uploads are compressed automatically. Use this once to shrink files uploaded before that. It runs in this browser and replaces each file at the same address, so nothing breaks.</p>
        </div>
        <CompressExisting />
      </section>
    </div>
  );
}
