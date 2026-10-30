import { NextResponse, type NextRequest } from "next/server";
import { metaConfigured, syncAll } from "@/lib/meta";
import { retryMetaEvents } from "@/lib/meta-events";

// Hourly Meta sync (ad results, campaigns, ads) + resending failed lead events.
// Called by Supabase pg_cron (0019_hourly_meta_sync.sql) with "Authorization: Bearer $CRON_SECRET".
// Monthly reports and invoices stay in the daily /api/cron/meta-sync job.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 401 });
  }
  const results = metaConfigured() ? await syncAll() : "META_SYSTEM_USER_TOKEN not set";
  const events = await retryMetaEvents();
  return NextResponse.json({ ok: true, at: new Date().toISOString(), results, events });
}
