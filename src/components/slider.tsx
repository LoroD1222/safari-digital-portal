"use client";
import { useState } from "react";
import { Media } from "./media";

// Swipeable carousel ("slider") of images/videos: arrows, dots and a 2/5 counter.
// With one slide it's just the media.
export function Slider({ slides, alt, controls, className }: {
  slides: { url: string | null; type: string | null }[]; alt: string; controls?: boolean; className?: string;
}) {
  const [i, setI] = useState(0);
  const [touch, setTouch] = useState<number | null>(null);
  const n = slides.length;
  const cur = slides[Math.min(i, n - 1)] ?? { url: null, type: null };
  if (n <= 1) return <Media url={cur.url} type={cur.type} alt={alt} controls={controls} className={className} />;
  const go = (d: number) => setI((x) => (x + d + n) % n);
  const arrow = "absolute top-1/2 z-10 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-forest shadow-[0_1px_3px_rgba(0,3,33,0.25)] hover:bg-white";

  return (
    <div className="relative h-full w-full" role="group" aria-roledescription="carousel" aria-label={alt}
      onTouchStart={(e) => setTouch(e.touches[0].clientX)}
      onTouchEnd={(e) => { if (touch === null) return; const dx = e.changedTouches[0].clientX - touch; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); setTouch(null); }}
      onKeyDown={(e) => { if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); }}>
      <Media key={i} url={cur.url} type={cur.type} alt={`${alt}, slide ${i + 1} of ${n}`} controls={controls} className={className} />
      <span className="absolute right-2 top-2 z-10 rounded-badge bg-[rgba(0,3,33,0.6)] px-[7px] py-0.5 text-[11px] font-semibold tabular-nums text-white" aria-hidden>{i + 1}/{n}</span>
      <button type="button" aria-label="Previous slide" onClick={(e) => { e.stopPropagation(); go(-1); }} className={arrow + " left-2"}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <button type="button" aria-label="Next slide" onClick={(e) => { e.stopPropagation(); go(1); }} className={arrow + " right-2"}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
      </button>
      <span className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5" aria-hidden>
        {slides.map((_, k) => <span key={k} className={"size-1.5 rounded-full " + (k === i ? "bg-white" : "bg-white/50")} />)}
      </span>
    </div>
  );
}
