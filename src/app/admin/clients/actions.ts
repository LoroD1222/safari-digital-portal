"use server";
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

const MARKETING = ["starter", "core", "elite"];
const WEBSITE = ["full_build"];
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

function readPrivate(form: FormData): { values: Record<string, unknown>; error?: string } {
  const feeText = text(form, "monthly_fee")?.replace(/[, ]/g, "") ?? null;
  const fee = feeText === null ? null : Number(feeText);
  if (fee !== null && (!Number.isFinite(fee) || fee < 0)) return { values: {}, error: "The monthly price must be a number." };
  const start = text(form, "billing_start");
  return {
    values: {
      monthly_fee: fee === null ? null : Math.round(fee * 100) / 100,
      currency: oneOf(form, "currency", ["USD", "TZS"]) ?? "USD",
      billing_start: start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : null,
      notes: text(form, "notes"),
    },
  };
}

async function savePrivate(supabase: Awaited<ReturnType<typeof createClient>>, clientId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from("client_private").upsert({ client_id: clientId, ...values });
  return error ? (error.message.includes("client_private") ? "Run 0007_billing.sql in Supabase to save prices and notes." : error.message) : null;
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
  revalidatePath("/admin", "layout");
  redirect(`/admin/clients/${data.id}?created=1`);
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
