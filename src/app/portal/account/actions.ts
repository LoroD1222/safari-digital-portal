"use server";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseEnv } from "@/lib/supabase/env";

export type AccountState = { error?: string; saved?: boolean };

export async function saveProfile(_: AccountState, form: FormData): Promise<AccountState> {
  const viewer = await requireClient();
  const name = String(form.get("full_name") ?? "").trim().slice(0, 120);
  if (!name) return { error: "Add your name." };
  const { error } = await createAdminClient().from("profiles").update({ full_name: name }).eq("id", viewer.id);
  if (error) return { error: "Couldn't save. " + error.message };
  revalidatePath("/", "layout");
  return { saved: true };
}

export async function changePassword(_: AccountState, form: FormData): Promise<AccountState> {
  const viewer = await requireClient();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("password") ?? "");
  if (!current) return { error: "Enter your current password." };
  if (next.length < 8) return { error: "The new password needs at least 8 characters." };
  // Check the current password without touching this browser's session.
  const { url, key } = supabaseEnv();
  const check = createPlainClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wrong } = await check.auth.signInWithPassword({ email: viewer.email, password: current });
  if (wrong) return { error: "Your current password isn't right." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: "We couldn't update your password. " + error.message };
  return { saved: true };
}
