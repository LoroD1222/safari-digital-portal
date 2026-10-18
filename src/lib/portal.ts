import "server-only";
import { cache } from "react";
import { requireClient } from "./auth";
import { createClient } from "./supabase/server";
import type { Client } from "./types";

// The signed-in client and their company (null until Safari Digital links them).
export const getPortalContext = cache(async () => {
  const viewer = await requireClient();
  let company: Client | null = null;
  if (viewer.clientId) {
    const supabase = await createClient();
    const { data } = await supabase.from("clients").select("*").eq("id", viewer.clientId).maybeSingle();
    company = (data as Client | null) ?? null;
  }
  return { viewer, company };
});
