import { NextResponse, type NextRequest } from "next/server";
import { runFollowups } from "@/lib/followups";

// Follow-up emails to guests, every 5 minutes (vercel.json). Day steps wait for Monday–Friday
// 9:00–17:00 in the guest's time zone; minute and hour steps for 8:00–20:00, any day.
// Vercel cron sends "Authorization: Bearer $CRON_SECRET".
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 401 });
  }
  const result = await runFollowups();
  return NextResponse.json({ at: new Date().toISOString(), ...result });
}
