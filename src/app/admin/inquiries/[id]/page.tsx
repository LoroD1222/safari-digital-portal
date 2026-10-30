import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/dates";
import type { Inquiry } from "@/lib/types";
import { Alert, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/blocks";
import { InquiryStatusPicker } from "@/components/inquiry-status";
import { InquiryForm } from "../inquiry-form";
import { saveInquiry } from "../actions";
import { DeleteInquiry } from "../delete-inquiry";

export const metadata: Metadata = { title: "Inquiry" };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function AdminInquiry(props: PageProps<"/admin/inquiries/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const { created } = await props.searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("inquiries").select("*, clients(name)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const q = data as Inquiry & { clients: { name: string } | null };

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackLink href="/admin/inquiries">Inquiries</BackLink>
      <PageHeader title={q.customer_name} actions={<DeleteInquiry id={q.id} name={q.customer_name} />}
        subtitle={<><Link href={`/admin/clients/${q.client_id}`} className="font-medium text-brand no-underline">{q.clients?.name}</Link> · {fmtDateTime(q.received_at)} · {q.origin === "website_form" ? "from the website form" : "added by hand"}</>} />
      {created && <Alert tone="success">Inquiry added. The client can see it now.</Alert>}
      <InquiryStatusPicker id={q.id} status={q.status} />
      <InquiryForm action={saveInquiry.bind(null, q.id)} inquiry={q} cancelHref="/admin/inquiries" submitLabel="Save changes" />
    </div>
  );
}
