import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { REQUEST_LABEL_ADMIN, type RequestStatus, type SupportRequest } from "@/lib/types";
import { EmptyState, PageHeader, Select } from "@/components/ui";
import { Filters } from "@/components/blocks";
import { RequestList } from "@/components/request-list";

export const metadata: Metadata = { title: "Requests" };
const STATUSES: RequestStatus[] = ["submitted", "in_progress", "waiting_for_client", "completed"];

export default async function AdminRequests(props: PageProps<"/admin/requests">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const client = typeof sp.client === "string" ? sp.client : "";
  const filter = sp.status === "all" ? "all" : STATUSES.includes(sp.status as RequestStatus) ? (sp.status as RequestStatus) : "open";

  const supabase = await createClient();
  const { data: clients } = await supabase.from("clients").select("id, name").order("name");
  let q = supabase.from("requests").select("*").order("last_message_at", { ascending: false }).limit(300);
  if (client) q = q.eq("client_id", client);
  const { data } = await q;
  const all = (data ?? []) as SupportRequest[];
  const open = all.filter((r) => r.status !== "completed");
  const shown = filter === "all" ? all : filter === "open" ? open : all.filter((r) => r.status === filter);
  const names = Object.fromEntries((clients ?? []).map((c) => [c.id, c.name as string]));
  const qs = (s: string) => "/admin/requests?" + new URLSearchParams({ ...(client ? { client } : {}), status: s });

  return (
    <>
      <PageHeader title="Requests" subtitle="Website changes and help requests from clients." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Filters label="Filter" items={[
          { href: qs("open"), label: "Open", active: filter === "open", count: open.length },
          ...STATUSES.map((s) => ({ href: qs(s), label: REQUEST_LABEL_ADMIN[s], active: filter === s, count: all.filter((r) => r.status === s).length })),
          { href: qs("all"), label: "All", active: filter === "all", count: all.length },
        ]} />
        <form className="flex items-center gap-2">
          <input type="hidden" name="status" value={filter} />
          <label htmlFor="client" className="sr-only">Client</label>
          <Select id="client" name="client" defaultValue={client} className="h-9 w-52">
            <option value="">All clients</option>
            {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <button className="h-9 rounded-control border border-field px-3 text-[13px] font-medium hover:bg-[#F4F5F2]">Show</button>
        </form>
      </div>
      {shown.length === 0
        ? <EmptyState title={filter === "open" ? "No open requests" : "No requests here"} body="Clients send requests from Help and from their Website page." />
        : <RequestList items={shown} hrefBase="/admin/requests" admin clientNames={client ? undefined : names} />}
    </>
  );
}
