import "server-only";
import { createAdminClient } from "./supabase/admin";
import { get, resultsFrom } from "./meta";
import type { MetaAd } from "./types";

// The ads in a client's ad account: creative (image, video or carousel cards),
// text, status and the last 30 days of results. Read with the system user token.
const LIVE = ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", "PREAPPROVED"];
const MAX_ADS = 60;

type Action = { action_type: string; value: string };
type AdRow = {
  id: string; name?: string; effective_status?: string; created_time?: string; preview_shareable_link?: string;
  creative?: { id: string };
  insights?: { data?: { spend?: string; impressions?: string; clicks?: string; actions?: Action[] }[] };
};
type Child = { picture?: string; image_hash?: string; image_url?: string; name?: string; link?: string; video_id?: string };
type Cta = { type?: string; value?: { link?: string } };
export type Creative = {
  id: string; object_type?: string; title?: string; body?: string; image_url?: string; thumbnail_url?: string; video_id?: string;
  call_to_action_type?: string;
  object_story_spec?: {
    link_data?: { message?: string; name?: string; link?: string; picture?: string; image_hash?: string; call_to_action?: Cta; child_attachments?: Child[] };
    video_data?: { message?: string; title?: string; image_url?: string; image_hash?: string; video_id?: string; call_to_action?: Cta };
    photo_data?: { caption?: string; url?: string; image_hash?: string };
  };
  asset_feed_spec?: {
    images?: { hash?: string; url?: string }[]; videos?: { video_id?: string; thumbnail_url?: string }[];
    bodies?: { text?: string }[]; titles?: { text?: string }[]; link_urls?: { website_url?: string }[];
    call_to_action_types?: string[]; ad_formats?: string[];
  };
};
export type Parsed = Pick<MetaAd, "format" | "title" | "body" | "link" | "cta" | "image_url" | "cards">;

// Image hashes that a creative refers to, so they can be turned into URLs in one call.
export function hashesOf(c: Creative): string[] {
  const o = c.object_story_spec;
  return [
    o?.link_data?.image_hash, o?.video_data?.image_hash, o?.photo_data?.image_hash,
    ...(o?.link_data?.child_attachments ?? []).map((x) => x.image_hash),
    ...(c.asset_feed_spec?.images ?? []).map((x) => x.hash),
  ].filter((h): h is string => !!h);
}

const ctaLabel = (t?: string) => (t ? t.toLowerCase().replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase()).replace(/whatsapp/i, "WhatsApp") : null);

export function parseCreative(c: Creative | undefined, img: Record<string, string>): Parsed {
  const out: Parsed = { format: "image", title: null, body: null, link: null, cta: null, image_url: null, cards: [] };
  if (!c) return out;
  const h = (x?: string) => (x ? img[x] ?? null : null);
  const o = c.object_story_spec;
  const ld = o?.link_data, vd = o?.video_data, af = c.asset_feed_spec;

  if (ld?.child_attachments?.length) {
    out.format = "carousel";
    out.cards = ld.child_attachments.map((x) => ({ image_url: x.picture ?? h(x.image_hash) ?? x.image_url ?? null, title: x.name ?? null, link: x.link ?? null }));
    out.body = ld.message ?? null; out.title = ld.name ?? null; out.link = ld.link ?? null; out.cta = ctaLabel(ld.call_to_action?.type);
  } else if (vd) {
    out.format = "video";
    out.image_url = vd.image_url ?? h(vd.image_hash);
    out.body = vd.message ?? null; out.title = vd.title ?? null; out.cta = ctaLabel(vd.call_to_action?.type); out.link = vd.call_to_action?.value?.link ?? null;
  } else if (ld) {
    out.image_url = c.image_url ?? ld.picture ?? h(ld.image_hash);
    out.body = ld.message ?? null; out.title = ld.name ?? null; out.link = ld.link ?? null; out.cta = ctaLabel(ld.call_to_action?.type);
  } else if (o?.photo_data) {
    out.image_url = o.photo_data.url ?? h(o.photo_data.image_hash);
    out.body = o.photo_data.caption ?? null;
  } else if (af) {
    const images = (af.images ?? []).map((x) => x.url ?? h(x.hash)).filter((u): u is string => !!u);
    if (af.ad_formats?.includes("CAROUSEL") && images.length > 1) {
      out.format = "carousel";
      out.cards = images.map((u) => ({ image_url: u, title: null, link: null }));
    } else if (af.videos?.length) {
      out.format = "video";
      out.image_url = af.videos[0].thumbnail_url ?? null;
    } else out.image_url = images[0] ?? null;
    out.body = af.bodies?.[0]?.text ?? null; out.title = af.titles?.[0]?.text ?? null;
    out.link = af.link_urls?.[0]?.website_url ?? null; out.cta = ctaLabel(af.call_to_action_types?.[0]);
  }
  // Boosted posts and anything else: what the creative itself says.
  if (out.format === "image" && (c.video_id || c.object_type === "VIDEO")) out.format = "video";
  out.image_url ??= c.image_url ?? c.thumbnail_url ?? null;
  out.body ??= c.body ?? null;
  out.title ??= c.title ?? null;
  out.cta ??= ctaLabel(c.call_to_action_type);
  return out;
}

