"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SETTING_KEYS } from "@/lib/settings";

export type SettingsState = { error?: string; saved?: boolean; values?: Record<string, string> };

export async function saveSettings(_: SettingsState, form: FormData): Promise<SettingsState> {
  await requireAdmin();
  const values: Record<string, string> = {};
  for (const k of SETTING_KEYS) values[k] = String(form.get(k) ?? "").trim();

  for (const k of ["meta_video_url", "drive_video_url"]) {
    if (values[k] && !/^https:\/\//.test(values[k])) return { error: "Video links must start with https://", values };
  }
  if (values.drive_share_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.drive_share_email)) {
    return { error: "The Drive share email doesn't look like an email address.", values };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert(SETTING_KEYS.map((key) => ({ key, value: values[key] || null })));
  if (error) return { error: "Couldn't save. " + error.message, values };
  revalidatePath("/", "layout");
  return { saved: true };
}
