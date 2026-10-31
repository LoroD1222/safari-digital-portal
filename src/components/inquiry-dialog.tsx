"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { getInquiryHistory, saveInquiryDeal, updateInquiryStatus, type HistoryRow } from "@/app/inquiry-actions";
import { InquiryFollowups } from "./inquiry-followups";
import type { FollowupBadge } from "@/lib/pipeline-followups";
import { Icon } from "./icons";
import { TONES } from "./ui";
import { INQUIRY_TONE } from "@/lib/status-tone";
import { CHANNEL_LABEL, INQUIRY_LABEL, LOST_REASONS, SOURCE_LABEL, STAGES, type Inquiry, type InquiryStatus } from "@/lib/types";

export const stageColor = (s: InquiryStatus) => TONES[INQUIRY_TONE[s]];
export const usd = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: n % 1 ? 2 : 0 });

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dar_es_Salaam" });
}

export function StageBadge({ s }: { s: InquiryStatus }) {
  const [bg, fg, dot] = stageColor(s);
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-badge px-2 text-xs font-medium" style={{ background: bg, color: fg }}>
      <span className="size-1.5 rounded-full" style={{ background: dot }} />{INQUIRY_LABEL[s]}
    </span>
  );
}

// Moves an inquiry to a stage. Booked saves the trip value first, Lost the reason,
// so the Booked event that goes to Meta carries the value.
export async function moveInquiry(q: Inquiry, to: InquiryStatus, extra?: { trip_value?: number | null; lost_reason?: string | null }): Promise<{ ok: boolean; error?: string }> {
  try { return await move(q, to, extra); } catch { return { ok: false, error: "Couldn't reach the portal. Check your connection and try again." }; }
}
async function move(q: Inquiry, to: InquiryStatus, extra?: { trip_value?: number | null; lost_reason?: string | null }) {
  if (extra) {
    const r = await saveInquiryDeal(q.id, {
      trip_value: extra.trip_value !== undefined ? extra.trip_value : q.trip_value ?? null,
      follow_up_on: to === "booked" || to === "closed" ? null : q.follow_up_on ?? null,
      notes: q.notes ?? null,
      lost_reason: extra.lost_reason !== undefined ? extra.lost_reason : to === "closed" ? q.lost_reason ?? null : null,
    });
    if (!r.ok) return r;
  }
  const r = await updateInquiryStatus(q.id, to);
  return r.ok ? { ok: true } : { ok: false, error: "Couldn't move it. Try again." };
}

type Intent = "booked" | "closed" | null;

