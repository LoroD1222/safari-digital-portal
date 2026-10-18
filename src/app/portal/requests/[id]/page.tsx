import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABEL, REQUEST_LABEL, type SupportRequest } from "@/lib/types";
import { REQUEST_TONE } from "@/lib/status-tone";
import { fmtDate } from "@/lib/dates";
import { Badge, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/blocks";
import { ReplyForm } from "@/components/request-forms";
import { Thread, loadThread } from "@/components/request-thread";

export const metadata: Metadata = { title: "Request" };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function RequestPage(props: PageProps<"/portal/requests/[id]">) {
  const { company } = await getPortalContext();
  const { id } = await props.params;
  if (!company || !UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("requests").select("*").eq("id", id).eq("client_id", company.id).maybeSingle();
  if (!data) notFound();
  const r = data as SupportRequest;
  const { msgs, urls } = await loadThread(supabase, id);
  const back = r.category === "website_change" ? { href: "/portal/website?tab=manage", label: "Website" } : { href: "/portal/help", label: "Help" };

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackLink href={back.href}>{back.label}</BackLink>
      <PageHeader title={r.subject} subtitle={`${CATEGORY_LABEL[r.category]} · sent ${fmtDate(r.created_at, true)}`}
        actions={<Badge tone={REQUEST_TONE[r.status]}>{REQUEST_LABEL[r.status]}</Badge>} />
      {r.status === "waiting_for_client" && <p className="rounded-control bg-[#FFFAF0] px-3.5 py-2.5 text-[13px] text-[#8A5A12]">We need something from you to continue. Please reply below.</p>}
      <Thread msgs={msgs} urls={urls} me="client" clientName="You" />
      <ReplyForm requestId={r.id} clientId={company.id} placeholder={r.status === "completed" ? "Reply to re-open this request…" : "Write a reply…"} />
    </div>
  );
}
