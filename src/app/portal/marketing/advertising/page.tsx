import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, money, monthBounds } from "@/lib/dates";
import { adChats, CONTENT_LABEL, KIND_LABEL, type AdReport, type Campaign, type ContentItem } from "@/lib/types";
import { CONTENT_TONE } from "@/lib/status-tone";
import { MetaAdsGrid } from "@/components/meta-ads";
import type { MetaAd } from "@/lib/types";
import { Badge, EmptyState, Stat } from "@/components/ui";
import { Row, RowList, Section } from "@/components/blocks";
import { MarketingTabs } from "../tabs";

export const metadata: Metadata = { title: "Advertising" };

const CAMPAIGN_TONE = { active: "green", paused: "amber", ended: "neutral" } as const;
const CAMPAIGN_LABEL = { active: "Active", paused: "Paused", ended: "Ended" } as const;

export default async function AdvertisingPage(props: PageProps<"/portal/marketing/advertising">) {
  const { company } = await getPortalContext();
  if (!company?.marketing_package) redirect("/portal");
  const { month: wanted } = await props.searchParams;

  const supabase = await createClient();
  const [{ data }, { count: awaiting }, { data: adItems }, { data: metaRows }] = await Promise.all([
    supabase.from("ad_reports").select("*").eq("client_id", company.id).order("month", { ascending: false }).limit(24),
    supabase.from("content_items").select("id", { count: "exact", head: true }).eq("client_id", company.id).eq("status", "awaiting_approval"),
    supabase.from("content_items").select("*").eq("client_id", company.id).eq("as_ad", true).order("updated_at", { ascending: false }).limit(12),
    supabase.from("meta_ads").select("*").eq("client_id", company.id).order("created_time", { ascending: false }),
  ]);
  const metaAds = ((metaRows ?? []) as MetaAd[]).sort((a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE"));
  const liveAds = metaAds.length > 0 && (
    <Section title="Your ads">
      <p className="-mt-1 text-[13px] text-slate">Your Facebook &amp; Instagram ads, with results from the last 30 days. Updated daily.</p>
      <MetaAdsGrid ads={metaAds} />
    </Section>
  );
  const adContent = (adItems ?? []) as ContentItem[];
  const creatives = adContent.length > 0 && (
    <Section title="Ads from your content">
      <RowList>
        {adContent.map((c) => (
          <Row key={c.id}>
            <Link href={`/portal/marketing/${c.id}`} className="min-w-[180px] flex-1 font-medium text-ink no-underline hover:text-brand">{c.title}</Link>
            <span className="text-[13px] text-slate">{KIND_LABEL[c.kind]}</span>
            <Badge tone={CONTENT_TONE[c.status]}>{c.status === "awaiting_approval" ? "Needs your approval" : CONTENT_LABEL[c.status]}</Badge>
          </Row>
        ))}
      </RowList>
    </Section>
  );
  const reports = (data ?? []) as AdReport[];
  const report = reports.find((r) => r.month === wanted) ?? reports[0] ?? null;

  const header = (
    <>
      <div className="-mb-1 flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Marketing</h1>
        <MarketingTabs active="advertising" awaiting={awaiting ?? 0} />
      </div>
    </>
  );
  if (!report) {
    return (
      <>
        {header}
        {liveAds}
        {creatives}
        <EmptyState title="No advertising results yet" body="Once your Facebook & Instagram ads are running, Safari Digital adds your results here every month." />
      </>
    );
  }

  const m = monthBounds(0, new Date(report.month + "T00:00:00Z"));
  const { count: tracked } = await supabase.from("inquiries").select("id", { count: "exact", head: true })
    .eq("client_id", company.id).gte("received_at", m.start).lt("received_at", m.next);
  const spend = Number(report.meta_spend);
  const cpi = report.meta_inquiries > 0 ? spend / report.meta_inquiries : null;
  const campaigns = (report.campaigns ?? []) as Campaign[];
  const chats = adChats(campaigns);
  const forms = chats === null ? null : report.meta_inquiries - chats;

  return (
    <>
      {header}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-slate">
          <span className="font-semibold text-ink">{m.label}</span> · Facebook & Instagram ads · {report.source === "synced" ? "synced from Meta" : `entered by Safari Digital, updated ${fmtDate(report.updated_at)}`}
        </p>
        {reports.length > 1 && (
          <form className="flex items-center gap-2">
            <label htmlFor="month" className="sr-only">Month</label>
            <select id="month" name="month" defaultValue={report.month} className="h-9 rounded-control border border-field bg-white px-2.5 text-[13px]">
              {reports.map((r) => <option key={r.month} value={r.month}>{monthBounds(0, new Date(r.month + "T00:00:00Z")).label}</option>)}
            </select>
            <button className="h-9 rounded-control border border-field px-3 text-[13px] font-medium hover:bg-[#F4F5F2]">Show</button>
          </form>
        )}
      </div>
      <section aria-label="Results" className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <Stat label="Ad spend" value={money(spend)} note="Facebook & Instagram" />
        <Stat label="Inquiries from ads" value={report.meta_inquiries} note={chats === null ? "As reported by Meta" : `${forms} form ${forms === 1 ? "lead" : "leads"} + ${chats} ${chats === 1 ? "chat" : "chats"}`} />
        {chats !== null && <Stat label="Chats from ads" value={chats} note="Instagram, Messenger & WhatsApp messages started from your ads" />}
        <Stat label="Cost per inquiry" value={cpi === null ? "—" : money(Math.round(cpi * 100) / 100)} note="Ad spend ÷ inquiries from ads" />
      </section>
      <p className="-mt-3 text-[13px] text-slate">
        All tracked inquiries in {m.label}, from every source: <Link href="/portal/inquiries" className="font-medium text-brand no-underline">{tracked ?? 0}</Link>
      </p>
      {report.note && (
        <div className="rounded-card border border-line bg-sidebar px-4 py-3">
          <p className="text-[13px] font-semibold text-slate">Note from Safari Digital</p>
          <p className="whitespace-pre-wrap">{report.note}</p>
        </div>
      )}
      {liveAds}
      {creatives}
      <Section title="Campaigns">
        {campaigns.length === 0 ? <p className="text-[13px] text-slate">No campaign breakdown for this month.</p> : (
          <RowList>
            {campaigns.map((c, i) => (
              <Row key={i}>
                <span className="flex min-w-[180px] flex-1 items-center gap-2.5 font-medium">{c.name}</span>
                <Badge tone={CAMPAIGN_TONE[c.status]}>{CAMPAIGN_LABEL[c.status]}</Badge>
                <span className="w-24 text-right tabular-nums">{money(Number(c.spend))}</span>
                <span className="w-28 text-right tabular-nums text-body">{c.inquiries} inquiries</span>
                {typeof c.chats === "number" && <span className="w-20 text-right tabular-nums text-[13px] text-slate">{c.chats} {c.chats === 1 ? "chat" : "chats"}</span>}
              </Row>
            ))}
          </RowList>
        )}
      </Section>
      <p className="text-xs text-slate">Safari Digital manages your campaigns. Meta may count inquiries slightly differently from the ones in your Inquiries list.{chats ? " Chats happen in your Instagram, Messenger and WhatsApp apps, so they only appear in Inquiries when you add them there." : ""}</p>
    </>
  );
}
