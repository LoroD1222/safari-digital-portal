import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Bookings made during a month (by when they moved to Booked), with their USD value.
// Works before 0018_pipeline.sql too: then it simply finds nothing.
export async function bookedInMonth(db: SupabaseClient, clientId: string, m: { start: string; next: string }) {
  const { data, error } = await db.from("inquiries").select("trip_value, source").eq("client_id", clientId).eq("status", "booked")
    .gte("stage_changed_at", m.start).lt("stage_changed_at", m.next);
  const rows = error ? [] : (data ?? []) as { trip_value: number | null; source: string }[];
  const sum = (list: typeof rows) => Math.round(list.reduce((t, r) => t + Number(r.trip_value ?? 0), 0) * 100) / 100;
  const ads = rows.filter((r) => r.source === "meta_ads");
  return { count: rows.length, value: sum(rows), adsCount: ads.length, adsValue: sum(ads) };
}
