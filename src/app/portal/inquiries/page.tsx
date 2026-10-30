import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { daysAgo, monthBounds, money } from "@/lib/dates";
import type { Inquiry } from "@/lib/types";
import { Stat } from "@/components/ui";
import { Icon } from "@/components/icons";
import { InquiryTable } from "./inquiry-table";
import { DailyChart, perDay } from "@/components/daily-chart";
import { AddInquiry } from "./add-inquiry";
import { adChats, type Campaign } from "@/lib/types";
import Link from "next/link";
import { PipelineBoard } from "@/components/pipeline-board";

export const metadata: Metadata = { title: "Inquiries" };

export default async function InquiriesPage(props: PageProps<"/portal/inquiries">) {
  const { company } = await getPortalContext();
  if (!company) redirect("/portal");
  const sp = await props.searchParams;
  const m = Number(sp.m);
  const offset = Number.isInteger(m) && m <= 0 && m >= -11 ? m : 0;
  const month = monthBounds(offset);
  const label = offset === 0 ? `${month.label} (so far)` : month.label;

  const view = sp.view === "list" ? "list" : "board";
  const since30 = daysAgo(30);
  const supabase = await createClient();
  const [{ data }, { data: rep }, board, { data: bookedRows }] = await Promise.all([
    supabase.from("inquiries").select("*").eq("client_id", company.id).gte("received_at", month.start).lt("received_at", month.next).order("received_at", { ascending: false }),
    company.marketing_package
      ? supabase.from("ad_reports").select("meta_spend, meta_inquiries, campaigns").eq("client_id", company.id).eq("month", month.start).maybeSingle()
      : Promise.resolve({ data: null }),
    // Board: every open inquiry, plus Booked and Lost from the last 30 days.
    supabase.from("inquiries").select("*").eq("client_id", company.id)
      .or(`status.in.(new,contacted,quoted,negotiating),stage_changed_at.gte.${since30}`)
      .order("received_at", { ascending: false }).limit(400),
    // Booked during the month (by when it was booked), for revenue.
    supabase.from("inquiries").select("trip_value, source").eq("client_id", company.id).eq("status", "booked")
      .gte("stage_changed_at", month.start).lt("stage_changed_at", month.next),
  ]);
  const boardRows = board.error ? null : ((board.data ?? []) as Inquiry[]);
  const bookedValue = (bookedRows ?? []).reduce((t, r) => t + Number(r.trip_value ?? 0), 0);
  const tab = (v: string, label: string) => (
    <Link href={`/portal/inquiries?${new URLSearchParams({ ...(v === "list" ? { view: "list" } : {}), ...(offset ? { m: String(offset) } : {}) })}`}
      aria-current={view === v ? "page" : undefined}
      className={"inline-flex h-8 items-center rounded-badge px-3.5 text-[13px] font-medium no-underline " + (view === v ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,3,33,0.12)]" : "text-body hover:text-ink")}>{label}</Link>
  );
  const rows = (data ?? []) as Inquiry[];
  const booked = rows.filter((r) => r.status === "booked").length;
  const spend = rep ? Number(rep.meta_spend) : 0;
  const metaN = rep?.meta_inquiries ?? 0;
  const monthName = month.label.split(" ")[0];
  const chats = rep ? adChats(rep.campaigns as Campaign[]) : null;
  const logged = rows.filter((r) => r.source === "meta_ads" && r.channel !== "website_form").length;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Inquiries</h1>
          <p className="text-slate">Every inquiry in one list, from ads, social media, your website and WhatsApp.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <AddInquiry />
        <form className="flex items-center gap-2">
          <label htmlFor="m" className="sr-only">Month</label>
          <select id="m" name="m" defaultValue={String(offset)} className="h-[34px] rounded-control border border-field bg-white px-2 text-sm">
            {[0, -1, -2, -3, -4, -5].map((o) => <option key={o} value={o}>{monthBounds(o).label}{o === 0 ? " (so far)" : ""}</option>)}
          </select>
          <button className="h-[34px] rounded-control border border-field px-3 text-[13px] font-medium hover:bg-[#F4F5F2]">Show</button>
        </form>
        </div>
      </header>

      <section aria-label="Summary" className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5">
        <Stat label="Total inquiries" value={rows.length} note={`${label} · all sources`} />
        <Stat label="New inquiries" value={rows.filter((r) => r.status === "new").length} note="Not contacted yet" />
        <Stat label="Booked revenue" value={money(bookedValue)} note={`${(bookedRows ?? []).length} ${(bookedRows ?? []).length === 1 ? "booking" : "bookings"} in ${monthName}${rows.length ? ` · ${Math.round((booked / rows.length) * 100)}% of this month's inquiries` : ""}`} />
        {company.marketing_package && (
          <Stat label="Cost per Meta Ads inquiry" value={spend && metaN ? money(Math.round((spend / metaN) * 100) / 100) : "—"}
            note={spend && metaN ? `${money(spend)} ad spend ÷ ${metaN} Meta Ads inquiries` : `Shown once ${monthName} ad spend is reported`} />
        )}
      </section>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav aria-label="View" className="inline-flex rounded-control bg-[#F1F2F4] p-[3px]">{tab("board", "Pipeline")}{tab("list", "List")}</nav>
          <span className="text-[13px] text-slate">{view === "board" ? "All open inquiries · Booked and Lost from the last 30 days" : `${label} · all stages`}</span>
        </div>
        {view === "board" && boardRows
          ? <PipelineBoard items={boardRows} company={company.name} />
          : <InquiryTable key={`${month.start}-${rows.length}`} items={rows} company={company.name} openId={typeof sp.open === "string" ? sp.open : null} />}
      </div>

      <DailyChart title={`Inquiries per day · ${label}`} days={perDay(month.start, rows.map((r) => r.received_at))}
        note={`${rows.length} ${rows.length === 1 ? "inquiry" : "inquiries"} from all sources`} />

      {chats !== null && chats > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-line px-4 py-3">
          <span className="flex size-9 flex-none items-center justify-center rounded-full bg-[#E3F4EA] text-brand"><Icon name="chat" size={18} /></span>
          <span className="min-w-[220px] flex-1 text-[13px] text-body">
            <span className="font-semibold text-ink">{chats} {chats === 1 ? "chat" : "chats"} started from your ads</span> in {monthName}, on Instagram, Messenger and WhatsApp.
            {" "}{logged ? `${logged} of them ${logged === 1 ? "is" : "are"} in your list.` : "Add the serious ones here so you can track bookings."}
          </span>
          <AddInquiry />
        </div>
      )}

      <div className="flex items-start gap-3 rounded-card bg-sidebar px-4 py-3.5">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#565A7C" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 flex-none"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
        <span className="flex flex-col gap-0.5 text-[13px] text-body">
          <span className="font-semibold text-ink">How inquiries get here</span>
          <span>Your website form sends them in automatically. Inquiries from WhatsApp, Messenger, calls and Meta lead forms are added by Safari Digital.</span>
          <span>&ldquo;Source&rdquo; is where the person first found you. &ldquo;Via&rdquo; is how they got in touch. If we can&apos;t tell the source, it says Unknown.</span>
        </span>
      </div>
    </>
  );
}
