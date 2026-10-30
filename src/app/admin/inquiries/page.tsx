import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { INQUIRY_LABEL, type Inquiry, type InquiryStatus } from "@/lib/types";
import { Alert, ButtonLink, EmptyState, PageHeader, Select } from "@/components/ui";
import { Filters } from "@/components/blocks";
import { InquirySelectList } from "./inquiry-select-list";
import { Icon } from "@/components/icons";

export const metadata: Metadata = { title: "Inquiries" };
const STATUSES = Object.keys(INQUIRY_LABEL) as InquiryStatus[];

export default async function AdminInquiries(props: PageProps<"/admin/inquiries">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const client = typeof sp.client === "string" ? sp.client : "";
  const filter = STATUSES.includes(sp.status as InquiryStatus) ? (sp.status as InquiryStatus) : null;

  const supabase = await createClient();
  const { data: clients } = await supabase.from("clients").select("id, name").order("name");
  let q = supabase.from("inquiries").select("*").order("received_at", { ascending: false }).limit(500);
  if (client) q = q.eq("client_id", client);
  const { data } = await q;
  const all = (data ?? []) as Inquiry[];
  const shown = filter ? all.filter((i) => i.status === filter) : all;
  const names = Object.fromEntries((clients ?? []).map((c) => [c.id, c.name as string]));
  const qs = (s: string | null) => "/admin/inquiries?" + new URLSearchParams({ ...(client ? { client } : {}), ...(s ? { status: s } : {}) });

  return (
    <>
      <PageHeader title="Inquiries" subtitle="Leads across all clients. Website forms arrive automatically; add the rest here."
        actions={<ButtonLink href={`/admin/inquiries/new${client ? `?client=${client}` : ""}`}><Icon name="plus" size={16} />Add inquiry</ButtonLink>} />
      {sp.deleted && <Alert tone="success">Inquiry deleted.</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Filters label="Filter by status" items={[
          { href: qs(null), label: "All", active: !filter, count: all.length },
          ...STATUSES.map((s) => ({ href: qs(s), label: INQUIRY_LABEL[s], active: filter === s, count: all.filter((i) => i.status === s).length })),
        ]} />
        <form className="flex items-center gap-2">
          {filter && <input type="hidden" name="status" value={filter} />}
          <label htmlFor="client" className="sr-only">Client</label>
          <Select id="client" name="client" defaultValue={client} className="h-9 w-52">
            <option value="">All clients</option>
            {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <button className="h-9 rounded-control border border-field px-3 text-[13px] font-medium hover:bg-[#F4F5F2]">Show</button>
        </form>
      </div>
      {shown.length === 0
        ? <EmptyState title="No inquiries here" body="Website form inquiries appear automatically once a client's form is connected (client → Connections)." />
        : <InquirySelectList items={shown} clientNames={client ? undefined : names} />}
    </>
  );
}