export async function syncAds(clientId: string, accountId: string): Promise<{ ok: true; count: number } | { ok: false; count: 0; error: string }> {
  const ads = await get<{ data: AdRow[] }>(`/${accountId}/ads`, {
    fields: "id,name,effective_status,created_time,preview_shareable_link,creative{id},insights.date_preset(last_30d){spend,impressions,clicks,actions}",
    effective_status: JSON.stringify(LIVE), limit: "100",
  });
  if (!ads.ok) return { ok: false, count: 0, error: ads.error };
  const rows = ads.data.data
    .sort((a, b) => (b.created_time ?? "").localeCompare(a.created_time ?? ""))
    .slice(0, MAX_ADS);

  // Creatives in batches of 50, with a bigger thumbnail than Meta's 64 px default.
  const creatives: Record<string, Creative> = {};
  const ids = [...new Set(rows.map((r) => r.creative?.id).filter((x): x is string => !!x))];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await get<Record<string, Creative>>("/", {
      ids: ids.slice(i, i + 50).join(","),
      fields: "id,object_type,title,body,image_url,thumbnail_url,video_id,call_to_action_type,object_story_spec,asset_feed_spec",
      thumbnail_width: "720", thumbnail_height: "720",
    });
    if (r.ok) Object.assign(creatives, r.data);
  }

  // Image hashes → URLs.
  const img: Record<string, string> = {};
  const hashes = [...new Set(Object.values(creatives).flatMap(hashesOf))];
  for (let i = 0; i < hashes.length; i += 50) {
    const r = await get<{ data: { hash: string; url?: string; permalink_url?: string }[] }>(`/${accountId}/adimages`, {
      hashes: JSON.stringify(hashes.slice(i, i + 50)), fields: "hash,url,permalink_url",
    });
    if (r.ok) for (const x of r.data.data) { const u = x.permalink_url ?? x.url; if (u) img[x.hash] = u; }
  }

  const now = new Date().toISOString();
  const records = rows.map((a) => {
    const ins = a.insights?.data?.[0];
    return {
      id: a.id, client_id: clientId, name: a.name ?? "", status: a.effective_status ?? "",
      ...parseCreative(a.creative ? creatives[a.creative.id] : undefined, img),
      preview_url: a.preview_shareable_link ?? null,
      spend: Math.round(Number(ins?.spend ?? 0) * 100) / 100,
      impressions: Number(ins?.impressions ?? 0), clicks: Number(ins?.clicks ?? 0),
      inquiries: resultsFrom(ins?.actions).inquiries,
      created_time: a.created_time ?? null, synced_at: now,
    };
  });

  const db = createAdminClient();
  if (records.length) {
    const { error } = await db.from("meta_ads").upsert(records, { onConflict: "id" });
    if (error) return { ok: false, count: 0, error: /meta_ads/.test(error.message) ? "Run 0017_carousel_meta_ads.sql in Supabase first." : error.message };
  }
  // Ads that were deleted or archived in Meta disappear here too.
  await db.from("meta_ads").delete().eq("client_id", clientId).lt("synced_at", now);
  return { ok: true, count: records.length };
}
