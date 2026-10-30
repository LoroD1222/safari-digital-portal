"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, monthlyItems, nextNumber, sendInvoiceNow, sendReceipt, todayTz } from "@/lib/invoices";
import { monthBounds } from "@/lib/dates";
import { WEBSITE_LABEL, WEBSITE_PRICE, invoiceTotal, type InvoiceItem, type WebsitePackage } from "@/lib/types";
import { logActivity } from "@/lib/activity";

export type InvoiceFormState = { error?: string; saved?: boolean; message?: string };
const done = () => revalidatePath("/", "layout");
const str = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v.trim() : ""; };

// New draft: this month's marketing fee, the website fee, or an empty invoice.
export async function createInvoice(form: FormData) {
  await requireAdmin();
  const clientId = str(form, "client_id");
  const type = str(form, "type");
  if (!clientId) redirect("/admin/invoices/new?error=client");
  const supabase = await createClient();
  const db = createAdminClient();
  const today = todayTz();
  let items: InvoiceItem[] = [];
  let kind: "monthly" | "one_off" = "one_off";
  let period: string | null = null;
  if (type === "monthly") {
    period = monthBounds(0).start;
    const { data: exists } = await supabase.from("invoices").select("id").eq("client_id", clientId).eq("kind", "monthly").eq("period_month", period).neq("status", "cancelled").maybeSingle();
    if (exists) redirect(`/admin/invoices/${exists.id}?exists=1`);
    items = await monthlyItems(db, clientId, period);
    kind = "monthly";
  } else if (type === "website") {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("clients").select("website_package").eq("id", clientId).single(),
      supabase.from("client_private").select("website_fee").eq("client_id", clientId).maybeSingle(),
    ]);
    const pkg = c?.website_package as WebsitePackage | null;
    const fee = Number(p?.website_fee ?? (pkg ? WEBSITE_PRICE[pkg] : 0) ?? 0);
    items = [{ description: pkg ? `${WEBSITE_LABEL[pkg]} · website design and build` : "Website design and build", details: "One-time fee. Hosting, domain and third-party services are billed separately.", amount: fee }];
  }
  let number: string;
  try { number = await nextNumber(supabase); } catch (e) { redirect(`/admin/invoices/new?error=${encodeURIComponent((e as Error).message)}`); }
  const { data, error } = await supabase.from("invoices").insert({
    client_id: clientId, number, kind, period_month: period, status: "draft", currency: "USD",
    issue_date: today, due_date: addDays(today, 14), items, total: invoiceTotal(items),
  }).select("id").single();
  if (error || !data) redirect(`/admin/invoices/new?error=${encodeURIComponent(error?.message ?? "Couldn't create it")}`);
  done();
  redirect(`/admin/invoices/${data.id}`);
}

function readItems(form: FormData): InvoiceItem[] | string {
  const desc = form.getAll("item_description").map(String);
  const details = form.getAll("item_details").map(String);
  const amounts = form.getAll("item_amount").map(String);
  const items: InvoiceItem[] = [];
  for (let i = 0; i < desc.length; i++) {
    const d = desc[i].trim();
    const raw = (amounts[i] ?? "").replace(/[,\s$]/g, "");
    if (!d && !raw) continue;
    if (!d) return "Every line needs a description.";
    const n = Number(raw || 0);
    if (!Number.isFinite(n)) return `"${d}": the amount must be a number (use a minus for a discount).`;
    items.push({ description: d.slice(0, 200), details: details[i]?.trim().slice(0, 600) || null, amount: Math.round(n * 100) / 100 });
  }
  return items;
}

