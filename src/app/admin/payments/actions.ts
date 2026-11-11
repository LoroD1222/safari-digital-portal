"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

// Moving an entry on the payments calendar: a paid invoice moves its payment date,
// anything unpaid moves its due date (with fresh reminders for the new date).
export async function movePayment(invoiceId: string, date: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { ok: false, error: "Pick a valid date." };
  const supabase = await createClient();
  const { data: inv } = await supabase.from("invoices").select("id, status, issue_date, due_date, paid_at, client_id, number").eq("id", invoiceId).maybeSingle();
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.status === "cancelled") return { ok: false, error: "Cancelled invoices can't be moved." };

  let patch: Record<string, unknown>;
  let note: string;
  if (inv.status === "paid") {
    if (inv.paid_at?.slice(0, 10) === date) return { ok: true };
    // Midday Tanzania time, so the day never shifts across time zones.
    patch = { paid_at: `${date}T09:00:00Z` };
    note = `Payment date for ${inv.number} moved to ${date}`;
  } else {
    if (inv.due_date === date) return { ok: true };
    if (date < inv.issue_date) return { ok: false, error: `The due date can't be before the invoice date (${inv.issue_date}).` };
    patch = { due_date: date };
    if (inv.status === "sent") { patch.reminder_sent_at = null; patch.overdue_sent_at = null; }
    note = `Due date for ${inv.number} moved from ${inv.due_date} to ${date}`;
  }
  const { error } = await supabase.from("invoices").update(patch).eq("id", invoiceId);
  if (error) return { ok: false, error: error.message };
  await logActivity({ clientId: inv.client_id, actor: "admin", message: note, adminLink: `/admin/invoices/${invoiceId}`, visibleToClient: false });
  revalidatePath("/admin/payments");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  return { ok: true };
}
