import { NextResponse, type NextRequest } from "next/server";
import { verifyResendWebhook } from "@/lib/followup-mail";
import { handleResendEvent } from "@/lib/followups";
import { clientResend, cleanKey, noteWebhook } from "@/lib/resend-keys";

// Resend webhook, with the email.bounced, email.complained and email.delivered events.
// Safari Digital's own Resend account: https://<portal>/api/webhooks/resend, signed with RESEND_WEBHOOK_SECRET.
// A client's own Resend account: https://<portal>/api/webhooks/resend?c=<client id>, signed with the secret saved
// on that client's Follow-up emails card. A permanent bounce or a spam complaint stops follow-ups to that address.
export async function POST(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("c");
  const own = clientId && /^[0-9a-f-]{36}$/i.test(clientId) ? await clientResend(clientId) : null;
  const secret = clientId ? own?.webhookSecret : cleanKey(process.env.RESEND_WEBHOOK_SECRET);
  if (!secret) {
    // Answer 200 so Resend doesn't switch the webhook off; the event is not used until a secret is saved.
    if (own) await noteWebhook(clientId!, "No signing secret saved in the portal");
    return NextResponse.json({ ok: false, ignored: true, error: clientId ? "No webhook secret saved for this client" : "RESEND_WEBHOOK_SECRET is not set" });
  }
  const body = await req.text();
  const ok = verifyResendWebhook(secret, {
    id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature"),
  }, body);
  if (!ok) {
    if (own) await noteWebhook(clientId!, "The signing secret saved in the portal doesn't match this webhook");
    return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 401 });
  }
  try {
    const r = await handleResendEvent(JSON.parse(body), clientId ?? undefined);
    if (own) await noteWebhook(clientId!, null);
    return NextResponse.json(r);
  } catch {
    // A signed event we couldn't read: accept it, so one odd event doesn't switch the webhook off.
    return NextResponse.json({ ok: false, ignored: true, error: "Bad payload" });
  }
}
