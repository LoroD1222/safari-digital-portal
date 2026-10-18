"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/origin";

export type AccessState = { error?: string; linked?: string; inviteLink?: string; invited?: string };

export async function addPortalUser(clientId: string, _: AccessState, form: FormData): Promise<AccessState> {
  await requireAdmin();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter the client's email address." };

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
    revalidatePath(`/admin/clients/${clientId}`);
    return { linked: email };
  }

  // No account yet: create one and make a one-time link the admin can send.
  // (Emailing it automatically needs our own email sender, which comes later.)
  const origin = await siteOrigin();
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: `${origin}/auth/confirm` } });
  if (error || !data?.user) return { error: "Couldn't create the invite. " + (error?.message ?? "") };
  const { error: linkErr } = await admin.from("profiles").update({ client_id: clientId }).eq("id", data.user.id);
  if (linkErr) return { error: "The account was created but couldn't be linked. " + linkErr.message };
  revalidatePath(`/admin/clients/${clientId}`);
  return { invited: email, inviteLink: data.properties.action_link };
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
  revalidatePath(`/admin/clients/${clientId}`);
  return { invited: email, inviteLink: res.data.properties.action_link };
}
