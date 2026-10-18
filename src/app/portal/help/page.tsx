import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import type { RequestCategory, SupportRequest } from "@/lib/types";
import { PageHeader, buttonClass } from "@/components/ui";
import { Section } from "@/components/blocks";
import { Icon } from "@/components/icons";
import { NewRequestForm } from "@/components/request-forms";
import { RequestList } from "@/components/request-list";

export const metadata: Metadata = { title: "Help" };

const FAQS: [string, string][] = [
  ["How do I approve a Reel or post?", "Open Marketing → Content and choose anything marked “Needs your approval”. Tap Approve, or Request changes and tell us what to change."],
  ["Where do my inquiries come from?", "Your website form sends them in automatically. Inquiries from WhatsApp, Messenger or calls are added by Safari Digital. Mark each one as Contacted, Booked or Closed so your results stay accurate."],
  ["Why do the ad inquiries differ from my Inquiries list?", "Meta counts inquiries its own way (for example, within a set time after someone saw an ad). Your Inquiries list counts every inquiry we tracked, from every source."],
  ["Can I change my website myself?", "Yes, for safari packages, photos and text: see the training videos under Website → Management. For anything else, send a website change request."],
  ["Do you need my Facebook password?", "Never. You give Safari Digital access through Meta Business Suite, and you can remove it at any time."],
];

export default async function HelpPage() {
  const { company } = await getPortalContext();
  if (!company) redirect("/portal");
  const supabase = await createClient();
  const [{ data }, settings] = await Promise.all([
    supabase.from("requests").select("*").eq("client_id", company.id).order("last_message_at", { ascending: false }).limit(50),
    getSettings(),
  ]);
  const requests = (data ?? []) as SupportRequest[];
  const wa = settings.support_whatsapp?.replace(/[^\d]/g, "");
  const categories: RequestCategory[] = company.website_package ? ["support", "website_change", "problem"] : ["support", "problem"];

  return (
    <>
      <PageHeader title="Help" subtitle="Ask us anything. We usually reply within one working day." />
      {wa && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-line px-4 py-3.5">
          <span className="flex min-w-[200px] flex-1 flex-col"><span className="font-semibold">Need us quickly?</span><span className="text-[13px] text-slate">Message Safari Digital on WhatsApp.</span></span>
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}><Icon name="whatsapp" size={16} />WhatsApp us</a>
        </div>
      )}
      <div className="flex flex-wrap gap-8">
        <div className="flex min-w-[280px] flex-[1_1_380px] flex-col gap-8">
          <Section title="Send a request">
            <NewRequestForm clientId={company.id} categories={categories} placeholder="What do you need? Add links or screenshots if they help." />
          </Section>
          <Section title="Your requests">
            {requests.length === 0 ? <p className="text-[13px] text-slate">You haven&apos;t sent any requests yet.</p> : <RequestList items={requests} hrefBase="/portal/requests" />}
          </Section>
        </div>
        <Section title="Questions">
          <div className="flex min-w-[260px] flex-[1_1_280px] flex-col">
            {FAQS.map(([q, a]) => (
              <details key={q} className="group border-t border-line-soft py-3 first:border-t-0">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span className="flex justify-between gap-3">{q}<span className="text-slate group-open:rotate-90">›</span></span>
                </summary>
                <p className="mt-1.5 text-body">{a}</p>
              </details>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
