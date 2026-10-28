import "server-only";
import { createAdminClient } from "./supabase/admin";
import { clientEmails, emailConfigured, send, staffAddresses } from "./email";
import { siteOrigin } from "./origin";
import { monthBounds } from "./dates";
import { logActivity } from "./activity";
import { invoicePdf, type InvoicePdfData } from "./invoice-pdf";
import {
  MARKETING_FEATURES, MARKETING_LABEL, MARKETING_PRICE, discounted, formatMoney, invoiceTotal,
  type DiscountType, type Invoice, type InvoiceItem, type MarketingPackage,
} from "./types";

type Admin = ReturnType<typeof createAdminClient>;
const SETTINGS = ["invoice_from", "invoice_tin", "mpesa_number", "mpesa_name", "invoice_terms"] as const;
const DEFAULTS: Record<(typeof SETTINGS)[number], string | null> = {
  invoice_from: "Safari Digital\nA sub-company of Tpromosoft Limited\nTupendane, Manzese, 09 Maula St\nDar es Salaam, Tanzania\nwww.safaridigital.co.tz · +255 746 401 433",
  invoice_tin: null,
  mpesa_number: "+255 746 401 433",
  mpesa_name: "LOVRO KRIZAN",
  invoice_terms: "Payment is due by the due date shown above.\nAdvertising budgets are paid directly to Meta or TikTok and are not included.\nAll prices are in US dollars (USD). Please send the M-Pesa reference after paying.",
};

export function todayTz(now = new Date()) {
  return new Date(now.getTime() + 3 * 3600e3).toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number) {
  return new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
}

export async function nextNumber(db: Admin | Awaited<ReturnType<typeof import("./supabase/server").createClient>>) {
  const { data, error } = await db.rpc("next_invoice_number");
  if (error || !data) throw new Error(error?.message.includes("next_invoice_number") ? "Run 0012_invoices.sql in Supabase first." : (error?.message ?? "No invoice number"));
  return data as string;
}

// Line items for a client's monthly marketing fee: list price, then the discount as its own line.
export async function monthlyItems(db: Admin, clientId: string, period: string): Promise<InvoiceItem[]> {
  const [{ data: c }, { data: p }] = await Promise.all([
    db.from("clients").select("marketing_package").eq("id", clientId).single(),
    db.from("client_private").select("monthly_fee, discount_type, discount_value").eq("client_id", clientId).maybeSingle(),
  ]);
  const pkg = c?.marketing_package as MarketingPackage | null;
  if (!pkg) return [];
  const label = monthBounds(0, new Date(period + "T00:00:00Z")).label;
  const list = MARKETING_PRICE[pkg];
  const details = MARKETING_FEATURES[pkg]?.join(" · ") ?? null;
  const title = `${MARKETING_LABEL[pkg]} Marketing · ${label}`;
  if (list === null) {
    return [{ description: title, details, amount: Number(p?.monthly_fee ?? 0) }];
  }
  const items: InvoiceItem[] = [{ description: title, details, amount: list }];
  const type = (p?.discount_type ?? "percent") as DiscountType;
  const value = Number(p?.discount_value ?? 0);
  const final = discounted(list, type, value);
  if (final < list) items.push({ description: `Discount${type === "percent" ? ` (${value}%)` : ""}`, amount: -(Math.round((list - final) * 100) / 100) });
  return items;
}