// Save a draft or an unpaid (sent) invoice. intent=send: save, then approve and send (drafts).
// For an invoice already sent, "resend" emails the updated PDF to the client.
export async function saveInvoice(id: string, _: InvoiceFormState, form: FormData): Promise<InvoiceFormState> {
  await requireAdmin();
  const items = readItems(form);
  if (typeof items === "string") return { error: items };
  const issue = str(form, "issue_date"), due = str(form, "due_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issue) || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: "Choose the invoice date and due date." };
  if (due < issue) return { error: "The due date can't be before the invoice date." };
  const supabase = await createClient();
  const { data: cur } = await supabase.from("invoices").select("status, due_date, client_id, number").eq("id", id).single();
  if (!cur || (cur.status !== "draft" && cur.status !== "sent")) return { error: "Paid and cancelled invoices can't be edited. Mark it unpaid or restore it first." };
  const total = invoiceTotal(items);
  const intent = str(form, "intent");
  if (intent === "send" && (!items.length || total <= 0)) return { error: "Add at least one line with an amount before sending." };
  const patch: Record<string, unknown> = { items, total, issue_date: issue, due_date: due, notes: str(form, "notes") || null };
  // A new due date gets fresh reminders.
  if (cur.status === "sent" && due !== cur.due_date) { patch.reminder_sent_at = null; patch.overdue_sent_at = null; }
  const { error } = await supabase.from("invoices").update(patch).eq("id", id);
  if (error) return { error: error.message };

  if (intent === "send" && cur.status === "draft") {
    const r = await sendInvoiceNow(id);
    done();
    return r.ok ? { saved: true, message: `Approved and sent to ${r.to?.join(", ")}.` } : { error: `Saved, but not sent: ${r.error}` };
  }
  if (cur.status === "sent") {
    await logActivity({ clientId: cur.client_id, actor: "admin", message: `Invoice ${cur.number} was updated`, clientLink: "/portal/account#billing", adminLink: `/admin/invoices/${id}`, visibleToClient: form.get("resend") === "on" });
    if (form.get("resend") === "on") {
      const r = await sendInvoiceNow(id, true);
      done();
      return r.ok ? { saved: true, message: `Saved and the updated invoice was emailed to ${r.to?.join(", ")}.` } : { error: `Saved, but the email failed: ${r.error}` };
    }
  }
  done();
  return { saved: true, message: cur.status === "sent" ? "Saved. The client sees the updated invoice in their portal." : "Draft saved." };
}

export async function sendInvoice(id: string): Promise<InvoiceFormState> {
  await requireAdmin();
  const r = await sendInvoiceNow(id);
  done();
  return r.ok ? { saved: true, message: `Sent to ${r.to?.join(", ")}.` } : { error: r.error };
}

export async function markPaid(id: string, _: InvoiceFormState, form: FormData): Promise<InvoiceFormState> {
  await requireAdmin();
  const paid = str(form, "paid_at");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paid)) return { error: "Choose the date it was paid." };
  const supabase = await createClient();
  const { data: inv } = await supabase.from("invoices").select("client_id, number, status").eq("id", id).single();
  if (!inv || inv.status === "cancelled" || inv.status === "draft") return { error: "Send the invoice before marking it paid." };
  if (inv.status === "paid") {
    // Correcting the payment details of an invoice already marked paid.
    const { error } = await supabase.from("invoices").update({ paid_at: paid, payment_method: str(form, "payment_method") || "M-Pesa", payment_ref: str(form, "payment_ref") || null }).eq("id", id);
    done();
    return error ? { error: error.message } : { saved: true, message: "Payment details updated." };
  }
  const { error } = await supabase.from("invoices").update({
    status: "paid", paid_at: paid, payment_method: str(form, "payment_method") || "M-Pesa", payment_ref: str(form, "payment_ref") || null,
  }).eq("id", id);
  if (error) return { error: error.message };
  await logActivity({ clientId: inv.client_id, actor: "admin", message: `Payment received for invoice ${inv.number}`, clientLink: "/portal/account#billing", adminLink: `/admin/invoices/${id}` });
  if (form.get("send_receipt") === "on") after(() => sendReceipt(id));
  done();
  return { saved: true, message: form.get("send_receipt") === "on" ? "Marked paid. A receipt is on its way to the client." : "Marked paid." };
}

export async function cancelInvoice(id: string): Promise<InvoiceFormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("invoices").update({ status: "cancelled" }).eq("id", id).neq("status", "paid");
  if (error) return { error: error.message };
  done();
  return { saved: true, message: "Cancelled. The client no longer sees it." };
}

export async function deleteDraft(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("invoices").delete().eq("id", id).eq("status", "draft");
  done();
  redirect("/admin/invoices");
}

// Undo "Mark as paid" (e.g. recorded by mistake): back to unpaid.
export async function markUnpaid(id: string): Promise<InvoiceFormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("invoices").update({ status: "sent", paid_at: null, payment_method: null, payment_ref: null }).eq("id", id).eq("status", "paid");
  if (error) return { error: error.message };
  done();
  return { saved: true, message: "Back to unpaid. You can edit it again." };
}

// Bring a cancelled invoice back as a draft to fix and send again.
export async function restoreInvoice(id: string): Promise<InvoiceFormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("invoices").update({ status: "draft", sent_at: null, reminder_sent_at: null, overdue_sent_at: null }).eq("id", id).eq("status", "cancelled");
  if (error) return { error: /invoices_monthly_once/.test(error.message) ? "There's already an active monthly invoice for this client and month." : error.message };
  done();
  return { saved: true, message: "Restored as a draft." };
}

// Remove any invoice for good (sent, paid or cancelled too). Its number isn't reused.
export async function deleteInvoice(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) return { error: "Couldn't delete it. " + error.message };
  done();
  redirect("/admin/invoices?deleted=1");
}
