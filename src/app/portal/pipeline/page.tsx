import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { daysAgo, monthBounds, money } from "@/lib/dates";
import { bookedInMonth } from "@/lib/pipeline";
import { OPEN_STAGES, type Inquiry } from "@/lib/types";
import { EmptyState, Stat } from "@/components/ui";
import { PipelineBoard } from "@/components/pipeline-board";
import { pipelineFollowups } from "@/lib/pipeline-followups";
import { AdChatsBanner } from "../inquiries/ad-chats";
import { adChats, type Campaign } from "@/lib/types";
import { chatsBetween, metaConfigured } from "@/lib/meta";
import { last30Bounds } from "@/lib/dates";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const { company } = await getPortalContext();
  if (!company) redirect("/portal");
  const month = monthBounds(0);
  const monthName = month.label.split(" ")[0];
  const supabase = await createClient();
  const [board, won, rep, logged] = await Promise.all([
    // Every open inquiry, plus Booked and Lost from the last 30 days.
    supabase.from("inquiries").select("*").eq("client_id", company.id)
      .or(`status.in.(${OPEN_STAGES.join(",")}),stage_changed_at.gte.${daysAgo(30)}`)
      .order("received_at", { ascending: false }).limit(400),
    bookedInMonth(supabase, company.id, month),
    company.marketing_package
      ? supabase.from("ad_reports").select("campaigns").eq("client_id", company.id).eq("month", month.start).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("client_id", company.id).eq("source", "meta_ads")
      .neq("channel", "website_form").gte("received_at", last30Bounds().start).lt("received_at", last30Bounds().next),
  ]);
  // Chats from ads in the last 30 days (straight from Meta); without Meta, this month's report.
  const p30 = last30Bounds();
  const live30 = company.marketing_package && company.meta_ad_account_id && metaConfigured()
    ? await chatsBetween(company.meta_ad_account_id, p30.start, new Date(Date.parse(p30.next) - 86400000).toISOString().slice(0, 10))
    : null;
  const chats = live30 ?? (rep.data ? adChats(rep.data.campaigns as Campaign[]) : null);
  const rows = (board.data ?? []) as Inquiry[];
  const fu = await pipelineFollowups(supabase, company.id, rows).catch(() => ({ on: false, badges: {} }));
  const open = rows.filter((r) => OPEN_STAGES.includes(r.status));
  const openValue = open.reduce((t, r) => t + Number(r.trip_value ?? 0), 0);
  const quoted = open.filter((r) => r.status === "quoted" || r.status === "negotiating");

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Pipeline</h1>
          <p className="text-slate">Follow every inquiry from the first message to a booking. New inquiries appear here automatically.</p>
        </div>
        <Link href="/portal/inquiries" className="text-[13px] font-medium text-brand no-underline">See all inquiries →</Link>
      </header>
      {board.error ? (
        <EmptyState title="The pipeline is almost ready" body="Safari Digital is finishing setting it up. Until then, your inquiries are on the Inquiries page." />
      ) : (
        <>
          <section aria-label="Summary" className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5">
            <Stat label="Open inquiries" value={open.length} note={openValue > 0 ? `${money(openValue)} in quotes and deals` : "Not booked or lost yet"} />
            <Stat label="Quotes out" value={quoted.length} note="Quote sent or negotiating" />
            <Stat label={`${company.is_internal ? "Signed" : "Booked"} in ${monthName}`} value={money(won.value)} note={`${won.count} ${won.count === 1 ? "booking" : "bookings"}${won.adsValue > 0 ? ` · ${money(won.adsValue)} from ads` : ""}`} />
          </section>
          {chats !== null && chats > (logged.count ?? 0) && <AdChatsBanner chats={chats} added={logged.count ?? 0} period={live30 !== null ? "in the last 30 days" : `in ${monthName}`} current />}
          <PipelineBoard items={rows} company={company.name} followupsOn={fu.on} followups={fu.badges} />
        </>
      )}
    </>
  );
}
