import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { monthBounds, money } from "@/lib/dates";
import type { Inquiry } from "@/lib/types";
import { Stat } from "@/components/ui";
import { InquiryTable } from "./inquiry-table";

export const metadata: Metadata = { title: "Inquiries" };

export default async function InquiriesPage(props: PageProps<"/portal/inquiries">) {
  const { company } = await getPortalContext();
  if (!company) redirect("/portal");
  const sp = await props.searchParams;
  const m = Number(sp.m);
  const offset = Number.isInteger(m) && m <= 0 && m >= -11 ? m : 0;
  const month = monthBounds(offset);
  const label = offset === 0 ? `${month.label} (so far)` : month.label;

  const supabase = await createClient();
  const [{ data }, { data: rep }] = await Promise.all([
    supabase.from("inquiries").select("*").eq("client_id", company.id).gte("received_at", month.start).lt("received_at", month.next).order("received_at", { ascending: false }),
    company.marketing_package
      ? supabase.from("ad_reports").select("meta_spend, meta_inquiries").eq("client_id", company.id).eq("month", month.start).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const rows = (data ?? []) as Inquiry[];
  const booked = rows.filter((r) => r.status === "booked").length;
  const spend = rep ? Number(rep.meta_spend) : 0;
  const metaN = rep?.meta_inquiries ?? 0;
  const monthName = month.label.split(" ")[0];

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Inquiries</h1>
          <p className="text-slate">Every inquiry in one list, from ads, social media, your website and WhatsApp.</p>
        </div>
        <form className="flex items-center gap-2">
          <label htmlFor="m" className="sr-only">Month</label>
          <select id="m" name="m" defaultValue={String(offset)} className="h-[34px] rounded-control border border-field bg-white px-2 text-sm">
            {[0, -1, -2, -3, -4, -5].map((o) => <option key={o} value={o}>{monthBounds(o).label}{o === 0 ? " (so far)" : ""}</option>)}
          </select>
          <button className="h-[34px] rounded-control border border-field px-3 text-[13px] font-medium hover:bg-[#F4F5F2]">Show</button>
        </form>
      </header>

      <section aria-label="Summary" className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5">
        <Stat label="Total inquiries" value={rows.length} note={`${label} · all sources`} />
        <Stat label="New inquiries" value={rows.filter((r) => r.status === "new").length} note="Not contacted yet" />
        <Stat label="Confirmed bookings" value={booked} note={rows.length ? `${Math.round((booked / rows.length) * 100)}% of inquiries` : "—"} />
        {company.marketing_package && (
          <Stat label="Cost per Meta Ads inquiry" value={spend && metaN ? money(Math.round((spend / metaN) * 100) / 100) : "—"}
            note={spend && metaN ? `${money(spend)} ad spend ÷ ${metaN} Meta Ads inquiries` : `Shown once ${monthName} ad spend is reported`} />
        )}
      </section>

      <InquiryTable key={month.start} items={rows} company={company.name} openId={typeof sp.open === "string" ? sp.open : null} />

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
