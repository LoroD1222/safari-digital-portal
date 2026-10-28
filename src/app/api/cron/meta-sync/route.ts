import { NextResponse, type NextRequest } from "next/server";
import { metaConfigured, syncAll } from "@/lib/meta";
import { retryMetaEvents } from "@/lib/meta-events";
import { sendMonthlyReports } from "@/lib/client-emails";
import { createMonthlyDrafts, invoiceReminders } from "@/lib/invoices";

// Runs every morning (vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET".
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 401 });
  }
  const results = metaConfigured() ? await syncAll() : "META_SYSTEM_USER_TOKEN not set";
  const events = await retryMetaEvents();
  // After last month's final Meta numbers are in. Days 1–3 so a missed run catches up.
  const day = new Date(Date.now() + 3 * 3600e3).getUTCDate();
  const reports = day <= 3 ? await sendMonthlyReports(-1) : "not the start of the month";
  // Invoices: drafts for the new month (checked and sent by Safari Digital), then due/overdue reminders.
  const drafts = day <= 3 ? await createMonthlyDrafts() : "not the start of the month";
  const reminders = await invoiceReminders();
  return NextResponse.json({ ok: true, results, events, reports, drafts, reminders });
}
