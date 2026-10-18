import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Role } from "./types";

export type Viewer = {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  clientId: string | null;
};

// The signed-in person, verified with Supabase, once per request.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, client_id")
    .eq("id", userId)
    .single();
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    clientId: profile.client_id,
  };
});

export async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role !== "admin") redirect("/portal");
  return viewer;
}

export async function requireClient() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role === "admin") redirect("/admin");
  return viewer;
}
