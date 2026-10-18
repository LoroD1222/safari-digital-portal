"use server";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { InquiryStatus } from "@/lib/types";

const STATUSES: InquiryStatus[] = ["new", "contacted", "booked", "closed"];

// Clients (their own) and admins (any) can move an inquiry along.
export async function updateInquiryStatus(id: string, status: InquiryStatus): Promise<{ ok: boolean }> {
  const viewer = await getViewer();
  if (!viewer || !STATUSES.includes(status)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_inquiry_status", { inquiry_id: id, new_status: status });
  if (error) return { ok: false };
  revalidatePath("/", "layout");
  return { ok: true };
}
