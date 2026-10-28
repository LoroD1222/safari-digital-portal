"use client";
import { useActionState, useState, useTransition } from "react";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { invoiceTotal, type Invoice, type InvoiceItem, type InvoiceStatus } from "@/lib/types";
import { cancelInvoice, deleteDraft, markPaid, markUnpaid, restoreInvoice, saveInvoice, sendInvoice, type InvoiceFormState } from "../actions";

function Feedback({ s }: { s: InvoiceFormState }) {
  if (s.error) return <Alert>{s.error}</Alert>;
  if (s.message) return <Alert tone="success">{s.message}</Alert>;
  return null;
}

type Line = InvoiceItem & { key: number; raw: string };

export function InvoiceEditor({ invoice, recipients }: { invoice: Invoice; recipients: string[] }) {
  const draft = invoice.status === "draft";
  const [state, action] = useActionState<InvoiceFormState, FormData>(saveInvoice.bind(null, invoice.id), {});
  const [lines, setLines] = useState<Line[]>(() => (invoice.items.length ? invoice.items : [{ description: "", amount: 0 }]).map((i, n) => ({ ...i, key: n, raw: i.amount ? String(i.amount) : "" })));
  const total = invoiceTotal(lines.map((l) => ({ ...l, amount: Number(l.raw.replace(/[,\s$]/g, "")) || 0 })));
  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <form action={action} className="flex flex-col gap-5">
      {draft
        ? <Alert tone="info">Draft, waiting for your approval. Nothing is sent to the client until you click <strong>Approve and send</strong>.</Alert>
        : <Alert tone="info">This invoice was already sent. You can still change it; the client sees the new version in their portal as soon as you save.</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Invoice date" htmlFor="issue_date"><Input id="issue_date" name="issue_date" type="date" defaultValue={invoice.issue_date} /></Field>
        <Field label="Due date" htmlFor="due_date"><Input id="due_date" name="due_date" type="date" defaultValue={invoice.due_date} /></Field>
        <div className="flex flex-col gap-1.5"><span className="font-medium">Currency</span><span className="flex h-10 items-center rounded-control bg-sidebar px-3">USD ($)</span></div>
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="pb-2 font-medium">Lines</legend>
        {lines.map((l, n) => (
          <div key={l.key} className="flex flex-col gap-2 rounded-card border border-line p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_120px_auto] items-end gap-2">
              <Field label={`Line ${n + 1}`} htmlFor={`d${l.key}`}><Input id={`d${l.key}`} name="item_description" value={l.description} onChange={(e) => set(l.key, { description: e.target.value })} placeholder="e.g. Growth Marketing · November 2026" /></Field>
              <Field label="Amount ($)" htmlFor={`a${l.key}`}><Input id={`a${l.key}`} name="item_amount" inputMode="decimal" value={l.raw} onChange={(e) => set(l.key, { raw: e.target.value })} placeholder="450 or -45" /></Field>
              <button type="button" aria-label={`Remove line ${n + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="mb-0.5 h-10 rounded-control px-2.5 text-[13px] font-medium text-slate hover:text-ink">Remove</button>
            </div>
            <Input aria-label={`Line ${n + 1} details`} name="item_details" value={l.details ?? ""} onChange={(e) => set(l.key, { details: e.target.value })} placeholder="Details (optional), e.g. what's included" className="h-9 text-[13px]" />
          </div>
        ))}
        <button type="button" onClick={() => setLines((ls) => [...ls, { description: "", amount: 0, raw: "", key: Math.max(0, ...ls.map((x) => x.key)) + 1 }])}
          className="self-start rounded-control border border-dashed border-[#B7BCC8] px-3 py-2 text-[13px] font-medium text-brand hover:border-brand">+ Add a line</button>
        <p className="text-[13px] text-slate">Use a minus amount for a discount, e.g. <code>-45</code>.</p>
      </fieldset>
      <Field label="Note on the invoice" htmlFor="notes" optional><Textarea id="notes" name="notes" rows={2} defaultValue={invoice.notes ?? ""} placeholder="e.g. Thank you for working with us!" /></Field>
      <div className="flex flex-col gap-3 rounded-card bg-sidebar px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[15px]">Total <span className="ml-2 text-xl font-semibold tabular-nums">${total.toLocaleString("en-US")}</span></span>
          <div className="flex flex-wrap gap-2">
            <button type="submit" name="intent" value="save" className="h-10 rounded-control border border-field bg-white px-4 font-medium hover:bg-[#F4F5F2]">{draft ? "Save draft" : "Save changes"}</button>
            {draft && (
              <button type="submit" name="intent" value="send"
                onClick={(e) => {
                  const who = recipients.length ? recipients.join(", ") : "nobody (no email address)";
                  if (!confirm(`Approve invoice ${invoice.number} for $${total.toLocaleString("en-US")} and email it to ${who}?`)) e.preventDefault();
                }}
                className="h-10 rounded-control bg-brand px-4 font-semibold text-white hover:bg-brand-hover">Approve and send</button>
            )}
          </div>
        </div>
        {draft
          ? <p className="text-[13px] text-slate">Approve and send saves your changes first, then emails the PDF to {recipients.length ? recipients.join(", ") : "the client (add an email first)"}.</p>
          : <label className="flex items-center gap-2 text-[13px] text-body"><input type="checkbox" name="resend" className="size-4 accent-[#1A6647]" />Email the updated invoice to {recipients.join(", ") || "the client"}</label>}
      </div>
      <Feedback s={state} />
    </form>
  );
}

export function InvoiceActions({ invoice, state }: { invoice: Invoice; state: InvoiceStatus | "overdue" }) {
  const [res, setRes] = useState<InvoiceFormState>({});
  const [pending, start] = useTransition();
  const [paidState, payAction] = useActionState<InvoiceFormState, FormData>(markPaid.bind(null, invoice.id), {});
  const [today] = useState(() => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10));
  const run = (fn: () => Promise<InvoiceFormState>) => start(async () => setRes(await fn()));
  const paid = state === "paid";

  if (state === "cancelled") {
    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-5">
        <p className="flex-1 text-[13px] text-slate">This invoice is cancelled. Clients don&apos;t see cancelled invoices.</p>
        <Button variant="secondary" disabled={pending} onClick={() => run(() => restoreInvoice(invoice.id))}>Restore as draft</Button>
        <Feedback s={res} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 border-t border-line-soft pt-5">
      {invoice.status === "draft" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" disabled={pending} onClick={() => { if (confirm("Delete this draft?")) start(() => deleteDraft(invoice.id)); }}>Delete draft</Button>
        </div>
      )}
      {(state === "sent" || state === "overdue" || paid) && (
        <form action={payAction} className="flex flex-col gap-3 rounded-card border border-line px-4 py-4">
          <span className="font-semibold">{paid ? "Payment details" : "Record the payment"}</span>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Paid on" htmlFor="paid_at"><Input id="paid_at" name="paid_at" type="date" defaultValue={invoice.paid_at ?? today} max={today} /></Field>
            <Field label="Method" htmlFor="payment_method"><Input id="payment_method" name="payment_method" defaultValue={invoice.payment_method ?? "M-Pesa"} /></Field>
            <Field label="Reference" htmlFor="payment_ref" optional><Input id="payment_ref" name="payment_ref" defaultValue={invoice.payment_ref ?? ""} placeholder="M-Pesa code" /></Field>
          </div>
          {!paid && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="send_receipt" defaultChecked className="size-4 accent-[#1A6647]" />Email the client a receipt</label>}
          <div className="flex flex-wrap justify-end gap-2">
            {paid ? (
              <>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => { if (confirm("Mark this invoice as unpaid again?")) run(() => markUnpaid(invoice.id)); }}>Mark as unpaid</Button>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => sendInvoice(invoice.id))}>Email the receipt again</Button>
                <SubmitButton variant="secondary">Save payment details</SubmitButton>
              </>
            ) : (
              <>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => sendInvoice(invoice.id))}>Email the invoice again</Button>
                <SubmitButton>Mark as paid</SubmitButton>
              </>
            )}
          </div>
          <Feedback s={paidState} />
        </form>
      )}
      {!paid && invoice.status !== "draft" && (
        <button type="button" disabled={pending} onClick={() => { if (confirm("Cancel this invoice? The client will no longer see it.")) run(() => cancelInvoice(invoice.id)); }}
          className="self-start text-[13px] font-medium text-danger-text hover:underline">Cancel invoice</button>
      )}
      <Feedback s={res} />
    </div>
  );
}
