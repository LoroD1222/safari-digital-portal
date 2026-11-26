import "server-only";
import { createAdminClient } from "./supabase/admin";

// Trim spaces, line breaks and quotes that often come along with a pasted key.
export const cleanKey = (v: string | null | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();

export type ClientResend = { apiKey: string; webhookSecret: string | null };

// The client's own Resend account, if they have one (server only; never sent to a browser).
export async function clientResend(clientId: string): Promise<ClientResend | null> {
  const { data, error } = await createAdminClient().from("client_resend").select("api_key, webhook_secret").eq("client_id", clientId).maybeSingle();
  if (error || !data?.api_key) return null;
  return { apiKey: cleanKey(data.api_key), webhookSecret: data.webhook_secret ? cleanKey(data.webhook_secret) : null };
}

// The key follow-ups for this client are sent with: their own, else Safari Digital's.
export async function sendingKey(clientId: string) {
  return (await clientResend(clientId))?.apiKey || cleanKey(process.env.RESEND_API_KEY) || undefined;
}

// How the client's webhook last went (null error = it worked). Quietly does nothing before 0038 has run.
export async function noteWebhook(clientId: string, error: string | null) {
  await createAdminClient().from("client_resend").update({ webhook_last_at: new Date().toISOString(), webhook_last_error: error }).eq("client_id", clientId);
}

export type WebhookHealth = { at: string; error: string | null } | null;

// What the admin card shows: whether a key is saved, its last characters, and how the webhook last went.
export async function clientResendSummary(clientId: string) {
  const r = await clientResend(clientId);
  let webhook: WebhookHealth = null;
  if (r) {
    const { data } = await createAdminClient().from("client_resend").select("webhook_last_at, webhook_last_error").eq("client_id", clientId).maybeSingle();
    if (data?.webhook_last_at) webhook = { at: data.webhook_last_at as string, error: (data.webhook_last_error as string | null) ?? null };
  }
  return r ? { hasKey: true, keyEnd: r.apiKey.slice(-4), hasWebhook: !!r.webhookSecret, webhook } : { hasKey: false, keyEnd: "", hasWebhook: false, webhook };
}
