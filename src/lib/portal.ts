import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getViewer, requireClient } from "./auth";
import { viewAsClientId } from "./view-as";
import { createClient } from "./supabase/server";
import type { Client } from "./types";

// The signed-in client and their company (null until Safari Digital links them).
// An admin "viewing as" a client gets that client's company (see lib/view-as.ts).
export const getPortalContext = cache(async () => {
  const me = await getViewer();
  if (!me) redirect("/login");
  const viewingAs = me.role === "admin" ? await viewAsClientId() : null;
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
