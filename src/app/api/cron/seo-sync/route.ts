import { NextResponse, type NextRequest } from "next/server";
import { searchConsoleEmail, syncAllSeo } from "@/lib/search-console";

// Every morning (vercel.json): Google Search Console numbers for SEO clients.
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 401 });
  }
  if (!searchConsoleEmail()) return NextResponse.json({ ok: true, results: "GOOGLE_SERVICE_ACCOUNT not set" });
  return NextResponse.json({ ok: true, results: await syncAllSeo() });
}
