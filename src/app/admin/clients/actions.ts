"use server";
import { MARKETING_PRICE, WEBSITE_PRICE, discounted, type DiscountType, type MarketingPackage, type WebsitePackage } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ClientFormState = { error?: string; fieldErrors?: Record<string, string>; saved?: boolean; values?: Record<string, string> };

// Echo what was typed back to the form, so a validation error doesn't wipe it.
function echo(form: FormData) {
  const out: Record<string, string> = {};
  form.forEach((v, k) => { if (typeof v === "string" && !k.startsWith("$")) out[k] = v; });
  return out;
}

const MARKETING = ["growth", "scale", "partner"];
const WEBSITE = ["landing_page", "tour_operator", "advanced"];
const ONBOARDING = ["not_started", "in_progress", "submitted", "being_reviewed", "setup_complete"];
const ACCOUNT = ["invited", "active", "paused"];

function text(form: FormData, key: string) {
  const v = form.get(key);
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}
function oneOf(form: FormData, key: string, allowed: string[]) {
  const v = text(form, key);
  return v && allowed.includes(v) ? v : null;
}

function readDiscount(form: FormData, prefix: string): { type: DiscountType; value: number } | { error: string } {
  const type = (oneOf(form, `${prefix}discount_type`, ["percent", "amount"]) ?? "percent") as DiscountType;
  const raw = text(form, `${prefix}discount_value`)?.replace(/[, %$]/g, "") ?? "0";
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return { error: "The discount must be a positive number." };
  if (type === "percent" && value > 100) return { error: "A percentage discount can't be more than 100%." };
  return { type, value: Math.round(value * 100) / 100 };
}

function money(form: FormData, key: string) {
  const t = text(form, key)?.replace(/[, ]/g, "") ?? null;
  if (t === null) return { value: null as number | null };
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? { value: Math.round(n * 100) / 100 } : { error: "Prices must be numbers." };
}

// Prices follow the package list price, minus an optional discount.
// Custom packages (Marketing Partner, Advanced Website) take a typed price.
function readPrivate(form: FormData): { values: Record<string, unknown>; error?: string } {
  const mk = oneOf(form, "marketing_package", MARKETING) as MarketingPackage | null;
  const web = oneOf(form, "website_package", WEBSITE) as WebsitePackage | null;
  const d = readDiscount(form, "");
  const wd = readDiscount(form, "website_");
  if ("error" in d) return { values: {}, error: d.error };
  if ("error" in wd) return { values: {}, error: wd.error };

  const mkList = mk ? MARKETING_PRICE[mk] : null;
  const typed = money(form, "monthly_fee");
  if ("error" in typed) return { values: {}, error: "The monthly price must be a number." };
  const monthly = !mk ? null : mkList !== null ? discounted(mkList, d.type, d.value) : typed.value;

  const webList = web ? WEBSITE_PRICE[web] : null;
  const typedWeb = money(form, "website_fee");
  if ("error" in typedWeb) return { values: {}, error: "The website price must be a number." };
  const webFee = !web ? null : webList !== null ? discounted(webList, wd.type, wd.value) : typedWeb.value;


  const start = text(form, "billing_start");
  const built = text(form, "website_built_on");
  return {
    values: {
      monthly_fee: monthly,
      // List prices are in USD; a custom price or an SEO plan can be in TZS.
      currency: mk && mkList !== null ? "USD" : (oneOf(form, "currency", ["USD", "TZS"]) ?? "USD"),
      discount_type: d.type, discount_value: mkList !== null ? d.value : 0,
      website_fee: webFee,
      website_discount_type: wd.type, website_discount_value: webList !== null ? wd.value : 0,
      billing_start: start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : null,
      website_built_on: web && built && /^\d{4}-\d{2}$/.test(built) ? `${built}-01` : null,
      notes: text(form, "notes"),
    },
  };
}

// The SEO plan rows from the form: seo_months, then seo_title_n / seo_price_n / seo_backlinks_n.
function readSeoPlan(form: FormData): { rows: { month_no: number; title: string; price: number; backlinks: number }[] } | { error: string } {
  const n = Math.min(36, Math.max(1, Number(form.get("seo_months")) || 0));
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const price = money(form, `seo_price_${i}`), backlinks = money(form, `seo_backlinks_${i}`);
    if ("error" in price || "error" in backlinks) return { error: `Month ${i}: prices must be numbers.` };
    rows.push({ month_no: i, title: (text(form, `seo_title_${i}`) ?? "").slice(0, 120), price: price.value ?? 0, backlinks: backlinks.value ?? 0 });
  }
  return { rows };
}

