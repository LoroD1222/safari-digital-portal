import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { monthBounds } from "@/lib/dates";
import { INQUIRY_LABEL, type Inquiry, type InquiryStatus } from "@/lib/types";
import { EmptyState, PageHeader, Stat } from "@/components/ui";
import { Filters } from "@/components/blocks";
import { InquiryList } from "@/components/inquiry-list";

export const metadata: Metadata = { title: "Inquiries" };

const STATUSES = Object.keys(INQUIRY_LABEL) as InquiryStatus[];

export default async function InquiriesPage(props: PageProps<"/portal/inquiries">) {
  const { company } = await getPortalContext();
  if (!company) redirect("/portal");
  const { status } = await props.searchParams;
  const filter = STATUSES.includes(status as InquiryStatus) ? (status as InquiryStatus) : null;

  const supabase = await createClient();
  const { data } = await supabase.from("inquiries").select("*").eq("client_id", company.id).order("received_at", { ascending: false }).limit(500);
  const all = (data ?? []) as Inquiry[];
  const month = monthBounds(0);
  const thisMonth = all.filter((q) => q.received_at >= month.start);
  const shown = filter ? all.filter((q) => q.status === filter) : all;

  return (
    <>
      <PageHeader title="Inquiries" subtitle="People who contacted you from your website, ads and messages." />
      <section aria-label="This month" className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Stat label="Inquiries this month" value={thisMonth.length} note={month.label} />
        <Stat label="From Facebook & Instagram ads" value={thisMonth.filter((q) => q.source === "meta_ads").length} note={month.label} />
        <Stat label="Waiting for a reply" value={all.filter((q) => q.status === "new").length} note="Marked as New" href="/portal/inquiries?status=new" />
        <Stat label="Booked this month" value={thisMonth.filter((q) => q.status === "booked").length} note={month.label} />
      </section>
      <Filters label="Filter by status" items={[
        { href: "/portal/inquiries", label: "All", active: !filter, count: all.length },
        ...STATUSES.map((s) => ({ href: `/portal/inquiries?status=${s}`, label: INQUIRY_LABEL[s], active: filter === s, count: all.filter((q) => q.status === s).length })),
      ]} />
      {all.length === 0 ? (
        <EmptyState title="No inquiries yet" body="When someone fills in your website form or Safari Digital adds an inquiry from your ads or messages, it appears here." />
      ) : shown.length === 0 ? (
        <EmptyState title={`No ${INQUIRY_LABEL[filter!].toLowerCase()} inquiries`} body="Try another filter." />
      ) : (
        <InquiryList items={shown} hrefBase="/portal/inquiries" />
      )}
      <p className="text-xs text-slate">Mark each inquiry as Contacted, Booked or Closed so your monthly results stay accurate.</p>
    </>
  );
}
