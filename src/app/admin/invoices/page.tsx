import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { INVOICE_LABEL, INVOICE_TONE, formatMoney, invoiceState, type Invoice } from "@/lib/types";
import { fmtDate } from "@/lib/dates";
import { todayTz } from "@/lib/invoices";
import { Badge, ButtonLink, EmptyState, PageHeader, Select, Stat } from "@/components/ui";
import { Filters, Row, RowList } from "@/components/blocks";
import { Icon } from "@/components/icons";

export const metadata: Metadata = { title: "Invoices" };
const FILTERS = ["open", "draft", "overdue", "paid", "all"] as const;
type F = (typeof FILTERS)[number];

export default async function InvoicesPage(props: PageProps<"/admin/invoices">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const filter = (FILTERS as readonly string[]).includes(String(sp.status)) ? (sp.status as F) : "open";
  const client = typeof sp.client === "string" ? sp.client : "";
  const supabase = await createClient();
  const [{ data: clients }, { data, error }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    (client ? supabase.from("invoices").select("*").eq("client_id", client) : supabase.from("invoices").select("*")).order("issue_date", { ascending: false }).order("number", { ascending: false }).limit(500),
  ]);
  const all = ((data ?? []) as Invoice[]).map((i) => ({ ...i, state: invoiceState(i) }));
  const names = Object.fromEntries((clients ?? []).map((c) => [c.id, c.name as string]));
  const unpaid = all.filter((i) => i.state === "sent" || i.state === "overdue");
  const overdue = all.filter((i) => i.state === "overdue");
  const thisMonth = todayTz().slice(0, 7);
  const paidMonth = all.filter((i) => i.state === "paid" && i.paid_at?.startsWith(thisMonth));
  const sum = (l: typeof all) => formatMoney(Math.round(l.reduce((n, i) => n + Number(i.total), 0) * 100) / 100, "USD");
  const shown = filter === "all" ? all.filter((i) => i.state !== "cancelled") : filter === "open" ? unpaid : all.filter((i) => i.state === filter);
  const qs = (s: string) => "/admin/invoices?" + new URLSearchParams({ ...(client ? { client } : {}), status: s });

  return (
    <>
      <PageHeader title="Invoices" subtitle="Monthly invoices are prepared on the 1st and wait for your approval. Nothing reaches a client until you approve and send it."
        actions={<ButtonLink href={`/admin/invoices/new${client ? `?client=${client}` : ""}`}><Icon name="plus" size={16} />New invoice</ButtonLink>} />
      {error && <p className="text-[13px] text-danger-text">Run 0012_invoices.sql in Supabase to start using invoices.</p>}
      <section aria-label="Summary" className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Stat label="Unpaid" value={sum(unpaid)} note={`${unpaid.length} ${unpaid.length === 1 ? "invoice" : "invoices"}`} />
        <Stat label="Overdue" value={sum(overdue)} note={overdue.length ? `${overdue.length} past the due date` : "Nothing overdue"} />
        <Stat label="Paid this month" value={sum(paidMonth)} note={`${paidMonth.length} ${paidMonth.length === 1 ? "payment" : "payments"}`} />
        <Stat label="Needs your approval" value={all.filter((i) => i.state === "draft").length} note="Check, then approve and send" />
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Filters label="Filter" items={[
          { href: qs("open"), label: "Unpaid", active: filter === "open", count: unpaid.length },
          { href: qs("draft"), label: "Needs approval", active: filter === "draft", count: all.filter((i) => i.state === "draft").length },
          { href: qs("overdue"), label: "Overdue", active: filter === "overdue", count: overdue.length },
          { href: qs("paid"), label: "Paid", active: filter === "paid" },
          { href: qs("all"), label: "All", active: filter === "all" },
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
      {shown.length === 0 ? <EmptyState title="No invoices here" body="Create one with New invoice, or wait for the monthly drafts on the 1st." /> : (
        <RowList>
          {shown.map((i) => (
            <Row key={i.id} href={`/admin/invoices/${i.id}`}>
              <span className="w-28 font-medium tabular-nums">{i.number}</span>
              <span className="min-w-[160px] flex-1">{names[i.client_id] ?? "Client"}<span className="block text-xs text-slate">{i.items[0]?.description ?? "No lines yet"}</span></span>
              <span className="w-32 text-[13px] text-slate">{i.state === "paid" ? `Paid ${fmtDate(i.paid_at)}` : `Due ${fmtDate(i.due_date)}`}</span>
              <span className="w-24 text-right font-medium tabular-nums">{formatMoney(Number(i.total), i.currency)}</span>
              <span className="w-24 text-right"><Badge tone={INVOICE_TONE[i.state]}>{INVOICE_LABEL[i.state]}</Badge></span>
            </Row>
          ))}
        </RowList>
      )}
    </>
  );
}
