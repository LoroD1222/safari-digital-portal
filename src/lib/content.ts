import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentItem } from "./types";

// Short-lived links to each item's image or video.
export async function signMedia(supabase: SupabaseClient, items: Pick<ContentItem, "id" | "media_path">[]) {
  const withMedia = items.filter((i) => i.media_path);
  if (!withMedia.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from("content").createSignedUrls(withMedia.map((i) => i.media_path!), 60 * 60);
  const out: Record<string, string> = {};
  withMedia.forEach((i, n) => { const u = data?.[n]?.signedUrl; if (u) out[i.id] = u; });
  return out;
}

// Published this month, split into Reels and posts (stories count as posts).
export function planProgress(items: Pick<ContentItem, "kind" | "status" | "published_at">[], monthStart: string, next: string) {
  const pub = items.filter((i) => i.status === "published" && i.published_at && i.published_at >= monthStart && i.published_at < next);
  return { reels: pub.filter((i) => i.kind === "reel").length, posts: pub.filter((i) => i.kind !== "reel").length };
}
