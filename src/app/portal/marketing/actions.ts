"use server";
import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { notifyStaff } from "@/lib/email";

export type ReviewState = { error?: string; done?: "approved" | "changes" };

export async function reviewContent(id: string, approve: boolean, comment: string): Promise<ReviewState> {
  const viewer = await requireClient();
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_content", { item_id: id, approve, comment: comment.slice(0, 2000) });
  if (error) return { error: error.message.includes("Tell us") ? "Tell us what you'd like changed." : "This content isn't waiting for approval any more. Refresh the page." };
  const { data: item } = await supabase.from("content_items").select("title, client_id, clients(name)").eq("id", id).single();
  const company = (item?.clients as unknown as { name: string } | null)?.name ?? "A client";
  if (item) {
    await logActivity({
      clientId: item.client_id, actor: "client",
      message: approve ? `Approved: ${item.title}` : `Changes requested on: ${item.title}`,
      clientLink: `/portal/marketing/${id}`, adminLink: `/admin/content/${id}`,
    });
    if (!approve) {
      await notifyStaff({
        subject: `${company} asked for changes: ${item.title}`,
        intro: `${company} (${viewer.email}) asked for changes on “${item.title}”:`,
        detail: comment, path: `/admin/content/${id}`, button: "Open the content",
      });
    }
  }
  revalidatePath("/", "layout");
  return { done: approve ? "approved" : "changes" };
}
