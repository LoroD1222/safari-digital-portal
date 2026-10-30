"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { InquiryDialog, moveInquiry, stageColor, usd } from "./inquiry-dialog";
import { INQUIRY_LABEL, STAGES, STALE_DAYS, type Inquiry, type InquirySource, type InquiryStatus } from "@/lib/types";

const SOURCE_TAG: Record<InquirySource, string> = { meta_ads: "Ads", meta_organic: "Social", website: "Website", direct: "Direct", unknown: "Other" };
const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // Dar es Salaam
const daysIn = (q: Inquiry) => Math.floor((Date.now() - new Date(q.stage_changed_at ?? q.received_at).getTime()) / 864e5);
const next = (s: InquiryStatus): InquiryStatus | null => (s === "booked" || s === "closed" ? null : STAGES[STAGES.indexOf(s) + 1]);

// Drag cards between stages (desktop), or tap the arrow / open a card to move it (phones).
export function PipelineBoard({ items, company, adminHref }: { items: Inquiry[]; company: string; adminHref?: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  // New data from the server (live updates, another tab): take it, keep local edits otherwise.
  const [seen, setSeen] = useState(items);
  if (items !== seen) { setSeen(items); setRows(items); }
  const [open, setOpen] = useState<{ id: string; intent: "booked" | "closed" | null } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<InquiryStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  // Columns run down to the bottom of the window, whatever sits above the board.
  const boardRef = useRef<HTMLDivElement>(null);
  const [fill, setFill] = useState(420);
  useEffect(() => {
    const measure = () => requestAnimationFrame(() => {
      const el = boardRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setFill(Math.max(320, Math.round(window.innerHeight - top - 32)));
    });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const now = today();

  const columns = useMemo(() => STAGES.map((s) => {
    const list = rows.filter((r) => r.status === s).sort((a, b) =>
      // overdue follow-ups first, then the newest
      Number(!!b.follow_up_on && b.follow_up_on <= now) - Number(!!a.follow_up_on && a.follow_up_on <= now) || b.received_at.localeCompare(a.received_at));
    return { s, list, value: list.reduce((t, r) => t + Number(r.trip_value ?? 0), 0) };
  }), [rows, now]);

  function patch(id: string, p: Partial<Inquiry>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }
  function move(id: string, to: InquiryStatus) {
    const q = rows.find((r) => r.id === id);
    if (!q || q.status === to) return;
    if (to === "booked" || to === "closed") { setOpen({ id, intent: to }); return; }
    const before = q.status;
    patch(id, { status: to, stage_changed_at: new Date().toISOString() });
    setError(null);
    start(async () => {
      const r = await moveInquiry(q, to);
      if (!r.ok) { patch(id, { status: before }); setError(`Couldn't move ${q.customer_name}. Try again.`); }
      else router.refresh();
    });
  }

  const cur = open ? rows.find((r) => r.id === open.id) ?? null : null;

  return (
    <section aria-label="Pipeline" data-wide className="flex flex-col gap-2">
      {error && <p role="alert" className="text-[13px] text-danger-text">{error}</p>}
      <p className="text-xs text-slate">Drag a card to another stage, or tap <span className="font-semibold text-brand">›</span> to move it on. Open a card to add the trip value, a follow-up date and notes. A red <span className="font-semibold text-[#C2413B]">2D</span> means it&apos;s been waiting that many days.</p>
      <div ref={boardRef} className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <ol className="flex w-max snap-x snap-mandatory gap-2.5 sm:w-full sm:min-w-[1100px]">
          {columns.map(({ s, list, value }) => {
            const [, fg, dot] = stageColor(s);
            const done = s === "booked" || s === "closed";
            return (
              <li key={s} style={{ minHeight: fill }} className={"flex w-[78vw] flex-none snap-start flex-col " + (done ? "sm:w-[160px]" : "sm:w-auto sm:min-w-[190px] sm:flex-1")}>
                <div
                  onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(s); } }}
                  onDragLeave={() => setOver((o) => (o === s ? null : o))}
                  onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain") || drag; setOver(null); setDrag(null); if (id) move(id, s); }}
                  className={"flex flex-1 flex-col gap-2 rounded-card p-2 transition-colors " + (over === s ? "bg-[#E3F4EA] outline-2 outline-dashed outline-brand" : "bg-sidebar")}>
                  <div className="flex flex-col gap-0.5 px-1.5 pb-1 pt-0.5">
                    <span className="flex items-center gap-2 font-semibold" style={{ color: s === "closed" ? undefined : fg }}>
                      <span className="size-2 rounded-full" style={{ background: dot }} aria-hidden />{INQUIRY_LABEL[s]}
                    </span>
                    <span className="text-xs text-slate">
                      {value > 0 && <span className="font-semibold text-ink">{usd(value)}</span>}{value > 0 && " · "}
                      {list.length} {list.length === 1 ? "inquiry" : "inquiries"}{done ? " · last 30 days" : ""}
                    </span>
                  </div>
                  {list.map((q) => {
                    const stale = !done && STALE_DAYS[q.status] !== undefined && daysIn(q) >= STALE_DAYS[q.status]!;
                    const overdue = !done && !!q.follow_up_on && q.follow_up_on <= now;
                    const n = next(q.status);
                    const body = done ? (
                      <>
                        <span className="line-clamp-2 font-semibold leading-snug">{q.customer_name}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs">
                          {q.trip_value ? <span className="font-semibold text-ink">{usd(Number(q.trip_value))}</span> : null}
                          {s === "closed" && q.lost_reason && <span className="text-slate">{q.lost_reason}</span>}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex flex-col gap-0.5 pr-7">
                          <span className="line-clamp-2 font-semibold leading-snug">{q.customer_name}</span>
                          <span className="truncate text-xs text-slate">{q.interested_in || q.country || q.email || q.phone || "—"}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs">
                          {q.trip_value ? <span className="font-semibold text-ink">{usd(Number(q.trip_value))}</span> : null}
                          {q.travel_dates && <span className="truncate text-slate">{q.travel_dates}</span>}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className={"rounded-badge px-1.5 py-px text-[11px] font-semibold " + (q.source === "meta_ads" ? "bg-[#E8EEFB] text-[#3450A6]" : "bg-[#F1F2F4] text-[#4A4F63]")}>{SOURCE_TAG[q.source]}</span>
                          {stale && <span title={`${daysIn(q)} days in ${INQUIRY_LABEL[q.status]}`} className="rounded-badge bg-[#C2413B] px-1.5 py-px text-[11px] font-semibold text-white">{daysIn(q)}D</span>}
                          {overdue && <span className="rounded-badge bg-[#FDF3E1] px-1.5 py-px text-[11px] font-semibold text-[#8A5A12]">⚠ Follow up{q.follow_up_on! < now ? "" : " today"}</span>}
                        </span>
                      </>
                    );
                    return (
                      <div key={q.id} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", q.id); e.dataTransfer.effectAllowed = "move"; setDrag(q.id); }} onDragEnd={() => { setDrag(null); setOver(null); }}
                        className={"relative rounded-control border bg-white shadow-[0_1px_2px_rgba(0,3,33,0.06)] " + (overdue ? "border-[#F1D9A8]" : "border-line") + (drag === q.id ? " opacity-50" : "")}>
                        {adminHref
                          ? <Link href={`${adminHref}/${q.id}`} className={"flex flex-col text-ink no-underline hover:bg-[#FAFAF8] " + (done ? "gap-1 p-2.5" : "gap-2 p-3")}>{body}</Link>
                          : <button type="button" onClick={() => setOpen({ id: q.id, intent: null })} className={"flex w-full cursor-grab flex-col text-left hover:bg-[#FAFAF8] active:cursor-grabbing " + (done ? "gap-1 p-2.5" : "gap-2 p-3")}>{body}</button>}
                        {n && (
                          <button type="button" onClick={() => move(q.id, n)} aria-label={`Move ${q.customer_name} to ${INQUIRY_LABEL[n]}`} title={`Move to ${INQUIRY_LABEL[n]}`}
                            className="absolute right-2 top-2.5 inline-flex size-6 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-hover">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {list.length === 0 && (
                    <div className="flex flex-1 items-center justify-center rounded-control border border-dashed border-field px-3 py-6 text-center text-xs text-slate">
                      {drag ? "Drop here" : done ? "Nothing in the last 30 days" : "No inquiries here"}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      {cur && open && (
        <InquiryDialog q={cur} company={company} intent={open.intent} onClose={() => { setOpen(null); router.refresh(); }} onUpdate={(p) => patch(cur.id, p)} />
      )}
    </section>
  );
}
