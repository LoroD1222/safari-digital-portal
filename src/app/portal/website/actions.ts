"use server";
import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { notifyStaff } from "@/lib/email";

export async function reviewDesign(approve: boolean, feedback: string): Promise<{ error?: string; ok?: boolean }> {
  const viewer = await requireClient();
  if (!approve && !feedback.trim()) return { error: "Tell us what you'd like changed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_design", { approve, feedback: feedback.slice(0, 3000) });
  if (error) return { error: "The design isn't waiting for review any more. Refresh the page." };
  const { data: c } = await supabase.from("clients").select("id, name").eq("id", viewer.clientId!).single();
  if (c) {
    await logActivity({ clientId: c.id, actor: "client", message: approve ? "Website design approved" : "Changes requested on the website design", clientLink: "/portal/website", adminLink: `/admin/clients/${c.id}` });
    await notifyStaff({
      subject: `${c.name} ${approve ? "approved the website design" : "sent design feedback"}`,
      intro: approve ? `${c.name} approved their website design. It's moved to Development.` : `${c.name} asked for changes to their website design:`,
      detail: approve ? null : feedback, path: `/admin/clients/${c.id}`, button: "Open the client",
    });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
