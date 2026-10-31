import { NextResponse, type NextRequest } from "next/server";
import { verifyResendWebhook } from "@/lib/followup-mail";
import { handleResendEvent } from "@/lib/followups";

// Resend webhook (Resend → Webhooks → add https://<portal>/api/webhooks/resend with the
// email.bounced, email.complained and email.delivered events). Signed with RESEND_WEBHOOK_SECRET.
// A permanent bounce or a spam complaint stops follow-ups to that address for good.
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "RESEND_WEBHOOK_SECRET is not set" }, { status: 503 });
  const body = await req.text();
  const ok = verifyResendWebhook(secret, {
    id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature"),
  }, body);
  if (!ok) return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 401 });
  try {
    return NextResponse.json(await handleResendEvent(JSON.parse(body)));
  } catch {
    return NextResponse.json({ ok: false, error: "Bad payload" }, { status: 400 });
  }
}
