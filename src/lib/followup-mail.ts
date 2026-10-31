// Building follow-up emails for Resend, and reading Resend's webhook events.
// No database here, so it can be tested without sending anything.

import { createHmac, timingSafeEqual } from "node:crypto";

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Plain and personal, like an email the agent typed: no banners, buttons or footer.
export function renderFollowup(body: string) {
  const paras = body.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1d1f2b">
<div style="max-width:560px;padding:24px 20px">${paras}</div></body></html>`;
  return { html, text: body.trim() };
}

export type FollowupEmail = {
  fromEmail: string; fromName: string; to: string; subject: string; body: string;
  inquiryId: string; unsubscribeUrl: string; idempotencyKey: string; threadId: string;
};

// The Resend request. Every follow-up for one inquiry carries the same References header,
// so most email apps keep them in one conversation; replies go to the operator's own address.
export function resendRequest(e: FollowupEmail) {
  const { html, text } = renderFollowup(e.body);
  const name = e.fromName.replace(/["<>]/g, "").trim();
  return {
    url: "https://api.resend.com/emails",
    headers: { "Content-Type": "application/json", "Idempotency-Key": e.idempotencyKey },
    body: {
      from: name ? `${name} <${e.fromEmail}>` : e.fromEmail,
      to: [e.to], reply_to: e.fromEmail, subject: e.subject, html, text,
      headers: {
        "List-Unsubscribe": `<${e.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        References: e.threadId, "In-Reply-To": e.threadId,
      },
      tags: [{ name: "kind", value: "followup" }, { name: "inquiry", value: e.inquiryId.replace(/[^a-zA-Z0-9_-]/g, "") }],
    },
  };
}

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string; retry: boolean };

export async function sendViaResend(e: FollowupEmail, apiKey: string | undefined, f: typeof fetch = fetch): Promise<SendResult> {
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY is not set", retry: true };
  const r = resendRequest(e);
  try {
    const res = await f(r.url, { method: "POST", headers: { ...r.headers, Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(r.body) });
    if (!res.ok) {
      const msg = (await res.text()).slice(0, 300);
      // 4xx (except rate limits) won't get better by retrying: bad address, unverified domain…
      return { ok: false, error: `Resend ${res.status}: ${msg}`, retry: res.status === 429 || res.status >= 500 };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: json.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error", retry: true };
  }
}

// ───────────── Webhooks (bounces, spam complaints) ─────────────

// Resend signs webhooks with Svix: HMAC-SHA256 of "id.timestamp.body" with the secret after "whsec_".
export function verifyResendWebhook(secret: string, h: { id: string | null; timestamp: string | null; signature: string | null }, body: string, now = Date.now()) {
  if (!secret || !h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 5 * 60) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${body}`).digest("base64");
  return h.signature.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    const a = Buffer.from(sig), b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export type WebhookAction =
  | { kind: "suppress"; providerId: string; email: string; reason: string }
  | { kind: "delivered"; providerId: string }
  | { kind: "ignore" };

export function webhookAction(event: { type?: string; data?: { email_id?: string; to?: string[]; bounce?: { type?: string } } }): WebhookAction {
  const id = event.data?.email_id;
  const email = (event.data?.to?.[0] ?? "").toLowerCase();
  if (!id) return { kind: "ignore" };
  if (event.type === "email.bounced") {
    // Only a permanent bounce stops follow-ups; a full mailbox can be tried again later.
    const type = (event.data?.bounce?.type ?? "Permanent").toLowerCase();
    return type.includes("transient") ? { kind: "ignore" } : { kind: "suppress", providerId: id, email, reason: "Email bounced" };
  }
  if (event.type === "email.complained") return { kind: "suppress", providerId: id, email, reason: "Marked as spam" };
  if (event.type === "email.delivered") return { kind: "delivered", providerId: id };
  return { kind: "ignore" };
}
