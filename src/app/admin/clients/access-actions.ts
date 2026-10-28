"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/origin";
import { emailConfigured, send } from "@/lib/email";

export type AccessState = { error?: string; linked?: string; inviteLink?: string; invited?: string; emailed?: boolean; emailError?: string };

// The invite email: a branded message with a one-time "Set your password" button.
async function emailInvite(email: string, link: string, clientId: string, kind: "invite" | "new_link" | "added") {
  if (!emailConfigured()) return { ok: false, why: "Email isn't set up (Resend), so copy the link below and send it yourself." };
  const admin = createAdminClient();
  const { data: c } = await admin.from("clients").select("name").eq("id", clientId).maybeSingle();
  const company = c?.name ?? "your company";
  const origin = await siteOrigin();
  const login = (process.env.PORTAL_URL?.replace(/\/$/, "") || origin) + "/login";
  const ok = await send([email], kind === "added" ? {
    subject: `You now have access to ${company} on the Safari Digital portal`,
    heading: "You've been added",
    intro: `Safari Digital gave ${email} access to the ${company} portal. Sign in with your existing password.`,
    path: "/login", url: login, button: "Sign in",
  } : {
    subject: kind === "invite" ? `You're invited to the ${company} portal by Safari Digital` : "Your new link to the Safari Digital portal",
    heading: kind === "invite" ? `Welcome to your Safari Digital portal` : "Here's your new link",
    intro: kind === "invite"
      ? `Safari Digital set up a portal for ${company}. See your inquiries, approve your posts and ads, follow your website project and get help, all in one place.`
      : "Use the button below to set your password and sign in.",
    rows: [["Your login", email], ["Company", company]],
    path: "/login", url: link, button: "Set your password",
    footer: "The button works once and expires after 24 hours. If it has expired, ask Safari Digital for a new link.",
  }, origin);
  return ok ? { ok: true } : { ok: false, why: "Resend refused the email. Copy the link below and send it yourself." };
}

// Give an email access to a client's portal: link an existing account or create an invite.
export async function inviteToPortal(clientId: string, email: string, sendEmail: boolean): Promise<AccessState> {
  await requireAdmin();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That doesn't look like an email address." };
  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id, role, client_id").ilike("email", email).maybeSingle();
  if (existing) {
    if (existing.role === "admin") return { error: "That email belongs to a Safari Digital admin account." };
    if (existing.client_id && existing.client_id !== clientId) {
      const { data: other } = await admin.from("clients").select("name").eq("id", existing.client_id).maybeSingle();
      return { error: `That account is already linked to ${other?.name ?? "another client"}. Remove it there first.` };
    }
    const { error } = await admin.from("profiles").update({ client_id: clientId }).eq("id", existing.id);
    if (error) return { error: "Couldn't link the account. " + error.message };
    const mail = sendEmail ? await emailInvite(email, "", clientId, "added") : null;
    return { linked: email, emailed: !!mail?.ok, emailError: mail && !mail.ok ? mail.why : undefined };
  }
  const origin = await siteOrigin();
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: `${origin}/auth/confirm` } });
  if (error || !data?.user) return { error: "Couldn't create the invite. " + (error?.message ?? "") };
  const { error: linkErr } = await admin.from("profiles").update({ client_id: clientId }).eq("id", data.user.id);
  if (linkErr) return { error: "The account was created but couldn't be linked. " + linkErr.message };
  const link = data.properties.action_link;
  const mail = sendEmail ? await emailInvite(email, link, clientId, "invite") : null;
  return { invited: email, inviteLink: link, emailed: !!mail?.ok, emailError: mail && !mail.ok ? mail.why : undefined };
}

export async function addPortalUser(clientId: string, _: AccessState, form: FormData): Promise<AccessState> {
  await requireAdmin();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter the client's email address." };
  const res = await inviteToPortal(clientId, email, form.get("send_email") === "on");
  revalidatePath(`/admin/clients/${clientId}`);
  return res;
}

export async function removePortalUser(clientId: string, profileId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  await admin.from("profiles").update({ client_id: null }).eq("id", profileId).eq("client_id", clientId).neq("role", "admin");
  revalidatePath(`/admin/clients/${clientId}`);
}

export async function newInviteLink(clientId: string, email: string): Promise<AccessState> {
  await requireAdmin();
  const admin = createAdminClient();
  const origin = await siteOrigin();
  // Works for people who haven't set a password yet; otherwise send a reset link.
  const res = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${origin}/auth/confirm` } });
  if (res.error) return { error: "Couldn't create a link. " + res.error.message };
  const link = res.data.properties.action_link;
  const mail = await emailInvite(email, link, clientId, "new_link");
  revalidatePath(`/admin/clients/${clientId}`);
  return { invited: email, inviteLink: link, emailed: mail.ok, emailError: mail.ok ? undefined : mail.why };
}
