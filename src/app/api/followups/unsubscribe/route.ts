import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validUnsubscribe } from "@/lib/followups";

// The "Unsubscribe" link at the bottom of every follow-up email.
// GET shows a confirm button (so email scanners that open links don't unsubscribe anyone);
// POST stops the follow-ups. Email apps' one-click unsubscribe also POSTs here.

function page(title: string, body: string, form?: { i: string; t: string }) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const button = form
    ? `<form method="post" action="?i=${encodeURIComponent(form.i)}&t=${encodeURIComponent(form.t)}"><button style="margin-top:8px;height:42px;padding:0 18px;border:0;border-radius:8px;background:#1d1f2b;color:#fff;font:inherit;font-weight:600;cursor:pointer">Unsubscribe</button></form>`
    : "";
  return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1d1f2b;background:#f7f8f6">
<main style="max-width:440px;margin:64px auto;padding:28px 24px;background:#fff;border-radius:12px;border:1px solid #e6e8ec">
<h1 style="margin:0 0 8px;font-size:20px">${esc(title)}</h1><p style="margin:0;color:#4a4f63">${esc(body)}</p>${button}</main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function company(inquiryId: string) {
  const admin = createAdminClient();
  const { data: q } = await admin.from("inquiries").select("client_id, clients(name)").eq("id", inquiryId).maybeSingle();
  const c = q?.clients as { name?: string } | { name?: string }[] | null | undefined;
  return (Array.isArray(c) ? c[0]?.name : c?.name) ?? "the tour company";
}

export async function GET(req: NextRequest) {
  const i = req.nextUrl.searchParams.get("i") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  if (!validUnsubscribe(i, t)) return page("Link not valid", "This unsubscribe link is incomplete. Reply to the email and ask to stop the reminders.");
  const name = await company(i);
  return page("Stop reminder emails?", `${name} won't send you any more automatic reminders about your trip. You can still reply to them any time.`, { i, t });
}

export async function POST(req: NextRequest) {
  const i = req.nextUrl.searchParams.get("i") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  if (!validUnsubscribe(i, t)) return page("Link not valid", "This unsubscribe link is incomplete. Reply to the email and ask to stop the reminders.");
  const admin = createAdminClient();
  await admin.from("inquiries").update({ followups_stopped_at: new Date().toISOString() }).eq("id", i).is("followups_stopped_at", null);
  const name = await company(i);
  return page("You're unsubscribed", `${name} won't send you any more automatic reminders. You can still reply to their messages any time.`);
}