export function InquiryDialog({ q, company, intent: startIntent = null, onClose, onUpdate }: {
  q: Inquiry; company: string; intent?: Intent; onClose: () => void; onUpdate: (patch: Partial<Inquiry>) => void;
  followup?: FollowupBadge | null; // undefined = follow-ups are off for this client, so the switch is hidden
}) {
  const [intent, setIntent] = useState<Intent>(startIntent);
  const [value, setValue] = useState(q.trip_value != null ? String(q.trip_value) : "");
  const [follow, setFollow] = useState(q.follow_up_on ?? "");
  const [notes, setNotes] = useState(q.notes ?? "");
  const [reason, setReason] = useState(q.lost_reason ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [pending, start] = useTransition();
  const closeRef = useRef<HTMLButtonElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (intent === "booked") valueRef.current?.focus(); else closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, intent]);

  useEffect(() => {
    let live = true;
    getInquiryHistory(q.id).then((h) => { if (live) setHistory(h); }, () => {});
    return () => { live = false; };
  }, [q.id, q.status]);

  const parsed = value.trim() === "" ? null : Number(value.replace(/[$,\s]/g, ""));
  const badValue = parsed !== null && (!Number.isFinite(parsed) || parsed < 0);
  const dirty = (parsed ?? null) !== (q.trip_value ?? null) || (follow || null) !== (q.follow_up_on ?? null) || (notes.trim() || null) !== (q.notes ?? null);

  function pick(s: InquiryStatus) {
    setMsg(null);
    if (s === q.status) { setIntent(null); return; }
    if (s === "booked" || s === "closed") { setIntent(s); return; }
    setIntent(null);
    start(async () => {
      const r = await moveInquiry(q, s);
      if (r.ok) onUpdate({ status: s, stage_changed_at: new Date().toISOString(), lost_reason: null });
      else setMsg({ ok: false, text: r.error ?? "Couldn't move it." });
    });
  }
  function confirmBooked() {
    if (parsed === null || badValue || parsed === 0) { setMsg({ ok: false, text: "Add the trip value in US dollars, e.g. 4200." }); valueRef.current?.focus(); return; }
    start(async () => {
      const r = await moveInquiry(q, "booked", { trip_value: parsed });
      if (r.ok) { onUpdate({ status: "booked", trip_value: parsed, follow_up_on: null, lost_reason: null, stage_changed_at: new Date().toISOString() }); setIntent(null); setFollow(""); setMsg({ ok: true, text: `Booked for ${usd(parsed)}. 🎉` }); }
      else setMsg({ ok: false, text: r.error ?? "Couldn't save." });
    });
  }
  function confirmLost() {
    start(async () => {
      const r = await moveInquiry(q, "closed", { lost_reason: reason || null });
      if (r.ok) { onUpdate({ status: "closed", lost_reason: reason || null, follow_up_on: null, stage_changed_at: new Date().toISOString() }); setIntent(null); setFollow(""); setMsg({ ok: true, text: "Marked as lost." }); }
      else setMsg({ ok: false, text: r.error ?? "Couldn't save." });
    });
  }
  function saveDetails() {
    if (badValue) { setMsg({ ok: false, text: "Enter the trip value as a number of US dollars." }); return; }
    start(async () => {
      const r = await saveInquiryDeal(q.id, { trip_value: parsed, follow_up_on: follow || null, notes: notes.trim() || null, lost_reason: q.lost_reason ?? null })
        .catch(() => ({ ok: false, error: "Couldn't reach the portal. Check your connection and try again." }));
      if (r.ok) { onUpdate({ trip_value: parsed, follow_up_on: follow || null, notes: notes.trim() || null }); setMsg({ ok: true, text: "Saved." }); }
      else setMsg({ ok: false, text: r.error ?? "Couldn't save." });
    });
  }

  const digits = q.phone?.replace(/[^\d]/g, "") ?? "";
  const input = "h-10 w-full rounded-control border border-field bg-white px-3 aria-invalid:border-danger";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(0,3,33,0.45)] sm:items-center sm:p-6" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="iq-h" className="flex max-h-[92vh] w-full max-w-[600px] flex-col gap-5 overflow-auto rounded-t-card bg-white px-5 py-5 shadow-[0_24px_64px_rgba(0,3,33,0.25)] sm:max-h-full sm:rounded-card sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="iq-h" className="text-[17px] font-semibold">{q.customer_name}</h2>
            <span className="text-[13px] text-slate">{[q.interested_in, q.country, `received ${when(q.received_at)}`].filter(Boolean).join(" · ")}</span>
          </div>
          <button ref={closeRef} type="button" aria-label="Close" onClick={onClose} className="inline-flex size-8 flex-none items-center justify-center rounded-control text-slate hover:bg-[#F4F5F2]"><Icon name="close" size={18} /></button>
        </div>

        {(digits.length >= 8 || q.email) && (
          <div className="flex flex-wrap gap-2">
            {digits.length >= 8 && <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-control bg-brand px-3.5 text-[13px] font-semibold text-white no-underline hover:bg-brand-hover"><Icon name="whatsapp" size={15} />WhatsApp</a>}
            {q.email && <a href={`mailto:${q.email}`} className="inline-flex h-9 items-center rounded-control border border-field bg-white px-3.5 text-[13px] font-medium text-ink no-underline hover:bg-[#F4F5F2]">Email</a>}
            {q.phone && <a href={`tel:${q.phone.replace(/\s/g, "")}`} className="inline-flex h-9 items-center rounded-control border border-field bg-white px-3.5 text-[13px] font-medium text-ink no-underline hover:bg-[#F4F5F2]">Call</a>}
          </div>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 text-[13px] font-semibold text-slate">Stage</legend>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((s) => {
              const on = (intent ?? q.status) === s;
              const [, , dot] = stageColor(s);
              return (
                <button key={s} type="button" aria-pressed={on} disabled={pending} onClick={() => pick(s)}
                  className={"inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium " + (on ? "border-forest bg-forest text-white" : "border-field bg-white text-body hover:bg-[#F4F5F2]")}>
                  <span className="size-1.5 rounded-full" style={{ background: on ? "#fff" : dot }} />{INQUIRY_LABEL[s]}
                </button>
              );
            })}
          </div>
          {intent === "booked" && (
            <div className="mt-1 flex flex-col gap-2 rounded-control border border-[#BFE3CF] bg-[#F1FAF6] p-3.5">
              <label htmlFor="iq-book" className="font-medium text-forest">What&apos;s the trip worth? (USD)</label>
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[160px] flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate">$</span>
                  <input id="iq-book" ref={valueRef} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="4200"
                    onKeyDown={(e) => { if (e.key === "Enter") confirmBooked(); }} aria-invalid={badValue} className={input + " pl-7"} />
                </div>
                <button type="button" onClick={confirmBooked} disabled={pending} className="h-10 rounded-control bg-brand px-4 font-semibold text-white hover:bg-brand-hover disabled:opacity-60">{pending ? "Saving…" : "Mark as booked"}</button>
                <button type="button" onClick={() => setIntent(null)} className="h-10 px-2 text-[13px] font-medium text-slate hover:text-ink">Cancel</button>
              </div>
              <span className="text-xs text-slate">The total the guest pays. It shows your booked revenue and teaches your Meta ads which inquiries are worth the most.</span>
            </div>
          )}
          {intent === "closed" && (
            <div className="mt-1 flex flex-col gap-2 rounded-control border border-line bg-sidebar p-3.5">
              <span className="font-medium">Why was it lost? <span className="font-normal text-slate">· optional</span></span>
              <div className="flex flex-wrap gap-1.5">
                {LOST_REASONS.map((r) => (
                  <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(reason === r ? "" : r)}
                    className={"h-8 rounded-full border px-3 text-[13px] " + (reason === r ? "border-forest bg-forest text-white" : "border-field bg-white text-body hover:bg-[#F4F5F2]")}>{r}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={confirmLost} disabled={pending} className="h-9 rounded-control bg-ink px-3.5 text-[13px] font-semibold text-white disabled:opacity-60">{pending ? "Saving…" : "Mark as lost"}</button>
                <button type="button" onClick={() => setIntent(null)} className="h-9 px-2 text-[13px] font-medium text-slate hover:text-ink">Cancel</button>
              </div>
            </div>
          )}
          {q.status === "closed" && q.lost_reason && !intent && <span className="text-[13px] text-slate">Lost: {q.lost_reason}</span>}
        </fieldset>

        <section aria-labelledby="iq-deal" className="flex flex-col gap-3">
          <h3 id="iq-deal" className="text-[13px] font-semibold text-slate">Deal</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium">Trip value (USD)
              <span className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-normal text-slate">$</span>
                <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Add when you send the quote" aria-invalid={badValue} className={input + " pl-7 font-normal"} />
              </span>
            </label>
            {q.status !== "booked" && q.status !== "closed" && (
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">Next follow-up
                <input type="date" value={follow} onChange={(e) => setFollow(e.target.value)} className={input + " font-normal"} />
              </label>
            )}
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">Notes
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Wants a balloon safari, prefers lodges over tents"
              className="rounded-control border border-field px-3 py-2.5 font-normal" />
          </label>
          <div className="flex items-center justify-end gap-3">
            {msg && <span role="status" className={"text-[13px] " + (msg.ok ? "text-forest" : "text-danger-text")}>{msg.text}</span>}
            <button type="button" onClick={saveDetails} disabled={pending || !dirty} className="h-9 rounded-control border border-field bg-white px-3.5 text-[13px] font-semibold hover:bg-[#F4F5F2] disabled:opacity-50">
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </section>

        <InquiryFollowups q={q} onUpdate={onUpdate} />

        <dl className="flex flex-col">
          {([
            ["Interested in", q.interested_in],
            ["Travel dates", q.travel_dates],
            ["Travellers", q.travellers],
            ["Email", q.email],
            ["Phone / WhatsApp", q.phone],
            ["Source", SOURCE_LABEL[q.source] + (q.campaign ? ` · ${q.campaign}` : "")],
            ["Got in touch via", CHANNEL_LABEL[q.channel] ?? q.channel],
          ] as [string, React.ReactNode][]).map(([k, v]) => (
            <div key={k} className="flex flex-wrap gap-4 border-t border-line-soft py-2">
              <dt className="flex-[0_0_130px] text-slate">{k}</dt>
              <dd className="min-w-0 flex-[1_1_200px] [overflow-wrap:anywhere]">{v || "—"}</dd>
            </div>
          ))}
        </dl>
        {q.message && <div className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-slate">Message</span><p className="whitespace-pre-wrap">{q.message}</p></div>}

        {history && history.length > 0 && (
          <section aria-labelledby="iq-hist" className="flex flex-col gap-1.5">
            <h3 id="iq-hist" className="text-[13px] font-semibold text-slate">History</h3>
            <ul className="flex flex-col gap-1 text-[13px]">
              {history.map((h, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-2 text-body">
                  <span className="size-1.5 rounded-full" style={{ background: stageColor(h.status)[2] }} />
                  <span>{i === history.length - 1 && h.status === "new" ? "Inquiry received" : `Moved to ${INQUIRY_LABEL[h.status]}`}</span>
                  <span className="text-slate">· {when(h.at)}{h.by_role === "admin" ? " · by Safari Digital" : ""}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <span className="text-xs text-slate">Only {company} and Safari Digital can see this inquiry.</span>
      </div>
    </div>
  );
}
