import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getViewer, requireClient } from "./auth";
import { viewAsClientId } from "./view-as";
import { createClient } from "./supabase/server";
import type { Client } from "./types";

// The signed-in client and their company (null until Safari Digital links them).
// An admin "viewing as" a client gets that client's company (see lib/view-as.ts).
// internalForAdmin: pages admins also use from /admin (Calendar, Cold calling) work on
// Safari Digital's own (internal) account for admins.
export const getPortalContext = cache(async (internalForAdmin: boolean = false) => {
  const me = await getViewer();
  if (!me) redirect("/login");
  let viewingAs = me.role === "admin" ? await viewAsClientId() : null;
  // (Also while viewing as another client: these pages only ever show the internal account.)
  if (me.role === "admin" && internalForAdmin) {
    const supabase = await createClient();
    const { data } = await supabase.from("clients").select("id").eq("is_internal", true).order("created_at").limit(1).maybeSingle();
    viewingAs = (data?.id as string | undefined) ?? null;
  }
  if (me.role === "admin" && !viewingAs) redirect("/admin");
  const viewer = viewingAs ? { ...me, clientId: viewingAs } : await requireClient();
  let company: Client | null = null;
  if (viewer.clientId) {
    const supabase = await createClient();
    const { data } = await supabase.from("clients").select("*").eq("id", viewer.clientId).maybeSingle();
    company = (data as Client | null) ?? null;
  }
  return { viewer, company, viewingAs: !!viewingAs };
});
