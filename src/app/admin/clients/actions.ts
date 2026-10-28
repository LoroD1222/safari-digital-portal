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
  return {
    values: {
      monthly_fee: monthly,
      // List prices are in USD; a custom price can be in TZS.
      currency: mkList !== null ? "USD" : (oneOf(form, "currency", ["USD", "TZS"]) ?? "USD"),
      discount_type: d.type, discount_value: mkList !== null ? d.value : 0,
      website_fee: webFee,
      website_discount_type: wd.type, website_discount_value: webList !== null ? wd.value : 0,
      billing_start: start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : null,
      notes: text(form, "notes"),
    },
  };
}

async function savePrivate(supabase: Awaited<ReturnType<typeof createClient>>, clientId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from("client_private").upsert({ client_id: clientId, ...values });
  if (!error) return null;
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
  if (error || !data) return { error: "Couldn't add the client. " + (error?.message ?? ""), values: echo(form) };
  await savePrivate(supabase, data.id, priv.values);
  let invite = "";
  if (form.get("invite_now") === "on" && values.contact_email) {
    const { inviteToPortal } = await import("./access-actions");
    const r = await inviteToPortal(data.id, values.contact_email.toLowerCase(), true);
    invite = r.error ? `&invite_error=${encodeURIComponent(r.error)}` : r.emailed ? `&invited=${encodeURIComponent(values.contact_email)}` : `&invite_link=1`;
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/clients/${data.id}?created=1${invite}`);
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
  if (error) return { error: "Couldn't save the changes. " + error.message, values: echo(form) };
  const privError = await savePrivate(supabase, id, priv.values);
  if (privError) return { error: privError, values: echo(form) };
  revalidatePath("/admin", "layout");
  return { saved: true };
}
