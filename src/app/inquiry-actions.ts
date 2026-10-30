"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { STATUS_EVENT, sendInquiryEvent } from "@/lib/meta-events";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STAGES, type InquiryStatus } from "@/lib/types";

const STATUSES: InquiryStatus[] = STAGES;

// Clients (their own) and admins (any) can move an inquiry along.
export async function updateInquiryStatus(id: string, status: InquiryStatus): Promise<{ ok: boolean }> {
  const viewer = await getViewer();
  if (!viewer || !STATUSES.includes(status)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_inquiry_status", { inquiry_id: id, new_status: status });
  if (error) return { ok: false };
  const event = STATUS_EVENT[status];
  if (event) after(() => sendInquiryEvent(id, event));
  revalidatePath("/", "layout");
  return { ok: true };
}

export type DealInput = { trip_value: number | null; follow_up_on: string | null; notes: string | null; lost_reason: string | null };

// Trip value (USD), next follow-up, notes and lost reason. Same rights as the status.
export async function saveInquiryDeal(id: string, d: DealInput): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Please sign in again." };
  const value = d.trip_value === null || d.trip_value === undefined || Number.isNaN(Number(d.trip_value)) ? null : Math.round(Number(d.trip_value) * 100) / 100;
  if (value !== null && (value < 0 || value > 10_000_000)) return { ok: false, error: "Enter a trip value in US dollars." };
  const date = d.follow_up_on && /^\d{4}-\d{2}-\d{2}$/.test(d.follow_up_on) ? d.follow_up_on : null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_inquiry_deal", {
    inquiry_id: id, p_trip_value: value, p_follow_up_on: date, p_notes: d.notes ?? null, p_lost_reason: d.lost_reason ?? null,
  });
  if (error) return { ok: false, error: /update_inquiry_deal|function/.test(error.message) ? "Safari Digital is finishing an update. Try again shortly." : "Couldn't save. " + error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export type HistoryRow = { status: InquiryStatus; at: string; by_role: string | null };

export async function getInquiryHistory(id: string): Promise<HistoryRow[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("inquiry_history").select("status, at, by_role").eq("inquiry_id", id).order("at", { ascending: false }).limit(30);
  return (data ?? []) as HistoryRow[];
}
