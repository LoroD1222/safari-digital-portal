"use client";
import { Slider } from "./slider";
import { Badge } from "./ui";
import type { MetaAd } from "@/lib/types";

const STATUS: Record<string, [string, "green" | "amber" | "blue" | "red" | "neutral"]> = {
  ACTIVE: ["Running", "green"],
  PAUSED: ["Paused", "amber"], CAMPAIGN_PAUSED: ["Paused", "amber"], ADSET_PAUSED: ["Paused", "amber"],
  IN_PROCESS: ["In review", "blue"], PENDING_REVIEW: ["In review", "blue"], PREAPPROVED: ["In review", "blue"],
  WITH_ISSUES: ["Has issues", "red"],
};
const FORMAT = { image: "Image", video: "Video", carousel: "Carousel" } as const;
const usd = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 });

// Ads synced from Meta: the creative (carousels swipe), status and last 30 days.
export function MetaAdsGrid({ ads }: { ads: MetaAd[] }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      {ads.map((a) => {
        const [label, tone] = STATUS[a.status] ?? ["Ended", "neutral"];
        const slides = a.format === "carousel" && a.cards.length
          ? a.cards.map((c) => ({ url: c.image_url, type: "image/jpeg" }))
          : [{ url: a.image_url, type: "image/jpeg" }];
        return (
          <li key={a.id} className="flex flex-col overflow-hidden rounded-card border border-line bg-white">
            <div className="relative aspect-square bg-sidebar">
              <Slider slides={slides} alt={a.name || "Ad"} />
              <span className="absolute left-2 top-2 z-10"><Badge tone={tone}>{label}</Badge></span>
              {a.format === "video" && (
                <span className="absolute left-1/2 top-1/2 inline-flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90" aria-hidden>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="#0D3B2E"><path d="M7 4v16l13-8z" /></svg>
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 px-3.5 pb-3.5 pt-3">
              <div className="flex flex-col gap-0.5">
                <span className="line-clamp-1 font-medium" title={a.name}>{a.name || "Ad"}</span>
                <span className="text-xs text-slate">{FORMAT[a.format]}{a.format === "carousel" && a.cards.length ? ` · ${a.cards.length} cards` : ""}{a.cta ? ` · ${a.cta}` : ""}</span>
              </div>
              {a.body && <p className="line-clamp-3 whitespace-pre-line text-[13px] text-body">{a.body}</p>}
              <div className="flex-1" />
              <dl className="grid grid-cols-3 gap-2 border-t border-line-soft pt-2.5 text-[12px]">
                <div><dt className="text-slate">Spend</dt><dd className="font-semibold tabular-nums">{usd(Number(a.spend))}</dd></div>
                <div><dt className="text-slate">Inquiries</dt><dd className="font-semibold tabular-nums">{a.inquiries}</dd></div>
                <div><dt className="text-slate">Clicks</dt><dd className="font-semibold tabular-nums">{a.clicks.toLocaleString("en-US")}</dd></div>
              </dl>
              {a.preview_url && (
                <a href={a.preview_url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-brand no-underline hover:text-forest">See it on Facebook ↗</a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
