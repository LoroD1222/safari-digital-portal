import { NextResponse, type NextRequest } from "next/server";
import { verifyResendWebhook } from "@/lib/followup-mail";
import { handleResendEvent } from "@/lib/followups";
import { clientResend, cleanKey } from "@/lib/resend-keys";

// Resend webhook, with the email.bounced, email.complained and email.delivered events.
// Safari Digital's own Resend account: https://<portal>/api/webhooks/resend, signed with RESEND_WEBHOOK_SECRET.
// A client's own Resend account: https://<portal>/api/webhooks/resend?c=<client id>, signed with the secret saved
// on that client's Follow-up emails card. A permanent bounce or a spam complaint stops follow-ups to that address.
export async function POST(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("c");
  const own = clientId && /^[0-9a-f-]{36}$/i.test(clientId) ? await clientResend(clientId) : null;
  const secret = clientId ? own?.webhookSecret : cleanKey(process.env.RESEND_WEBHOOK_SECRET);
  if (!secret) return NextResponse.json({ ok: false, error: clientId ? "No webhook secret saved for this client" : "RESEND_WEBHOOK_SECRET is not set" }, { status: 503 });
  const body = await req.text();
  const ok = verifyResendWebhook(secret, {
    id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature"),
  }, body);
  if (!ok) return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 401 });
  try {
    return NextResponse.json(await handleResendEvent(JSON.parse(body), clientId ?? undefined));
  } catch {
    return NextResponse.json({ ok: false, error: "Bad payload" }, { status: 400 });
  }
}
