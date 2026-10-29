"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { CONTENT_LABEL, KIND_LABEL, PLATFORM_LABEL, type ContentItem, type ContentStatus } from "@/lib/types";
import { reviewContent } from "./actions";

const TONE: Record<ContentStatus, [string, string, string]> = {
  draft: ["#F1F2F4", "#4A4F63", "#8A8FA3"],
  awaiting_approval: ["#FDF3E1", "#8A5A12", "#E0A458"],
  changes_requested: ["#FBEAEA", "#9C2F2B", "#C2413B"],
  approved: ["#E3F4EA", "#1A6647", "#1A6647"],
  scheduled: ["#E8EEFB", "#3450A6", "#5B7BE0"],
  published: ["#E8F6EF", "#0D3B2E", "#0D3B2E"],
};
const FILTERS = [["all", "All"], ["changes", "Changes requested"], ["upcoming", "Approved & scheduled"], ["pub", "Published"]] as const;

export type BoardComment = { id: string; content_id: string; who: "You" | "Safari Digital"; when: string; text: string };

function dayLabel(iso: string | null) {
  if (!iso) return "No date yet";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: iso.length === 10 ? "UTC" : "Africa/Dar_es_Salaam" });
}
function itemDate(i: ContentItem) {
  return dayLabel(i.status === "published" ? i.published_at : i.scheduled_for);
}

function Badge({ s }: { s: ContentStatus }) {
  const [bg, fg, dot] = TONE[s];
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 self-start whitespace-nowrap rounded-badge px-2 text-xs font-medium" style={{ background: bg, color: fg }}>
      <span className="size-1.5 rounded-full" style={{ background: dot }} />{CONTENT_LABEL[s]}
    </span>
  );
}

