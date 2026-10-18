import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getViewer } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export default async function Home() {
  await connection();
  if (!hasSupabaseEnv()) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 px-4">
        <h1 className="text-2xl font-semibold">Almost there</h1>
        <p className="text-slate">
          The portal is deployed, but it isn&apos;t connected to its database yet. Add the Supabase integration to this
          Vercel project, then redeploy.
        </p>
      </main>
    );
  }
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  redirect(viewer.role === "admin" ? "/admin" : "/portal");
}
