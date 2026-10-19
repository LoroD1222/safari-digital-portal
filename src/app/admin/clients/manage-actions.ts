"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { notifyClient } from "@/lib/email";
import type { Campaign, OnboardingStatus, WebsiteStage } from "@/lib/types";

export type FormState = { error?: string; saved?: boolean; message?: string };

const STAGES: WebsiteStage[] = ["info_received", "design", "awaiting_approval", "development", "live"];
const str = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v.trim() : ""; };
const count = (f: FormData, k: string) => { const s = str(f, k); if (!s) return null; const n = Math.round(Number(s)); return Number.isFinite(n) && n >= 0 ? Math.min(n, 999) : NaN; };
const done = () => revalidatePath("/", "layout");

export async function saveWebsiteProject(clientId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const stage = str(form, "website_stage") as WebsiteStage;
  const preview = str(form, "website_preview_url");
  if (!STAGES.includes(stage)) return { error: "Choose a stage." };
  if (preview && !/^https?:\/\//.test(preview)) return { error: "The preview link must start with https://" };
  const supabase = await createClient();
  if (stage === "awaiting_approval" && !preview) return { error: "Add the design preview link so the client can review it." };
  const { data: before } = await supabase.from("clients").select("website_stage, design_review").eq("id", clientId).single();
  const askReview = stage === "awaiting_approval" && before?.design_review !== "pending";
  const { error } = await supabase.from("clients").update({
    website_stage: stage, website_preview_url: preview || null,
    ...(askReview ? { design_review: "pending", design_feedback: null } : {}),
  }).eq("id", clientId);
  if (error) return { error: error.message.includes("website_stage") ? "Run 0005_portal.sql in Supabase first." : error.message };
  if (askReview) {
    await logActivity({ clientId, actor: "admin", message: "Website design ready for your review", clientLink: "/portal/website" });
    await notifyClient(clientId, {
      subject: "Your website design is ready to review",
      intro: "Your new website design is ready. Take a look and approve it, or tell us what to change.",
      path: "/portal/website", button: "Review the design",
    });
    done();
    return { saved: true, message: "Saved and sent to the client for review." };
  }
  if (before?.website_stage !== stage) {
    const label = { info_received: "Information received", design: "Design in progress", awaiting_approval: "Awaiting your approval", development: "Development", live: "Website launched" }[stage];
    await logActivity({ clientId, actor: "admin", message: stage === "live" ? "Your website is live" : `Website moved to: ${label}`, clientLink: "/portal/website" });
  }
  done();
  return { saved: true };
}

export async function requestDesignReview(clientId: string): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: c } = await supabase.from("clients").select("website_preview_url").eq("id", clientId).single();
  if (!c?.website_preview_url) return { error: "Add a preview link first." };
  const { error } = await supabase.from("clients").update({ design_review: "pending", design_feedback: null, website_stage: "awaiting_approval" }).eq("id", clientId);
  if (error) return { error: error.message };
  await logActivity({ clientId, actor: "admin", message: "Website design ready for your review", clientLink: "/portal/website" });
  await notifyClient(clientId, {
    subject: "Your website design is ready to review",
    intro: "Your new website design is ready. Take a look and approve it, or tell us what to change.",
    path: "/portal/website", button: "Review the design",
  });
  done();
  return { saved: true, message: "Sent to the client for review." };
}

export async function savePlan(clientId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const reels = count(form, "plan_reels");
  const posts = count(form, "plan_posts");
  if (Number.isNaN(reels) || Number.isNaN(posts)) return { error: "Use whole numbers." };
  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ plan_reels: reels, plan_posts: posts }).eq("id", clientId);
  if (error) return { error: error.message };
  done();
  return { saved: true };
}

export async function requestMissingInfo(clientId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const note = str(form, "onboarding_note").slice(0, 2000);
  if (!note) return { error: "Say what's missing." };
  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ onboarding_note: note, onboarding_status: "in_progress" }).eq("id", clientId);
  if (error) return { error: error.message };
  await logActivity({ clientId, actor: "admin", message: "Safari Digital asked for a few more details", clientLink: "/onboarding" });
  await notifyClient(clientId, {
    subject: "We need a few more details",
    intro: "Thanks for your onboarding answers. We need a little more before we can start:",
    detail: note, path: "/onboarding", button: "Add the details",
  });
  done();
  return { saved: true, message: "Sent. The client sees this on their dashboard and in onboarding." };
}

export async function setOnboardingStatus(clientId: string, status: OnboardingStatus) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("clients").update({ onboarding_status: status, ...(status === "setup_complete" ? { onboarding_note: null } : {}) }).eq("id", clientId);
  if (status === "setup_complete") await logActivity({ clientId, actor: "admin", message: "Your setup is complete", clientLink: "/portal" });
  done();
}

export async function createInquiryKey(clientId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("clients").update({ inquiry_form_key: "sdf_" + randomBytes(18).toString("base64url") }).eq("id", clientId);
  done();
}

export async function saveMeta(clientId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const account = str(form, "meta_ad_account_id").replace(/^act_/, "");
  if (account && !/^\d{5,20}$/.test(account)) return { error: "The ad account ID is a number, like 1234567890." };
  const confirmed = form.get("meta_access_confirmed") === "on";
  const supabase = await createClient();
  const { data: before } = await supabase.from("clients").select("meta_access_confirmed").eq("id", clientId).single();
  const { error } = await supabase.from("clients").update({ meta_access_confirmed: confirmed, meta_ad_account_id: account ? `act_${account}` : null }).eq("id", clientId);
  if (error) return { error: error.message };
  if (confirmed && !before?.meta_access_confirmed) {
    await logActivity({ clientId, actor: "admin", message: "Safari Digital confirmed access to your Facebook & Instagram", clientLink: "/portal" });
  }
  done();
  return { saved: true };
}

export async function saveAdReport(clientId: string, _: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireAdmin();
  const month = str(form, "month");
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { error: "Choose a month." };
  const spend = Number(str(form, "meta_spend") || "0");
  const inquiries = Number(str(form, "meta_inquiries") || "0");
  if (!Number.isFinite(spend) || spend < 0) return { error: "Ad spend must be a positive number." };
  if (!Number.isInteger(inquiries) || inquiries < 0) return { error: "Meta inquiries must be a whole number." };

  const names = form.getAll("c_name").map(String);
  const campaigns: Campaign[] = [];
  names.forEach((name, i) => {
    if (!name.trim()) return;
    const st = String(form.getAll("c_status")[i] ?? "active");
    campaigns.push({
      name: name.trim().slice(0, 120),
      status: (["active", "paused", "ended"].includes(st) ? st : "active") as Campaign["status"],
      spend: Math.max(0, Number(form.getAll("c_spend")[i]) || 0),
      inquiries: Math.max(0, Math.round(Number(form.getAll("c_inquiries")[i]) || 0)),
    });
  });

  const supabase = await createClient();
  const { error } = await supabase.from("ad_reports").upsert({
    client_id: clientId, month, meta_spend: Math.round(spend * 100) / 100, meta_inquiries: inquiries, campaigns,
    note: str(form, "note").slice(0, 1000) || null, source: "manual", updated_by: viewer.id,
  }, { onConflict: "client_id,month" });
  if (error) return { error: error.message.includes("ad_reports") ? "Run 0005_portal.sql in Supabase first." : error.message };
  await logActivity({ clientId, actor: "admin", message: "Advertising results updated", clientLink: "/portal/marketing/advertising", visibleToClient: true });
  done();
  return { saved: true };
}
