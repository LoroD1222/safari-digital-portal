"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { VIEW_AS_COOKIE } from "@/lib/view-as";

export async function startViewAs(clientId: string) {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return;
  (await cookies()).set(VIEW_AS_COOKIE, clientId, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 8 * 3600 });
  redirect("/portal");
}

export async function stopViewAs() {
  const jar = await cookies();
  const id = jar.get(VIEW_AS_COOKIE)?.value;
  jar.delete(VIEW_AS_COOKIE);
  redirect(id ? `/admin/clients/${id}` : "/admin");
}
