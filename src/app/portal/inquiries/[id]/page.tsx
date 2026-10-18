import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/dates";
import { CHANNEL_LABEL, SOURCE_LABEL, type Inquiry } from "@/lib/types";
import { PageHeader, buttonClass } from "@/components/ui";
import { BackLink, DetailList } from "@/components/blocks";
import { Icon } from "@/components/icons";
import { InquiryStatusPicker } from "@/components/inquiry-status";
import { contactLinks } from "@/components/inquiry-list";

export const metadata: Metadata = { title: "Inquiry" };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function InquiryPage(props: PageProps<"/portal/inquiries/[id]">) {
  const { company } = await getPortalContext();
  const { id } = await props.params;
  if (!company || !UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("inquiries").select("*").eq("id", id).eq("client_id", company.id).maybeSingle();
  if (!data) notFound();
  const q = data as Inquiry;
  const links = contactLinks(q);

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackLink href="/portal/inquiries">Inquiries</BackLink>
      <PageHeader title={q.customer_name} subtitle={`Received ${fmtDateTime(q.received_at)}`} />
      <div className="flex flex-wrap gap-2">
        {links.whatsapp && <a href={links.whatsapp} target="_blank" rel="noreferrer" className={buttonClass("primary")}><Icon name="whatsapp" size={16} />WhatsApp</a>}
        {links.email && <a href={links.email} className={buttonClass(links.whatsapp ? "secondary" : "primary")}>Email</a>}
        {links.phone && <a href={links.phone} className={buttonClass("secondary")}>Call</a>}
      </div>
      <section aria-labelledby="st-h" className="flex flex-col gap-2">
        <h2 id="st-h" className="text-[13px] font-semibold text-slate">Status</h2>
        <InquiryStatusPicker id={q.id} status={q.status} />
      </section>
      <DetailList rows={[
        ["Interested in", q.interested_in],
        ["Travel dates", q.travel_dates],
        ["Travellers", q.travellers],
        ["Country", q.country],
        ["Email", q.email],
        ["Phone", q.phone],
        ["Message", q.message],
        ["Came from", SOURCE_LABEL[q.source] + (q.campaign ? ` · ${q.campaign}` : "")],
        ["Got in touch by", CHANNEL_LABEL[q.channel] ?? q.channel],
      ]} />
    </div>
  );
}
