import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { resendRequest, sendViaResend, verifyResendWebhook, webhookAction, type FollowupEmail } from "@/lib/followup-mail";

const email: FollowupEmail = {
  fromEmail: "bookings@goldentrips.co.tz", fromName: "Golden Trips", to: "sarah@example.com",
  subject: "Can we help with your safari plans?", body: "Hi Sarah,\n\nThanks.\n\nBest regards,\n\nGolden Trips",
  inquiryId: "11111111-1111-1111-1111-111111111111", unsubscribeUrl: "https://portal.test/api/followups/unsubscribe?i=x&t=y",
  idempotencyKey: "followup-cy1-r1", threadId: "<inquiry-1@goldentrips.co.tz>",
};

describe("the email itself", () => {
  it("comes from the operator, replies go to them, and it threads per inquiry", () => {
    const r = resendRequest(email);
    expect(r.body.from).toBe("Golden Trips <bookings@goldentrips.co.tz>");
    expect(r.body.reply_to).toBe("bookings@goldentrips.co.tz");
    expect(r.body.headers.References).toBe(email.threadId);
    expect(r.headers["Idempotency-Key"]).toBe("followup-cy1-r1");
    expect(r.body.html).not.toMatch(/safari digital|unsubscribe/i); // no branding, no visible footer
    expect(r.body.headers["List-Unsubscribe"]).toContain("unsubscribe");
  });
});

describe("8. provider errors (no real emails are sent)", () => {
  it("returns the provider id on success", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "re_123" }), { status: 200 }));
    expect(await sendViaResend(email, "key", f as unknown as typeof fetch)).toEqual({ ok: true, id: "re_123" });
    expect(f).toHaveBeenCalledOnce();
  });

  it("retries rate limits, server errors and network errors, but not bad requests", async () => {
    const status = (n: number) => vi.fn(async () => new Response("nope", { status: n })) as unknown as typeof fetch;
    expect(await sendViaResend(email, "key", status(429))).toMatchObject({ ok: false, retry: true });
    expect(await sendViaResend(email, "key", status(503))).toMatchObject({ ok: false, retry: true });
    expect(await sendViaResend(email, "key", status(422))).toMatchObject({ ok: false, retry: false });
    const down = vi.fn(async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    expect(await sendViaResend(email, "key", down)).toMatchObject({ ok: false, retry: true, error: "ECONNRESET" });
    expect(await sendViaResend(email, undefined, down)).toMatchObject({ ok: false });
  });
});

describe("11. bounces, complaints and unsubscribes", () => {
  const secret = "whsec_" + Buffer.from("test-secret-123").toString("base64");
  const sign = (id: string, ts: string, body: string) =>
    "v1," + createHmac("sha256", Buffer.from("test-secret-123")).update(`${id}.${ts}.${body}`).digest("base64");

  it("accepts only correctly signed, recent webhooks", () => {
    const body = JSON.stringify({ type: "email.bounced" });
    const now = 1_760_000_000_000;
    const ts = String(now / 1000);
    expect(verifyResendWebhook(secret, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, body, now)).toBe(true);
    expect(verifyResendWebhook(secret, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body + "x") }, body, now)).toBe(false);
    expect(verifyResendWebhook(secret, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, body, now + 10 * 60_000)).toBe(false);
    expect(verifyResendWebhook("", { id: "msg_1", timestamp: ts, signature: "x" }, body, now)).toBe(false);
  });

  it("a permanent bounce or spam complaint suppresses the address; a full mailbox doesn't", () => {
    expect(webhookAction({ type: "email.bounced", data: { email_id: "re_1", to: ["Sarah@Example.com"], bounce: { type: "Permanent" } } }))
      .toEqual({ kind: "suppress", providerId: "re_1", email: "sarah@example.com", reason: "Email bounced" });
    expect(webhookAction({ type: "email.bounced", data: { email_id: "re_1", to: ["a@b.c"], bounce: { type: "Transient" } } })).toEqual({ kind: "ignore" });
    expect(webhookAction({ type: "email.complained", data: { email_id: "re_2", to: ["a@b.c"] } })).toMatchObject({ kind: "suppress", reason: "Marked as spam" });
    expect(webhookAction({ type: "email.opened", data: { email_id: "re_3" } })).toEqual({ kind: "ignore" });
  });
});