// On the 1st: a draft for every marketing client, for Safari Digital to check and send.
export async function createMonthlyDrafts(now = new Date()) {
  const db = createAdminClient();
  const period = monthBounds(0, now).start;
  const today = todayTz(now);
  const { data: clients } = await db.from("clients").select("id, name").neq("account_status", "paused").not("marketing_package", "is", null);
  const made: string[] = [];
  for (const c of clients ?? []) {
    const { data: existing, error } = await db.from("invoices").select("id").eq("client_id", c.id).eq("kind", "monthly").eq("period_month", period).neq("status", "cancelled").maybeSingle();
    if (error) return { made, error: "Run 0012_invoices.sql in Supabase." };
    if (existing) continue;
    const items = await monthlyItems(db, c.id, period);
    const total = invoiceTotal(items);
    if (!items.length || total <= 0) continue;
    const { error: e2 } = await db.from("invoices").insert({
      client_id: c.id, number: await nextNumber(db), kind: "monthly", period_month: period, status: "draft",
      currency: "USD", issue_date: today, due_date: addDays(today, 14), items, total,
    });
    if (!e2) made.push(c.name as string);
  }
  if (made.length && emailConfigured()) {
    await send(await staffAddresses(), {
      subject: `${made.length} ${made.length === 1 ? "invoice needs" : "invoices need"} your approval`,
      heading: `${monthBounds(0, now).label} invoices are ready`,
      intro: `Invoices were prepared for ${made.join(", ")}. Check each one, edit if needed, then click Approve and send. Nothing is sent to clients until you do.`,
      path: "/admin/invoices?status=draft", button: "Review and approve",
    }, await siteOrigin());
  }
  return { made };
}

async function settings(db: Admin) {
  const { data } = await db.from("app_settings").select("key, value").in("key", SETTINGS as unknown as string[]);
  const out = { ...DEFAULTS };
  for (const k of SETTINGS) { const v = data?.find((r) => r.key === k)?.value?.trim(); if (v) out[k] = v; }
  return out;
}

export async function pdfData(db: Admin, invoice: Invoice): Promise<InvoicePdfData> {
  const [{ data: c }, set] = await Promise.all([
    db.from("clients").select("name, contact_name, contact_email, whatsapp, website_url").eq("id", invoice.client_id).single(),
    settings(db),
  ]);
  return {
    invoice, client: { name: c?.name ?? "Client", contact_name: c?.contact_name, contact_email: c?.contact_email, whatsapp: c?.whatsapp, website_url: c?.website_url },
    from: set.invoice_from ?? "Safari Digital", tin: set.invoice_tin, mpesaNumber: set.mpesa_number, mpesaName: set.mpesa_name, terms: set.invoice_terms,
  };
}

// Who receives invoices: everyone who logs in, else the contact email.
export async function billingEmails(db: Admin, clientId: string) {
  const logins = await clientEmails(clientId);
  if (logins.length) return logins;
  const { data } = await db.from("clients").select("contact_email").eq("id", clientId).single();
  return data?.contact_email ? [data.contact_email as string] : [];
}

const fmtDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

async function emailInvoice(db: Admin, inv: Invoice, kind: "new" | "updated" | "reminder" | "overdue" | "receipt") {
  const to = await billingEmails(db, inv.client_id);
  if (!to.length) return { ok: false, error: "This client has no email address. Add a contact email or give them a login." };
  const data = await pdfData(db, inv);
  const pdf = await invoicePdf(data);
  const amount = formatMoney(Number(inv.total), inv.currency);
  const copy = {
    new: { subject: `Invoice ${inv.number} from Safari Digital · ${amount}`, heading: `Invoice ${inv.number}`, intro: `Here is your invoice for ${amount}, due on ${fmtDay(inv.due_date)}. The PDF is attached.` },
    updated: { subject: `Updated invoice ${inv.number} from Safari Digital · ${amount}`, heading: `Invoice ${inv.number} was updated`, intro: `We've updated invoice ${inv.number}. The new total is ${amount}, due on ${fmtDay(inv.due_date)}. The updated PDF is attached and replaces the earlier one.` },
    reminder: { subject: `Reminder: invoice ${inv.number} is due on ${fmtDay(inv.due_date)}`, heading: "A friendly reminder", intro: `Invoice ${inv.number} for ${amount} is due on ${fmtDay(inv.due_date)}. If you've already paid, thank you, and please send us the M-Pesa reference.` },
    overdue: { subject: `Invoice ${inv.number} is overdue`, heading: `Invoice ${inv.number} is overdue`, intro: `We haven't received payment for invoice ${inv.number} (${amount}), which was due on ${fmtDay(inv.due_date)}. Please pay by M-Pesa, or let us know if anything is unclear.` },
    receipt: { subject: `Payment received · invoice ${inv.number}`, heading: "Thank you, payment received", intro: `We've received your payment of ${amount} for invoice ${inv.number}. Your updated invoice marked Paid is attached.` },
  }[kind];
  const ok = await send(to, {
    ...copy,
    rows: kind === "receipt" ? [["Invoice", inv.number], ["Amount", amount], ["Paid on", inv.paid_at ? fmtDay(inv.paid_at) : null]] : [
      ["Amount due", amount], ["Due date", fmtDay(inv.due_date)], ["Pay with M-Pesa", data.mpesaNumber], ["Name", data.mpesaName], ["Reference", inv.number],
    ],
    path: "/portal/account#billing", button: "View in portal",
    attachments: [{ filename: `${inv.number}.pdf`, content: pdf.toString("base64") }],
    footer: "Questions about this invoice? Reply on WhatsApp or email Safari Digital.",
  }, await siteOrigin());
  return ok ? { ok: true as const, to } : { ok: false as const, error: "Resend refused the email. Check Resend → Logs." };
}