// Calm savanna illustration (as in the design) when there's no image yet.
const SKIES = [["#F6D9A8", "#E9A23B", "#7FA36B", "#2F5D46"], ["#CFE3EA", "#F2C14E", "#9DB774", "#3B6B4F"], ["#F3C6A5", "#E0763F", "#A7B36A", "#44663A"]];
function Scene({ seed }: { seed: string }) {
  const n = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  const [sky, sun, ground, tree] = SKIES[n % SKIES.length];
  const sunX = 30 + (n % 5) * 22;
  return (
    <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="absolute inset-0 h-full w-full" style={{ background: sky }}>
      <circle cx={sunX} cy="44" r="14" fill={sun} />
      <path d="M0 80 Q40 66 80 76 T160 72 V120 H0Z" fill={ground} />
      <path d="M112 78 v-20 M96 58 q16 -9 32 0" stroke={tree} strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Thumb({ item, url, className }: { item: ContentItem; url?: string; className?: string }) {
  const video = item.media_type?.startsWith("video/");
  return (
    <span className={"relative block overflow-hidden bg-[#DDE9E2] " + (className ?? "")}>
      {url && (video
        ? <video src={`${url}#t=0.5`} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />)}
      {!url && <Scene seed={item.id} />}
      {video && (
        <span className="absolute left-1/2 top-1/2 inline-flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#0D3B2E" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
        </span>
      )}
    </span>
  );
}

export function ContentBoard({ items, urls, comments, openId }: { items: ContentItem[]; urls: Record<string, string>; comments: BoardComment[]; openId?: string | null }) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [open, setOpen] = useState<string | null>(openId ?? null);
  const [commenting, setCommenting] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftErr, setDraftErr] = useState(false);
  const [acted, setActed] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const closeRef = useRef<HTMLButtonElement>(null);

  const waiting = items.filter((i) => i.status === "awaiting_approval");
  const list = useMemo(() => items.filter((i) => {
    if (filter === "all") return i.status !== "awaiting_approval";
    if (filter === "changes") return i.status === "changes_requested";
    if (filter === "upcoming") return i.status === "approved" || i.status === "scheduled";
    return i.status === "published";
  }), [items, filter]);
  const cur = items.find((i) => i.id === open) ?? null;
  const history = comments.filter((c) => c.content_id === open);

  useEffect(() => {
    if (!cur) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cur]);

  function show(id: string) { setOpen(id); setCommenting(false); setDraft(""); setDraftErr(false); setError(null); }
  function act(approve: boolean) {
    if (!cur) return;
    if (!approve && !draft.trim()) { setDraftErr(true); return; }
    start(async () => {
      const r = await reviewContent(cur.id, approve, draft);
      if (r.error) { setError(r.error); return; }
      setActed((a) => ({ ...a, [cur.id]: approve ? "Approved. Thank you!" : "Changes sent to Safari Digital." }));
      setCommenting(false);
      router.refresh();
    });
  }

  return (
    <>
      {waiting.length > 0 && (
        <section aria-labelledby="ap-h" className="flex flex-col gap-3 rounded-card border border-[#F1E2C3] bg-[#FFFAF0] p-4">
          <h2 id="ap-h" className="text-[15px] font-semibold">Waiting for your approval · {waiting.length}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {waiting.map((c) => (
              <button key={c.id} type="button" onClick={() => show(c.id)} className="flex items-center gap-3 rounded-card border border-line bg-white p-2.5 text-left hover:border-[#C9CDD6]">
                <span className="relative flex-none">
                  <Thumb item={c} url={urls[c.id]} className="h-20 w-16 rounded-control" />
                  <span className="absolute bottom-1 left-1 rounded bg-[rgba(0,3,33,0.55)] px-[5px] py-px text-[10px] font-semibold text-white">{KIND_LABEL[c.kind]}{c.as_ad ? " · Ad" : ""}</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="truncate font-medium">{c.title}</span><span className="text-xs text-slate">{PLATFORM_LABEL[c.platform]} · {itemDate(c)}</span></span>
                <span className="inline-flex h-8 items-center rounded-control bg-brand px-3 text-[13px] font-semibold text-white">Review</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="all-h" className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="all-h" className="text-[15px] font-semibold">This month</h2>
          <div role="group" aria-label="Filter" className="inline-flex flex-wrap rounded-control bg-[#F1F2F4] p-[3px]">
            {FILTERS.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
                className={"h-[30px] rounded-badge px-3 text-[13px] font-medium " + (filter === k ? "bg-white shadow-[0_1px_2px_rgba(0,3,33,0.12)]" : "")}>{l}</button>
            ))}
          </div>
        </div>
        {list.length === 0 ? (
          <div className="rounded-card border border-dashed border-field p-8 text-center text-slate">Nothing here this month.</div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => show(c.id)} className="flex w-full flex-col overflow-hidden rounded-card border border-line bg-white text-left hover:border-[#C9CDD6]">
                  <span className="relative block">
                    <Thumb item={c} url={urls[c.id]} className="aspect-[4/3] w-full" />
                    <span className="absolute left-2 top-2 rounded-badge bg-white/90 px-[7px] py-0.5 text-[11px] font-semibold text-forest">{KIND_LABEL[c.kind]}</span>
                    {c.as_ad && <span className="absolute right-2 top-2 rounded-badge bg-forest px-[7px] py-0.5 text-[11px] font-semibold text-white">Ad</span>}
                  </span>
                  <span className="flex flex-col gap-1.5 px-3 pb-3 pt-2.5">
                    <span className="truncate font-medium">{c.title}</span>
                    <span className="text-xs text-slate">{PLATFORM_LABEL[c.platform]} · {itemDate(c)}</span>
                    <Badge s={c.status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {cur && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,3,33,0.45)] p-6" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="dlg-h" className="flex max-h-full w-full max-w-[820px] flex-wrap overflow-auto rounded-card bg-white shadow-[0_24px_64px_rgba(0,3,33,0.25)]">
            <div className="flex flex-[1_1_260px] items-center justify-center bg-[#0B1A14] p-5">
              <div className={"relative w-full overflow-hidden rounded-[10px] bg-black " + (cur.kind === "post" ? "aspect-[4/5] max-w-[320px]" : "aspect-[9/16] max-w-[220px]")}>
                {urls[cur.id] ? (cur.media_type?.startsWith("video/")
                  ? <video src={urls[cur.id]} controls playsInline preload="metadata" className="absolute inset-0 h-full w-full object-contain" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={urls[cur.id]} alt={cur.title} className="absolute inset-0 h-full w-full object-contain" />)
                  : <Scene seed={cur.id} />}
              </div>
            </div>
            <div className="flex flex-[1_1_320px] flex-col gap-4 px-6 py-[22px]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 id="dlg-h" className="text-[17px] font-semibold">{cur.title}</h2>
                  <span className="text-[13px] text-slate">{PLATFORM_LABEL[cur.platform]} · {cur.status === "published" ? "Published " : "Scheduled for "}{itemDate(cur)}</span>
                </div>
                <button ref={closeRef} type="button" aria-label="Close" onClick={() => setOpen(null)} className="inline-flex size-8 flex-none items-center justify-center rounded-control text-slate hover:bg-[#F4F5F2]"><Icon name="close" size={18} /></button>
              </div>
              <Badge s={cur.status} />
              {cur.as_ad && (
                <p className="rounded-control bg-[#F1FAF6] px-3 py-2 text-[13px] text-forest">
                  <span className="font-semibold">Also runs as an ad.</span> Approving it lets Safari Digital use it in your Facebook &amp; Instagram ads.
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.05em] text-slate">Caption</span>
                <p className="whitespace-pre-line">{cur.caption || "No caption yet."}</p>
              </div>
              {history.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.05em] text-slate">Comments</span>
                  {history.map((h) => (
                    <div key={h.id} className={"rounded-control px-3 py-2 text-[13px] " + (h.who === "You" ? "bg-sidebar" : "bg-[#F1FAF6]")}>
                      <span className="font-semibold">{h.who}</span><span className="text-slate"> · {h.when}</span>
                      <div className="whitespace-pre-wrap">{h.text}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex-1" />
              {acted[cur.id] ? (
                <div role="status" className="flex flex-col gap-1 rounded-control bg-[#F1FAF6] px-3.5 py-3">
                  <span className="font-semibold text-forest">{acted[cur.id]}</span>
                  <span className="text-xs text-slate">Safari Digital is notified.</span>
                </div>
              ) : cur.status === "awaiting_approval" && (
                !commenting ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={pending} onClick={() => act(true)} className="h-10 flex-1 rounded-control bg-brand px-4 font-semibold text-white hover:bg-brand-hover disabled:opacity-60">{pending ? "Saving…" : "Approve"}</button>
                    <button type="button" disabled={pending} onClick={() => setCommenting(true)} className="h-10 flex-1 rounded-control border border-field bg-white px-4 font-medium hover:bg-[#F4F5F2]">Request changes</button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="cm" className="font-medium">What should we change?</label>
                    <textarea id="cm" rows={3} value={draft} autoFocus aria-invalid={draftErr} onChange={(e) => { setDraft(e.target.value); setDraftErr(false); }}
                      placeholder="e.g. Use the elephant clip at the start"
                      className="rounded-control border border-field px-3 py-2.5 aria-invalid:border-danger" />
                    {draftErr && <span className="text-xs text-danger-text">Add a short comment so we know what to change.</span>}
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setCommenting(false)} className="h-9 px-3 font-medium text-slate hover:text-ink">Cancel</button>
                      <button type="button" disabled={pending} onClick={() => act(false)} className="h-9 rounded-control bg-brand px-3.5 font-semibold text-white hover:bg-brand-hover disabled:opacity-60">{pending ? "Sending…" : "Send to Safari Digital"}</button>
                    </div>
                  </div>
                )
              )}
              {error && <p className="text-[13px] text-danger-text">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
