"use client";
import { createClient } from "@/lib/supabase/client";

// Uploads straight from the browser to the private "content" bucket.
export async function uploadMedia(file: File, clientId: string, itemId: string, version: number) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${clientId}/${itemId}/v${version}-${new Date().getTime()}.${ext}`;
  const { error } = await createClient().storage.from("content").upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) {
    const big = /exceed|too large|413|maximum/i.test(error.message);
    return { error: big ? "That file is too big for your storage plan. Supabase Free allows 50 MB per file: export a smaller video, or raise the limit on a paid plan." : "The upload didn't work. " + error.message };
  }
  return { path, type: file.type };
}
