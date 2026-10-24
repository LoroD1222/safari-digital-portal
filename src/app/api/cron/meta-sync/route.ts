import { NextResponse, type NextRequest } from "next/server";
import { metaConfigured, syncAll } from "@/lib/meta";
import { retryMetaEvents } from "@/lib/meta-events";

// Runs every morning (vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET".
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 401 });
  }
  if (!metaConfigured()) return NextResponse.json({ ok: true, skipped: "META_SYSTEM_USER_TOKEN not set" });
  const results = await syncAll();
  const events = await retryMetaEvents();
  return NextResponse.json({ ok: true, results, events });
}