// Admin "Send": emails the PDF and marks the invoice sent.
export async function sendInvoiceNow(id: string, updated = false) {
  if (!emailConfigured()) return { ok: false, error: "Email isn't set up yet (RESEND_API_KEY and EMAIL_FROM in Vercel)." };
  const db = createAdminClient();
  const { data } = await db.from("invoices").select("*").eq("id", id).single();
  const inv = data as Invoice | null;
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.status === "cancelled") return { ok: false, error: "This invoice is cancelled." };
  if (!inv.items.length || Number(inv.total) <= 0) return { ok: false, error: "Add at least one line with an amount first." };
  const res = await emailInvoice(db, inv, inv.status === "paid" ? "receipt" : updated && inv.status === "sent" ? "updated" : "new");
  if (!res.ok) return res;
  if (inv.status === "draft") {
    await db.from("invoices").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
    await logActivity({ clientId: inv.client_id, actor: "admin", message: `Invoice ${inv.number} sent (${formatMoney(Number(inv.total), inv.currency)})`, clientLink: "/portal/account#billing", adminLink: `/admin/invoices/${id}` });
  }
  return { ok: true, error: undefined, to: res.to };
}

export async function sendReceipt(id: string) {
  if (!emailConfigured()) return;
  const db = createAdminClient();
  const { data } = await db.from("invoices").select("*").eq("id", id).single();
  if (data) await emailInvoice(db, data as Invoice, "receipt");
}

// Daily: a reminder 3 days before the due date, and one notice the day after it.
export async function invoiceReminders(now = new Date()) {
  if (!emailConfigured()) return { reminders: 0, overdue: 0 };
  const db = createAdminClient();
  const today = todayTz(now);
  const { data, error } = await db.from("invoices").select("*").eq("status", "sent");
  if (error) return { reminders: 0, overdue: 0 };
  let reminders = 0, overdue = 0;
  const late: string[] = [];
  const clients = new Map<string, string>();
  for (const inv of (data ?? []) as Invoice[]) {
    if (!inv.reminder_sent_at && inv.due_date === addDays(today, 3)) {
      const r = await emailInvoice(db, inv, "reminder");
      if (r.ok) { reminders++; await db.from("invoices").update({ reminder_sent_at: new Date().toISOString() }).eq("id", inv.id); }
    }
    if (!inv.overdue_sent_at && inv.due_date < today) {
      const r = await emailInvoice(db, inv, "overdue");
      if (r.ok) {
        overdue++;
        await db.from("invoices").update({ overdue_sent_at: new Date().toISOString() }).eq("id", inv.id);
        if (!clients.size) {
          const { data: cs } = await db.from("clients").select("id, name");
          for (const c of cs ?? []) clients.set(c.id, c.name);
        }
        late.push(`${clients.get(inv.client_id) ?? "Client"} · ${inv.number} · ${formatMoney(Number(inv.total), inv.currency)}`);
      }
    }
  }
  if (late.length) {
    await send(await staffAddresses(), {
      subject: `${late.length} ${late.length === 1 ? "invoice is" : "invoices are"} overdue`,
      heading: "Overdue invoices", intro: "These clients were sent an overdue notice today:", detail: late.join("\n"),
      path: "/admin/invoices?status=overdue", button: "Open invoices",
    }, await siteOrigin());
  }
  return { reminders, overdue };
}
