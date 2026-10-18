import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FILE_CATEGORIES, type StoredFile } from "./onboarding";

// Lists a client's onboarding uploads. Works with the signed-in client's
// connection (storage rules limit it to their folder) or the admin one.
export async function listOnboardingFiles(supabase: SupabaseClient, clientId: string): Promise<StoredFile[]> {
  const out: StoredFile[] = [];
  for (const c of FILE_CATEGORIES) {
    const folder = `${clientId}/onboarding/${c.key}`;
    const { data } = await supabase.storage.from("client-files").list(folder, { limit: 500, sortBy: { column: "created_at", order: "asc" } });
    for (const f of data ?? []) {
      if (!f.id) continue; // skip folder placeholders
      out.push({ path: `${folder}/${f.name}`, name: f.name.replace(/^\d+-/, ""), category: c.key });
    }
  }
  return out;
}
