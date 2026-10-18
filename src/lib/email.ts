import "server-only";
import { after } from "next/server";
import { createAdminClient } from "./supabase/admin";
import { siteOrigin } from "./origin";

// Email notifications, sent through Resend (resend.com).
// Needs RESEND_API_KEY and EMAIL_FROM in Vercel's Environment Variables.
// Without them nothing is sent and everything else keeps working.

export function emailConfigured() {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

type Message = { subject: string; intro: string; detail?: string | null; path: string; button: string };

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function render(m: Message, url: string) {
  const detail = m.detail?.trim() ? `<p style="margin:0 0 20px;padding:12px 14px;background:#F7F8F6;border-radius:8px;color:#3F4458;white-space:pre-wrap">${esc(m.detail.trim().slice(0, 1200))}</p>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,Segoe UI,Inter,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#000321">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<p style="margin:0 0 24px;font-weight:700;color:#0D3B2E;font-size:16px">Safari Digital</p>
<p style="margin:0 0 16px">${esc(m.intro)}</p>${detail}
<p style="margin:0 0 28px"><a href="${esc(url)}" style="display:inline-block;background:#1A6647;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">${esc(m.button)}</a></p>
<p style="margin:0;color:#565A7C;font-size:13px">You're getting this because you have an account on the Safari Digital portal.</p>
</div></body></html>`;
  const text = `${m.intro}\n\n${m.detail?.trim() ? m.detail.trim() + "\n\n" : ""}${m.button}: ${url}`;
  return { html, text };
}

async function send(to: string[], m: Message, origin: string) {
  if (!emailConfigured() || to.length === 0) return;
  const url = (process.env.PORTAL_URL?.replace(/\/$/, "") || origin) + m.path;
  const { html, text } = render(m, url);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject: m.subject, html, text }),
    });
    if (!res.ok) console.error("Email not sent", res.status, await res.text());
  } catch (e) {
    console.error("Email not sent", e);
  }
}

// Everyone who signs in to this client's portal.
async function clientEmails(clientId: string) {
  const { data } = await createAdminClient().from("profiles").select("email").eq("client_id", clientId).eq("role", "client");
  return (data ?? []).map((p) => p.email as string).filter(Boolean);
}

// Safari Digital: the staff email from Settings, otherwise every admin.
async function staffEmails() {
  const admin = createAdminClient();
  const { data: s } = await admin.from("app_settings").select("value").eq("key", "staff_email").maybeSingle();
  const configured = (s?.value as string | null)?.split(/[,;\s]+/).filter((e) => e.includes("@")) ?? [];
  if (configured.length) return configured;
  const { data } = await admin.from("profiles").select("email").eq("role", "admin");
  return (data ?? []).map((p) => p.email as string).filter(Boolean);
}

// Both run after the response is sent, so a slow email never slows the page.
export async function notifyClient(clientId: string, m: Message) {
  if (!emailConfigured()) return;
  const origin = await siteOrigin();
  after(async () => send(await clientEmails(clientId), m, origin));
}

export async function notifyStaff(m: Message) {
  if (!emailConfigured()) return;
  const origin = await siteOrigin();
  after(async () => send(await staffEmails(), m, origin));
}
