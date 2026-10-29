"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { notifyClient } from "@/lib/email";
import type { ContentStatus } from "@/lib/types";

export type ContentFormState = { error?: string; saved?: boolean };

const KINDS = ["reel", "post", "story"];
const PLATFORMS = ["instagram", "facebook", "both"];
const UUID = /^[0-9a-f-]{36}$/i;
const s = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v.trim() : ""; };

function fields(form: FormData) {
  const title = s(form, "title").slice(0, 150);
  const date = s(form, "scheduled_for");
  return {
    title,
    caption: s(form, "caption").slice(0, 5000) || null,
    kind: KINDS.includes(s(form, "kind")) ? s(form, "kind") : "reel",
    platform: PLATFORMS.includes(s(form, "platform")) ? s(form, "platform") : "both",
    scheduled_for: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    as_ad: form.get("as_ad") === "on",
  };
}

function saveError(message: string) {
  if (message.includes("as_ad")) return "Run 0015_content_ads.sql in Supabase first.";
  return message.includes("content_items") ? "Run 0005_portal.sql in Supabase first." : "Couldn't save. " + message;
}

async function announce(clientId: string, id: string, title: string, kind: string, ad?: boolean) {
  const what = (kind === "reel" ? "Reel" : kind === "story" ? "story" : "post") + (ad ? " ad" : "");
  await logActivity({ clientId, actor: "admin", message: `New ${what} ready for your approval: ${title}`, clientLink: `/portal/marketing/${id}`, adminLink: `/admin/content/${id}` });
  await notifyClient(clientId, {
    subject: `Please approve: ${title}`,
    intro: `We've prepared a new ${what} for you.${ad ? " Once approved, it runs as a Facebook & Instagram ad." : ""} Have a look and approve it, or tell us what to change.`,
    path: `/portal/marketing/${id}`, button: "Review it",
  });
}

export async function createContent(_: ContentFormState, form: FormData): Promise<ContentFormState> {
  const viewer = await requireAdmin();
  const id = s(form, "id");
  const clientId = s(form, "client_id");
  const mediaPath = s(form, "media_path");
  const send = s(form, "intent") === "send";
  const f = fields(form);
  if (!UUID.test(id)) return { error: "Something went wrong. Reload the page and try again." };
  if (!UUID.test(clientId)) return { error: "Choose the client." };
  if (!f.title) return { error: "Add a title." };
  if (mediaPath && !mediaPath.startsWith(`${clientId}/${id}/`)) return { error: "Upload the file again." };
  if (send && !mediaPath) return { error: "Upload the video or image before sending it for approval." };

  const supabase = await createClient();
  const { error } = await supabase.from("content_items").insert({
    id, client_id: clientId, ...f, media_path: mediaPath || null, media_type: s(form, "media_type") || null,
    status: send ? "awaiting_approval" : "draft", created_by: viewer.id,
  });
  if (error) return { error: saveError(error.message) };
  if (send) {
    await supabase.from("content_comments").insert({ content_id: id, author_id: viewer.id, author_role: "admin", kind: "sent", version: 1 });
    await announce(clientId, id, f.title, f.kind, f.as_ad);
  }
  revalidatePath("/", "layout");
  redirect(`/admin/content/${id}`);
}

export async function updateContent(id: string, _: ContentFormState, form: FormData): Promise<ContentFormState> {
  await requireAdmin();
  const f = fields(form);
  if (!f.title) return { error: "Add a title." };
  const supabase = await createClient();
  const { error } = await supabase.from("content_items").update(f).eq("id", id);
  if (error) return { error: saveError(error.message) };
  revalidatePath("/", "layout");
  return { saved: true };
}

// New version of the same item: replaces the file and asks the client again.
export async function uploadRevision(id: string, mediaPath: string, mediaType: string, note: string): Promise<ContentFormState> {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const { data: item } = await supabase.from("content_items").select("*").eq("id", id).single();
  if (!item || !mediaPath.startsWith(`${item.client_id}/${id}/`)) return { error: "Upload the file again." };
  const version = (item.version as number) + 1;
  const { error } = await supabase.from("content_items")
    .update({ media_path: mediaPath, media_type: mediaType || null, version, status: "awaiting_approval" }).eq("id", id);
  if (error) return { error: error.message };
  await supabase.from("content_comments").insert({ content_id: id, author_id: viewer.id, author_role: "admin", kind: "revision", body: note.trim().slice(0, 2000) || null, version });
  await announce(item.client_id, id, item.title, item.kind, item.as_ad);
  revalidatePath("/", "layout");
  return { saved: true };
}

export async function setContentStatus(id: string, status: ContentStatus) {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const { data: item } = await supabase.from("content_items").select("*").eq("id", id).single();
  if (!item) return;
  if (status === "awaiting_approval" && !item.media_path) return;
  await supabase.from("content_items").update({ status }).eq("id", id);
  if (status === "awaiting_approval" && item.status !== "awaiting_approval") {
    await supabase.from("content_comments").insert({ content_id: id, author_id: viewer.id, author_role: "admin", kind: "sent", version: item.version });
    await announce(item.client_id, id, item.title, item.kind, item.as_ad);
  }
  if (status === "published" && item.status !== "published") {
    await logActivity({ clientId: item.client_id, actor: "admin", message: `${item.kind === "reel" ? "Reel" : "Post"} published: ${item.title}`, clientLink: `/portal/marketing/${id}` });
  }
  revalidatePath("/", "layout");
}

export async function deleteContent(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data: item } = await supabase.from("content_items").select("client_id").eq("id", id).single();
  if (item) {
    const { data: files } = await supabase.storage.from("content").list(`${item.client_id}/${id}`);
    if (files?.length) await supabase.storage.from("content").remove(files.map((f) => `${item.client_id}/${id}/${f.name}`));
  }
  await supabase.from("content_items").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect("/admin/content");
}
