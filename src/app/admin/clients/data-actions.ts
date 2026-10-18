"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listProjects } from "@/lib/vercel";

export type DataState = { error?: string; saved?: boolean };

export async function setVercelProject(clientId: string, _: DataState, form: FormData): Promise<DataState> {
  await requireAdmin();
  const id = String(form.get("vercel_project_id") ?? "");
  let name: string | null = null;
  if (id) {
    const projects = await listProjects();
    if (!projects.ok) return { error: projects.error };
    const p = projects.data.find((x) => x.id === id);
    if (!p) return { error: "That project isn't in your Vercel account any more." };
    name = p.name;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ vercel_project_id: id || null, vercel_project_name: name }).eq("id", clientId);
  if (error) {
    return { error: error.message.includes("vercel_project") ? "The database needs an update first: run 0004_integrations.sql in Supabase." : "Couldn't save. " + error.message };
  }
  revalidatePath("/", "layout");
  return { saved: true };
}
