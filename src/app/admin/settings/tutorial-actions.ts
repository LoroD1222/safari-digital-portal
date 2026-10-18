"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function addTutorial(title: string, url: string): Promise<{ error?: string }> {
  await requireAdmin();
  const t = title.trim().slice(0, 150);
  const u = url.trim();
  if (!t) return { error: "Add a title." };
  if (!/^https:\/\//.test(u)) return { error: "The video link must start with https://" };
  const supabase = await createClient();
  const { count } = await supabase.from("tutorials").select("id", { count: "exact", head: true });
  const { error } = await supabase.from("tutorials").insert({ title: t, url: u, topic: "website", sort: count ?? 0 });
  if (error) return { error: error.message.includes("tutorials") ? "Run 0005_portal.sql in Supabase first." : error.message };
  revalidatePath("/", "layout");
  return {};
}

export async function removeTutorial(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("tutorials").delete().eq("id", id);
  revalidatePath("/", "layout");
}
