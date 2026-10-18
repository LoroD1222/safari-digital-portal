import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/blocks";
import { InquiryForm } from "../inquiry-form";
import { saveInquiry } from "../actions";

export const metadata: Metadata = { title: "Add inquiry" };

export default async function NewInquiry(props: PageProps<"/admin/inquiries/new">) {
  await requireAdmin();
  const { client } = await props.searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("id, name").order("name");
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackLink href="/admin/inquiries">Inquiries</BackLink>
      <PageHeader title="Add inquiry" subtitle="For leads that came in by WhatsApp, Messenger, phone or email." />
      <InquiryForm action={saveInquiry.bind(null, null)} clients={(data ?? []) as { id: string; name: string }[]}
        defaultClient={typeof client === "string" ? client : undefined} cancelHref="/admin/inquiries" submitLabel="Add inquiry" />
    </div>
  );
}
