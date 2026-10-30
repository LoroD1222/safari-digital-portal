"use server";
import { revalidatePath } from "next/cache";
import { getViewer, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { notifyClient, notifyStaff } from "@/lib/email";
import { CATEGORY_LABEL, REQUEST_LABEL, type RequestCategory, type RequestStatus } from "@/lib/types";

export type RequestResult = { error?: string; id?: string; ok?: boolean };

const CATEGORIES: RequestCategory[] = ["website_change", "support", "problem"];
const STATUSES: RequestStatus[] = ["submitted", "in_progress", "waiting_for_client", "completed"];

function cleanAttachment(viewerClientId: string | null, path: string | null, name: string | null) {
  if (!path) return { path: null, name: null };
  if (viewerClientId && !path.startsWith(`${viewerClientId}/`)) return null;
  return { path, name: (name ?? "attachment").slice(0, 200) };
}

export async function createRequest(input: { category: string; subject: string; body: string; attachmentPath?: string | null; attachmentName?: string | null }): Promise<RequestResult> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "client" || !viewer.clientId) return { error: "Please sign in again." };
  const subject = input.subject.trim().slice(0, 150);
  const body = input.body.trim().slice(0, 5000);
  if (!subject) return { error: "Add a short subject." };
  if (!body) return { error: "Tell us a bit more." };
  const category = CATEGORIES.includes(input.category as RequestCategory) ? input.category : "support";
  const att = cleanAttachment(viewer.clientId, input.attachmentPath ?? null, input.attachmentName ?? null);
  if (!att) return { error: "Attach the file again." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_request", { category, subject, body, attachment_path: att.path, attachment_name: att.name });
  if (error || !data) return { error: "Couldn't send. Please try again." };
  const id = data as string;
  const { data: c } = await supabase.from("clients").select("name").eq("id", viewer.clientId).single();
  await logActivity({ clientId: viewer.clientId, actor: "client", message: `New request: ${subject}`, clientLink: `/portal/requests/${id}`, adminLink: `/admin/requests/${id}` });
  await notifyStaff({
    subject: `New request from ${c?.name ?? "a client"}: ${subject}`,
    intro: `${c?.name ?? "A client"} sent a new ${CATEGORY_LABEL[category as RequestCategory].toLowerCase()} request:`,
    detail: body, path: `/admin/requests/${id}`, button: "Open the request",
  });
  revalidatePath("/", "layout");
  return { ok: true, id };
}

export async function replyToRequest(id: string, body: string, attachmentPath?: string | null, attachmentName?: string | null): Promise<RequestResult> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Please sign in again." };
  const text = body.trim().slice(0, 5000);
  if (!text) return { error: "Write a message first." };
  const supabase = await createClient();
  const { data: req, error: readErr } = await supabase.from("requests").select("client_id, subject").eq("id", id).maybeSingle();
  if (!req) return { error: readErr ? `Couldn't open this request (${readErr.message}).` : "Request not found. Sign in again and retry." };
  const { data: co } = await supabase.from("clients").select("name").eq("id", req.client_id).maybeSingle();
  const att = cleanAttachment(viewer.role === "admin" ? req.client_id : viewer.clientId, attachmentPath ?? null, attachmentName ?? null);
  if (!att) return { error: "Attach the file again." };
  const { error } = await supabase.rpc("reply_request", { req_id: id, body: text, attachment_path: att.path, attachment_name: att.name });
  if (error) {
    console.error("reply_request failed", error);
    return { error: `Couldn't send your reply (${error.message}). Please try again, or message us on WhatsApp.` };
  }

  const company = co?.name ?? "A client";
  if (viewer.role === "admin") {
    await logActivity({ clientId: req.client_id, actor: "admin", message: `Safari Digital replied: ${req.subject}`, clientLink: `/portal/requests/${id}`, adminLink: `/admin/requests/${id}` });
    await notifyClient(req.client_id, { subject: `Reply to your request: ${req.subject}`, intro: "Safari Digital replied to your request:", detail: text, path: `/portal/requests/${id}`, button: "View and reply" });
  } else {
    await logActivity({ clientId: req.client_id, actor: "client", message: `New reply on: ${req.subject}`, clientLink: `/portal/requests/${id}`, adminLink: `/admin/requests/${id}`, visibleToClient: false });
    await notifyStaff({ subject: `${company} replied: ${req.subject}`, intro: `${company} replied to “${req.subject}”:`, detail: text, path: `/admin/requests/${id}`, button: "Open the request" });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setRequestStatus(id: string, status: RequestStatus) {
  await requireAdmin();
  if (!STATUSES.includes(status)) return;
  const supabase = await createClient();
  const { data: req } = await supabase.from("requests").select("client_id, subject, status").eq("id", id).single();
  if (!req || req.status === status) return;
  await supabase.from("requests").update({ status }).eq("id", id);
  await logActivity({ clientId: req.client_id, actor: "admin", message: `Request ${status === "completed" ? "completed" : `is now ${REQUEST_LABEL[status].toLowerCase()}`}: ${req.subject}`, clientLink: `/portal/requests/${id}`, adminLink: `/admin/requests/${id}` });
  if (status === "completed") {
    await notifyClient(req.client_id, { subject: `Done: ${req.subject}`, intro: `We've completed your request “${req.subject}”. If anything isn't right, just reply in the portal.`, path: `/portal/requests/${id}`, button: "View the request" });
  }
  revalidatePath("/", "layout");
}

// Admin only: remove requests with their messages and attached files.
export async function deleteRequests(ids: string[]): Promise<{ error?: string; deleted?: number }> {
  await requireAdmin();
  const clean = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 300);
  if (!clean.length) return { error: "Nothing selected." };
  const supabase = await createClient();
  const { data: files } = await supabase.from("request_messages").select("attachment_path").in("request_id", clean).not("attachment_path", "is", null);
  const paths = (files ?? []).map((f) => f.attachment_path as string).filter(Boolean);
  if (paths.length) await supabase.storage.from("request-files").remove(paths);
  const { error, count } = await supabase.from("requests").delete({ count: "exact" }).in("id", clean);
  if (error) return { error: "Couldn't delete. " + error.message };
  revalidatePath("/", "layout");
  return { deleted: count ?? clean.length };
}
