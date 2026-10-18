import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

// Full-access client for admin-only server actions (inviting people, linking
// accounts). Never import this into anything that runs in the browser.
export function createAdminClient() {
  const { url } = supabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
