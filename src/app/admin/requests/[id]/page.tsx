import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABEL, REQUEST_LABEL_ADMIN, type RequestStatus, type SupportRequest } from "@/lib/types";
import { fmtDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/blocks";
import { ReplyForm } from "@/components/request-forms";
import { Thread, loadThread } from "@/components/request-thread";
import { setRequestStatus } from "@/app/request-actions";

export const metadata: Metadata = { title: "Request" };
const UUID = /^[0-9a-f-]{36}$/i;
const STATUSES: RequestStatus[] = ["submitted", "in_progress", "waiting_for_client", "completed"];

export default async function AdminRequest(props: PageProps<"/admin/requests/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("requests").select("*, clients(name)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as SupportRequest & { clients: { name: string } | null };
  const { msgs, urls } = await loadThread(supabase, id);
  const name = r.clients?.name ?? "Client";

  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <BackLink href="/admin/requests">Requests</BackLink>
      <PageHeader title={r.subject}
        subtitle={<><Link href={`/admin/clients/${r.client_id}`} className="font-medium text-brand no-underline">{name}</Link> · {CATEGORY_LABEL[r.category]} · {fmtDate(r.created_at, true)}</>} />
      <div role="group" aria-label="Status" className="inline-flex w-fit flex-wrap rounded-control bg-[#F1F2F4] p-[3px]">
        {STATUSES.map((s) => (
          <form key={s} action={setRequestStatus.bind(null, r.id, s)}>
            <button aria-pressed={r.status === s}
              className={"h-8 rounded-badge px-3 text-[13px] font-medium " + (r.status === s ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,3,33,0.12)]" : "text-body hover:text-ink")}>
              {REQUEST_LABEL_ADMIN[s]}
            </button>
          </form>
        ))}
      </div>
      <Thread msgs={msgs} urls={urls} me="admin" clientName={name} />
      <ReplyForm requestId={r.id} clientId={r.client_id} placeholder={`Reply to ${name}…`} />
      <p className="text-xs text-slate">Replies are emailed to the client. Set “Waiting for client” when you need something from them; marking Completed also emails them.</p>
    </div>
  );
}
