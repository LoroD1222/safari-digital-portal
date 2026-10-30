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

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const { company } = await getPortalContext();
  if (!company) redirect("/portal");
  const month = monthBounds(0);
  const monthName = month.label.split(" ")[0];
  const supabase = await createClient();
  const [board, won] = await Promise.all([
    // Every open inquiry, plus Booked and Lost from the last 30 days.
    supabase.from("inquiries").select("*").eq("client_id", company.id)
      .or(`status.in.(${OPEN_STAGES.join(",")}),stage_changed_at.gte.${daysAgo(30)}`)
      .order("received_at", { ascending: false }).limit(400),
    bookedInMonth(supabase, company.id, month),
  ]);
  const rows = (board.data ?? []) as Inquiry[];
  const open = rows.filter((r) => OPEN_STAGES.includes(r.status));
  const openValue = open.reduce((t, r) => t + Number(r.trip_value ?? 0), 0);
  const quoted = open.filter((r) => r.status === "quoted" || r.status === "negotiating");

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Pipeline</h1>
        <p className="text-slate">Follow every inquiry from the first message to a booking. New inquiries appear here automatically.</p>
      </header>
      {board.error ? (
        <EmptyState title="The pipeline is almost ready" body="Safari Digital is finishing setting it up. Until then, your inquiries are on the Inquiries page." />
      ) : (
        <>
          <section aria-label="Summary" className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5">
            <Stat label="Open inquiries" value={open.length} note={openValue > 0 ? `${money(openValue)} in quotes and deals` : "Not booked or lost yet"} />
            <Stat label="Quotes out" value={quoted.length} note="Quote sent or negotiating" />
            <Stat label={`Booked in ${monthName}`} value={money(won.value)} note={`${won.count} ${won.count === 1 ? "booking" : "bookings"}${won.adsValue > 0 ? ` · ${money(won.adsValue)} from ads` : ""}`} />
          </section>
          <PipelineBoard items={rows} company={company.name} />
          <p className="text-[13px] text-slate">Looking for the full list or another month? <Link href="/portal/inquiries" className="font-medium text-brand no-underline">See all inquiries</Link>.</p>
        </>
      )}
    </>
  );
}
