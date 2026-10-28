import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { INVOICE_LABEL, INVOICE_TONE, invoiceState, type Invoice } from "@/lib/types";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { Alert, Badge } from "@/components/ui";
import { InvoiceEditor, InvoiceActions } from "./invoice-forms";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage(props: PageProps<"/admin/invoices/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const inv = data as Invoice;
  const { data: c } = await supabase.from("clients").select("id, name, contact_email").eq("id", inv.client_id).single();
  const { count: logins } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("client_id", inv.client_id).eq("role", "client");
  const state = invoiceState(inv);
  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <Link href="/admin/invoices" className="text-[13px] font-medium text-brand no-underline">← Invoices</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-[-0.02em]">{inv.number} <Badge tone={INVOICE_TONE[state]}>{INVOICE_LABEL[state]}</Badge></h1>
          <p className="text-slate">
            <Link href={`/admin/clients/${inv.client_id}`} className="font-medium text-ink no-underline">{c?.name}</Link>
            {inv.sent_at && <> · sent {fmtDateTime(inv.sent_at)}</>}
            {inv.paid_at && <> · paid {fmtDate(inv.paid_at)}{inv.payment_method ? ` (${inv.payment_method}${inv.payment_ref ? `, ref ${inv.payment_ref}` : ""})` : ""}</>}
            {inv.reminder_sent_at && <> · reminder sent</>}
            {inv.overdue_sent_at && <> · overdue notice sent</>}
          </p>
        </div>
        <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener" className="inline-flex h-9 items-center rounded-control border border-field px-3.5 text-[13px] font-medium text-ink no-underline hover:bg-[#F4F5F2]">Open PDF ↗</a>
      </div>
      {sp.exists && <Alert tone="info">There&apos;s already a monthly invoice for this client this month, so here it is.</Alert>}
      {!logins && !c?.contact_email && state !== "paid" && <Alert>This client has no login and no contact email, so the invoice can&apos;t be emailed. Add a contact email on the client page.</Alert>}
      {inv.status === "draft"
        ? <InvoiceEditor invoice={inv} />
        : <InvoiceView invoice={inv} />}
      <InvoiceActions invoice={inv} state={state} />
    </div>
  );
}

function InvoiceView({ invoice: inv }: { invoice: Invoice }) {
  return (
    <section className="overflow-hidden rounded-card border border-line">
      <div className="flex flex-wrap gap-6 border-b border-line-soft bg-sidebar px-4 py-3 text-[13px]">
        <span><span className="text-slate">Invoice date</span> <span className="font-medium">{fmtDate(inv.issue_date, true)}</span></span>
        <span><span className="text-slate">Due</span> <span className="font-medium">{fmtDate(inv.due_date, true)}</span></span>
      </div>
      <ul>
        {inv.items.map((it, n) => (
          <li key={n} className="flex items-start justify-between gap-4 border-b border-line-soft px-4 py-3">
            <span className="flex flex-col"><span className="font-medium">{it.description}</span>{it.details && <span className="text-[13px] text-slate">{it.details}</span>}</span>
            <span className="tabular-nums">{Number(it.amount) < 0 ? "-" : ""}${Math.abs(Number(it.amount)).toLocaleString("en-US")}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between px-4 py-3 font-semibold"><span>Total</span><span className="tabular-nums">${Number(inv.total).toLocaleString("en-US")}</span></div>
      {inv.notes && <p className="border-t border-line-soft px-4 py-3 text-[13px] text-body">{inv.notes}</p>}
    </section>
  );
}
