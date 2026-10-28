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

  if (values.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.support_email)) return { error: "The support email doesn't look like an email address.", values };
  const staff = values.staff_email.split(/[,;\s]+/).filter(Boolean);
  if (staff.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) return { error: "Check the staff notification email.", values };

  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert(SETTING_KEYS.map((key) => ({ key, value: values[key] || null })));
  if (error) return { error: "Couldn't save. " + error.message, values };
  revalidatePath("/", "layout");
  return { saved: true };
}

export type ReportState = { error?: string; message?: string; lines?: string[] };

// Send last month's report for one client to Safari Digital's staff email, without sending it to the client.
export async function previewReport(clientId: string): Promise<ReportState> {
  await requireAdmin();
  const { emailConfigured } = await import("@/lib/email");
  if (!emailConfigured()) return { error: "Email isn't set up yet (RESEND_API_KEY and EMAIL_FROM in Vercel)." };
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "staff_email").maybeSingle();
  const to = ((data?.value as string | null) ?? "").split(/[,;\s]+/).filter((e) => e.includes("@"));
  if (!to.length) return { error: "Add a staff email above first. The preview goes there." };
  const { sendReportPreview } = await import("@/lib/client-emails");
  const ok = await sendReportPreview(clientId, to);
  return ok ? { message: `Preview sent to ${to.join(", ")}.` } : { error: "Resend refused the email. Check that your domain is verified in Resend." };
}

// Send last month's reports now to every client who hasn't had it yet.
export async function sendReportsNow(): Promise<ReportState> {
  await requireAdmin();
  const { sendMonthlyReports } = await import("@/lib/client-emails");
  const res = await sendMonthlyReports(-1);
  const sent = res.filter((r) => r.status === "sent").length;
  return { message: `${sent} sent.`, lines: res.map((r) => `${r.client}: ${r.status}${r.note ? ` (${r.note})` : ""}`) };
}
