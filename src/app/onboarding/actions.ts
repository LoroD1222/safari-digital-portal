"use server";
import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Answers } from "@/lib/onboarding";
import { logActivity } from "@/lib/activity";
import { notifyStaff } from "@/lib/email";

const MAX_BYTES = 100_000;

export async function saveOnboarding(answers: Answers): Promise<{ ok: boolean }> {
  await requireClient();
  const json = JSON.stringify(answers ?? {});
  if (json.length > MAX_BYTES) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_onboarding", { answers: JSON.parse(json) });
  return { ok: !error };
}

export async function submitOnboarding(answers: Answers): Promise<{ ok: boolean; error?: string }> {
  const viewer = await requireClient();
  const saved = await saveOnboarding(answers);
  if (!saved.ok) return { ok: false, error: "We couldn't save your answers. Check your connection and try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_onboarding");
  if (error) return { ok: false, error: "We couldn't submit. Please try again." };
  if (viewer.clientId) {
    const { data: c } = await supabase.from("clients").select("name").eq("id", viewer.clientId).single();
    await logActivity({ clientId: viewer.clientId, actor: "client", message: "Onboarding submitted", clientLink: "/onboarding", adminLink: `/admin/clients/${viewer.clientId}?tab=onboarding` });
    await notifyStaff({
      subject: `${c?.name ?? "A client"} submitted onboarding`,
      intro: `${c?.name ?? "A client"} has submitted their onboarding and is ready for review.`,
      path: `/admin/clients/${viewer.clientId}?tab=onboarding`, button: "Review onboarding",
    });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeFile(path: string): Promise<{ ok: boolean }> {
  const viewer = await requireClient();
  if (!viewer.clientId || !path.startsWith(`${viewer.clientId}/`)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.storage.from("client-files").remove([path]);
  return { ok: !error };
}
