import "server-only";
import { createAdminClient } from "./supabase/admin";
import type { Role } from "./types";

// Adds a line to "Recent activity". Never throws: activity is a nice-to-have.
export async function logActivity(a: {
  clientId: string; actor: Role; message: string; clientLink?: string | null; adminLink?: string | null; visibleToClient?: boolean;
}) {
  try {
    await createAdminClient().from("activity").insert({
      client_id: a.clientId,
      actor_role: a.actor,
      message: a.message,
      client_link: a.clientLink ?? null,
      admin_link: a.adminLink ?? null,
      visible_to_client: a.visibleToClient ?? true,
    });
  } catch {
    // ignore
  }
}
