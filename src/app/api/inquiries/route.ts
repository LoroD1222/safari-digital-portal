import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { after } from "next/server";
import { logActivity } from "@/lib/activity";
import { sendInquiryEvent } from "@/lib/meta-events";

// Website inquiry forms post here. Each client has their own form key
// (Admin → client → Connections). Accepts JSON or a normal HTML form post.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Portal-Key",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const ALIASES: Record<string, string[]> = {
  name: ["name", "full_name", "fullName", "customer_name"],
  email: ["email"],
  phone: ["phone", "whatsapp", "tel", "mobile"],
  country: ["country"],
  interested_in: ["interested_in", "interest", "tour", "safari", "package", "trip"],
  travel_dates: ["travel_dates", "dates", "date", "travel_date", "arrival"],
  travellers: ["travellers", "travelers", "guests", "people", "pax"],
  message: ["message", "comments", "notes"],
  utm_source: ["utm_source"],
  utm_medium: ["utm_medium"],
  utm_campaign: ["utm_campaign"],
  fbclid: ["fbclid"],
  fbc: ["fbc", "_fbc"],
  fbp: ["fbp", "_fbp"],
  key: ["key", "form_key", "portal_key"],
  redirect: ["redirect", "_redirect", "_next"],
  honeypot: ["_gotcha", "website_url_confirm"],
};

function pick(data: Record<string, unknown>, field: string, max = 500) {
  for (const k of ALIASES[field]) {
    const v = data[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, max);
    if (typeof v === "number") return String(v);
  }
  return null;
}

const META = ["facebook", "fb", "instagram", "ig", "meta", "an", "messenger"];
const PAID = ["paid", "cpc", "ppc", "paid_social", "paidsocial", "ads", "ad", "cpm"];

function sourceOf(utmSource: string | null, utmMedium: string | null, fbclid: string | null) {
  const s = utmSource?.toLowerCase() ?? "";
  const m = utmMedium?.toLowerCase() ?? "";
  if (META.includes(s) || (!s && fbclid)) return PAID.includes(m) ? "meta_ads" : "meta_organic";
  return "website";
}

function reply(req: NextRequest, redirectTo: string | null, status: number, body: Record<string, unknown>) {
  if (redirectTo && /^https?:\/\//.test(redirectTo) && status < 300) {
    return NextResponse.redirect(redirectTo, { status: 303, headers: CORS });
  }
  return NextResponse.json(body, { status, headers: CORS });
}

export async function POST(req: NextRequest) {
  let data: Record<string, unknown> = {};
  try {
    const type = req.headers.get("content-type") ?? "";
    if (type.includes("application/json")) data = (await req.json()) as Record<string, unknown>;
    else data = Object.fromEntries((await req.formData()).entries());
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't read the form." }, { status: 400, headers: CORS });
  }
  return handle(req, data);
}

async function handle(req: NextRequest, data: Record<string, unknown>) {
  const redirectTo = pick(data, "redirect", 1000);
  // Bots fill hidden fields; pretend it worked.
  if (pick(data, "honeypot")) return reply(req, redirectTo, 200, { ok: true });

  const key = req.headers.get("x-portal-key")?.trim() || pick(data, "key", 100);
  if (!key) return reply(req, null, 401, { ok: false, error: "Missing form key." });

  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("id, name").eq("inquiry_form_key", key).maybeSingle();
  if (!client) return reply(req, null, 401, { ok: false, error: "Unknown form key." });

  const name = pick(data, "name", 200);
  const email = pick(data, "email", 200);
  const phone = pick(data, "phone", 60);
  if (!name) return reply(req, null, 422, { ok: false, error: "Please add your name." });
  if (!email && !phone) return reply(req, null, 422, { ok: false, error: "Please add an email or phone number." });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(req, null, 422, { ok: false, error: "That email doesn't look right." });

  const utmSource = pick(data, "utm_source", 100);
  const fbclid = pick(data, "fbclid", 500);
  // Meta's click ID: the _fbc cookie if the site sends it, otherwise built from fbclid.
  const fbcRaw = pick(data, "fbc", 600);
  const fbc = fbcRaw && /^fb\.\d\.\d+\..+/.test(fbcRaw) ? fbcRaw : fbclid ? `fb.1.${Date.now()}.${fbclid}` : null;
  const fbpRaw = pick(data, "fbp", 200);
  const fbp = fbpRaw && /^fb\.\d\.\d+\.\d+/.test(fbpRaw) ? fbpRaw : null;
  const utmMedium = pick(data, "utm_medium", 100);
  const base = {
    client_id: client.id,
    customer_name: name,
    email,
    phone,
    country: pick(data, "country", 100),
    interested_in: pick(data, "interested_in", 300),
    travel_dates: pick(data, "travel_dates", 200),
    travellers: pick(data, "travellers", 100),
    message: pick(data, "message", 5000),
    source: sourceOf(utmSource, utmMedium, fbclid ?? (fbc ? "fbc" : null)),
    campaign: pick(data, "utm_campaign", 200),
    channel: "website_form",
    origin: "website_form",
  };
  let { data: row, error } = await admin.from("inquiries").insert({ ...base, fbc, fbp }).select("id").single();
  // Before 0008_meta_events.sql is run there are no fbc/fbp columns: save without them.
  if (error && /fbc|fbp/.test(error.message)) ({ data: row, error } = await admin.from("inquiries").insert(base).select("id").single());
  if (error || !row) return reply(req, null, 500, { ok: false, error: "Couldn't save the inquiry. Please try again." });

  const inquiryId = row.id;
  after(() => sendInquiryEvent(inquiryId, "Lead"));
  await logActivity({
    clientId: client.id, actor: "client", message: `New website inquiry from ${name}`,
    clientLink: "/portal/inquiries", adminLink: `/admin/inquiries?client=${client.id}`,
  });
  return reply(req, redirectTo, 200, { ok: true });
}
