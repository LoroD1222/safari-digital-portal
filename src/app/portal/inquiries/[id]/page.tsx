import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import type { Inquiry } from "@/lib/types";
import { BackLink } from "@/components/blocks";
import { OpenInquiry } from "./open-dialog";

export const metadata: Metadata = { title: "Inquiry" };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function InquiryPage(props: PageProps<"/portal/inquiries/[id]">) {
  const { company } = await getPortalContext();
  const { id } = await props.params;
  if (!company || !UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("inquiries").select("*").eq("id", id).eq("client_id", company.id).maybeSingle();
  if (!data) notFound();
  return (
    <>
      <BackLink href="/portal/inquiries">Inquiries</BackLink>
      <OpenInquiry inquiry={data as Inquiry} company={company.name} />
    </>
  );
}
