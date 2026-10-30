import { NextResponse, type NextRequest } from "next/server";
import { runFollowups } from "@/lib/followups";

// Daily follow-up emails to guests, at 06:00 UTC = 09:00 Tanzania time (vercel.json).
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
