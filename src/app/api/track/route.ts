import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Page views from the Safari Digital snippet (/s.js). No cookies, no IP stored:
// a visitor is a hash of IP + browser + the day, so it can't be traced back.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor/i;
const keys = new Map<string, { id: string; since: string | null; at: number }>();

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const ok = new NextResponse(null, { status: 204, headers: CORS });
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT.test(ua)) return ok;
  let body: { k?: string; p?: string; r?: string };
  try { body = JSON.parse(await req.text()); } catch { return ok; }
  const key = typeof body.k === "string" ? body.k.slice(0, 100) : "";
  if (!key) return ok;

  const admin = createAdminClient();
  let c = keys.get(key);
  if (!c || Date.now() - c.at > 10 * 60_000) {
    const { data } = await admin.from("clients").select("id, tracking_since").eq("inquiry_form_key", key).maybeSingle();
    if (!data) return ok;
    c = { id: data.id, since: data.tracking_since, at: Date.now() };
    keys.set(key, c);
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const dayTz = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const salt = process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sd";
  const visitor = createHash("sha256").update(`${salt}|${dayTz}|${c.id}|${ip}|${ua}`).digest("hex").slice(0, 20);
  const path = (typeof body.p === "string" ? body.p : "/").split("?")[0].slice(0, 300) || "/";
  let referrer: string | null = null;
  try { const r = typeof body.r === "string" && body.r ? new URL(body.r) : null; referrer = r ? r.hostname.replace(/^www\./, "") : null; } catch { /* ignore */ }
  const device = /iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop";

  const { error } = await admin.from("page_views").insert({
    client_id: c.id, visitor, path, referrer, country: req.headers.get("x-vercel-ip-country") ?? null, device,
  });
  if (!error && !c.since) {
    c.since = new Date().toISOString();
    await admin.from("clients").update({ tracking_since: c.since }).eq("id", c.id).is("tracking_since", null);
  }
  return ok;
}
