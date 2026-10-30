import "server-only";
import { createClient } from "./supabase/server";

export const SETTING_KEYS = ["meta_video_url", "drive_video_url", "meta_business_id", "meta_ad_emails", "drive_share_email", "support_whatsapp", "staff_email", "support_email",
  "invoice_from", "invoice_tin", "mpesa_number", "mpesa_name", "invoice_terms"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
export type Settings = Record<SettingKey, string | null>;

const ENV_FALLBACK: Record<SettingKey, string | undefined> = {
  meta_video_url: process.env.META_ACCESS_VIDEO_URL,
  drive_video_url: process.env.DRIVE_TUTORIAL_VIDEO_URL,
  meta_business_id: process.env.NEXT_PUBLIC_META_BUSINESS_ID,
  meta_ad_emails: "lovrokrizzz1@gmail.com, rodrissjames@gmail.com",
  drive_share_email: process.env.NEXT_PUBLIC_DRIVE_SHARE_EMAIL,
  support_whatsapp: process.env.SUPPORT_WHATSAPP,
  staff_email: process.env.STAFF_EMAIL,
  support_email: process.env.SUPPORT_EMAIL,
  // Invoice defaults (from Safari Digital's current invoice); change them in Admin → Settings.
  invoice_from: "Safari Digital\nA sub-company of Tpromosoft Limited\nTupendane, Manzese, 09 Maula St\nDar es Salaam, Tanzania\nwww.safaridigital.co.tz · +255 746 401 433",
  invoice_tin: undefined,
  mpesa_number: "+255 746 401 433",
  mpesa_name: "LOVRO KRIZAN",
  invoice_terms: "Payment is due by the due date shown above.\nAdvertising budgets are paid directly to Meta or TikTok and are not included.\nAll prices are in US dollars (USD). Please send the M-Pesa reference after paying.",
};

export async function getSettings(): Promise<Settings> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value");
  const out = {} as Settings;
  for (const k of SETTING_KEYS) {
    const v = data?.find((r) => r.key === k)?.value?.trim();
    out[k] = v || ENV_FALLBACK[k] || null;
  }
  return out;
}