async function saveSeoPlan(supabase: Awaited<ReturnType<typeof createClient>>, clientId: string, form: FormData) {
  if (!form.has("seo_field")) return null;
  const on = form.get("seo_enabled") === "on";
  const plan = on ? readSeoPlan(form) : { rows: [] };
  if ("error" in plan) return plan.error;
  const { error } = await supabase.from("seo_plan").delete().eq("client_id", clientId);
  if (error) return /seo_plan/.test(error.message) ? "Run 0032_seo.sql in Supabase to save the SEO plan." : error.message;
  if (plan.rows.length) {
    const { error: e2 } = await supabase.from("seo_plan").insert(plan.rows.map((r) => ({ client_id: clientId, ...r })));
    if (e2) return e2.message;
  }
  return null;
}

async function savePrivate(supabase: Awaited<ReturnType<typeof createClient>>, clientId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from("client_private").upsert({ client_id: clientId, ...values });
  if (!error) return null;
  if (/website_built_on/.test(error.message)) return "Run 0019_website_month.sql in Supabase to save the website month.";
  if (/discount|website_fee/.test(error.message)) return "Run 0010_packages.sql in Supabase to save package prices and discounts.";
  return error.message.includes("client_private") ? "Run 0007_billing.sql in Supabase to save prices and notes." : error.message;
}

function readClient(form: FormData) {
  const fieldErrors: Record<string, string> = {};
  const name = text(form, "name");
  if (!name) fieldErrors.name = "Add the company name.";
  const email = text(form, "contact_email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.contact_email = "That doesn't look like an email address.";
  const values = {
    name: name ?? "",
    contact_name: text(form, "contact_name"),
    contact_email: email,
    whatsapp: text(form, "whatsapp"),
    website_url: text(form, "website_url"),
    marketing_package: oneOf(form, "marketing_package", MARKETING),
    website_package: oneOf(form, "website_package", WEBSITE),
    ...(form.has("seo_field") ? {
      seo_enabled: form.get("seo_enabled") === "on",
      seo_start: form.get("seo_enabled") === "on" && /^\d{4}-\d{2}$/.test(String(form.get("seo_start") ?? "")) ? `${form.get("seo_start")}-01` : null,
    } : {}),
  };
  return { values, fieldErrors };
}

export async function createClientRecord(_: ClientFormState, form: FormData): Promise<ClientFormState> {
  await requireAdmin();
  const { values, fieldErrors } = readClient(form);
  const priv = readPrivate(form);
  if (priv.error) fieldErrors.monthly_fee = priv.error;
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: echo(form) };

  const supabase = await createClient();
  const { data, error } = await supabase.from("clients").insert(values).select("id").single();
  if (error || !data) return { error: /seo_enabled/.test(error?.message ?? "") ? "Run 0032_seo.sql in Supabase to add SEO clients." : "Couldn't add the client. " + (error?.message ?? ""), values: echo(form) };
  await savePrivate(supabase, data.id, priv.values);
  await saveSeoPlan(supabase, data.id, form);
  let invite = "";
  if (form.get("invite_now") === "on" && values.contact_email) {
    const { inviteToPortal } = await import("./access-actions");
    const r = await inviteToPortal(data.id, values.contact_email.toLowerCase(), true);
    invite = r.error ? `&invite_error=${encodeURIComponent(r.error)}` : r.emailed ? `&invited=${encodeURIComponent(values.contact_email)}` : `&invite_link=1`;
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/clients/${data.id}?created=1${invite}`);
}

// Internal = Safari Digital's own business: out of client counts, income and invoices.
export async function setClientInternal(id: string, internal: boolean): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ is_internal: internal }).eq("id", id);
  if (error) return { ok: false, error: /is_internal/.test(error.message) ? "Run 0025_internal_client.sql in Supabase first." : error.message };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function updateClientRecord(id: string, _: ClientFormState, form: FormData): Promise<ClientFormState> {
  await requireAdmin();
  const { values, fieldErrors } = readClient(form);
  const priv = readPrivate(form);
  if (priv.error) fieldErrors.monthly_fee = priv.error;
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: echo(form) };
  const update = {
    ...values,
    onboarding_status: oneOf(form, "onboarding_status", ONBOARDING) ?? "not_started",
    account_status: oneOf(form, "account_status", ACCOUNT) ?? "invited",
  };

  const supabase = await createClient();
  const { error } = await supabase.from("clients").update(update).eq("id", id);
  if (error) return { error: /seo_enabled/.test(error.message) ? "Run 0032_seo.sql in Supabase to turn on SEO." : "Couldn't save the changes. " + error.message, values: echo(form) };
  const privError = (await savePrivate(supabase, id, priv.values)) ?? (await saveSeoPlan(supabase, id, form));
  if (privError) return { error: privError, values: echo(form) };
  revalidatePath("/admin", "layout");
  return { saved: true };
}
