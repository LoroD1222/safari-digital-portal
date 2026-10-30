"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Permanently removes a client: their record and everything linked to it
// (inquiries, content, invoices, reports, requests, onboarding, website stats),
// their files in storage and their portal logins.
const BUCKETS = ["content", "request-files", "client-files"];

async function removeFolder(bucket: string, prefix: string) {
  const store = createAdminClient().storage.from(bucket);
  const files: string[] = [];
  async function walk(p: string) {
    for (let offset = 0; ; offset += 1000) {
      const { data } = await store.list(p, { limit: 1000, offset });
      for (const f of data ?? []) {
        const path = `${p}/${f.name}`;
        if (f.id === null) await walk(path); else files.push(path);
      }
      if (!data || data.length < 1000) break;
    }
  }
  await walk(prefix);
  for (let i = 0; i < files.length; i += 500) await store.remove(files.slice(i, i + 500));
}

export async function deleteClient(clientId: string, typedName: string): Promise<{ error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("id, name").eq("id", clientId).maybeSingle();
  if (!client) return { error: "This client no longer exists." };
  if (typedName.trim().toLowerCase() !== String(client.name).trim().toLowerCase()) return { error: "The name doesn't match. Type it exactly as shown." };

  const { data: people } = await admin.from("profiles").select("id").eq("client_id", clientId).neq("role", "admin");

  for (const b of BUCKETS) {
    try { await removeFolder(b, clientId); } catch { /* files are best-effort; the record still goes */ }
  }
  const { error } = await admin.from("clients").delete().eq("id", clientId);
  if (error) return { error: "Couldn't delete the client. " + error.message };
  for (const p of people ?? []) await admin.auth.admin.deleteUser(p.id);

  revalidatePath("/", "layout");
  redirect(`/admin/clients?deleted=${encodeURIComponent(client.name)}`);
}
