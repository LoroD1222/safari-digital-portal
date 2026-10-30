import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentItem, SignedSlide } from "./types";

// Short-lived links to each item's image or video.
export async function signMedia(supabase: SupabaseClient, items: Pick<ContentItem, "id" | "media_path">[]) {
  const withMedia = items.filter((i) => i.media_path);
  if (!withMedia.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from("content").createSignedUrls(withMedia.map((i) => i.media_path!), 60 * 60);
  const out: Record<string, string> = {};
  withMedia.forEach((i, n) => { const u = data?.[n]?.signedUrl; if (u) out[i.id] = u; });
  return out;
}

// Every slide of each item (first file + extra_media), for carousels.
export async function signSlides(supabase: SupabaseClient, items: Pick<ContentItem, "id" | "media_path" | "media_type" | "extra_media">[]) {
  const all = items.flatMap((i) => [
    ...(i.media_path ? [{ id: i.id, path: i.media_path, type: i.media_type ?? "" }] : []),
    ...(i.extra_media ?? []).map((s) => ({ id: i.id, path: s.path, type: s.type })),
  ]);
  const out: Record<string, SignedSlide[]> = {};
  if (!all.length) return out;
  const { data } = await supabase.storage.from("content").createSignedUrls(all.map((s) => s.path), 60 * 60);
  all.forEach((s, n) => { const u = data?.[n]?.signedUrl; if (u) (out[s.id] ??= []).push({ url: u, type: s.type }); });
  return out;
}

// Published this month, split into Reels and posts (stories count as posts).
export function planProgress(items: Pick<ContentItem, "kind" | "status" | "published_at">[], monthStart: string, next: string) {
  const pub = items.filter((i) => i.status === "published" && i.published_at && i.published_at >= monthStart && i.published_at < next);
  return { reels: pub.filter((i) => i.kind === "reel").length, posts: pub.filter((i) => i.kind !== "reel" && i.kind !== "ad").length };
}
