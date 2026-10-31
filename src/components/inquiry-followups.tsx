"use client";
import { useEffect, useState, useTransition } from "react";
import { getInquiryFollowups, setInquiryFollowups } from "@/app/inquiry-actions";
import { confirmFollowupMessage, setFollowupState } from "@/app/portal/followups/actions";
import type { InquiryFollowupView } from "@/lib/pipeline-followups";
import type { Inquiry } from "@/lib/types";

type View = InquiryFollowupView;

const STATUS_TONE: Record<string, string> = {
  Sent: "bg-[#E3F4EA] text-[#1A6647]", Sending: "bg-[#E8EEFB] text-[#3450A6]", Scheduled: "bg-[#E8EEFB] text-[#3450A6]",
  Failed: "bg-[#FBEAEA] text-[#9C2F2B]", Canceled: "bg-[#F1F2F4] text-[#4A4F63]", Skipped: "bg-[#F1F2F4] text-[#4A4F63]",
};
const STATE_TONE: Partial<Record<View["state"], string>> = {
  scheduled: "bg-[#E8EEFB] text-[#3450A6]", awaiting: "bg-[#FDF3E1] text-[#8A5A12]", replied: "bg-[#E3F4EA] text-[#1A6647]",
  paused: "bg-[#F1F2F4] text-[#4A4F63]", stopped: "bg-[#F1F2F4] text-[#4A4F63]", quote_expired: "bg-[#FDF3E1] text-[#8A5A12]",
  trip_passed: "bg-[#FDF3E1] text-[#8A5A12]", done: "bg-[#E3F4EA] text-[#1A6647]", limit: "bg-[#E3F4EA] text-[#1A6647]",
};
const STATE_SHORT: Partial<Record<View["state"], string>> = {
  scheduled: "Scheduled", awaiting: "Waiting for you", replied: "Replied", paused: "Paused", stopped: "Stopped",
  quote_expired: "Quote expired", trip_passed: "Dates passed", done: "All sent", limit: "All sent", no_email: "WhatsApp only",
};

// The follow-up section of the inquiry panel: status, what's next, history, and the controls.
export function InquiryFollowups({ q, onUpdate }: { q: Inquiry; onUpdate: (patch: Partial<Inquiry>) => void }) {
  const [v, setV] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    getInquiryFollowups(q.id).then((x) => { if (live) setV(x); }, () => {});
    return () => { live = false; };
  }, [q.id, q.status, q.followups_stopped_at, tick]);

  if (!v || !v.on) return null;
  const inStage = ["contacted", "quoted", "negotiating"].includes(q.status);
  if (!inStage && v.history.length === 0) return null;

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) setError(r.error ?? "Couldn't save.");
    setTick((t) => t + 1);
  });
  const toggleStop = () => {
    const on = !!q.followups_stopped_at;
    onUpdate({ followups_stopped_at: on ? null : new Date().toISOString() });
    act(async () => {
      const r = await setInquiryFollowups(q.id, on);
      if (!r.ok) onUpdate({ followups_stopped_at: q.followups_stopped_at ?? null });
      return r;
    });
  };
  const history = showAll ? v.history : v.history.slice(0, 5);

  return (
    <section aria-labelledby="iq-fu" className="flex flex-col gap-3 rounded-card bg-sidebar px-4 py-3.5">
      <div className="flex items-center gap-2">
        <h3 id="iq-fu" className="text-[13px] font-semibold">Automatic follow-ups</h3>
        {inStage && STATE_SHORT[v.state] && <span className={"rounded-badge px-1.5 py-px text-[11px] font-semibold " + (STATE_TONE[v.state] ?? "bg-[#F1F2F4] text-[#4A4F63]")}>{STATE_SHORT[v.state]}</span>}
        <span className="ml-auto text-xs text-slate">{v.template} template</span>
      </div>

      {inStage && (
        <>
          <p className="text-[13px] text-body">{v.label}.</p>
          {v.state === "awaiting" && !q.followups_stopped_at && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={pending} onClick={() => act(() => confirmFollowupMessage(q.id))}
                className="h-9 rounded-control bg-brand px-3.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
                I sent {v.stageMessage}
              </button>
              <span className="text-xs text-slate">Follow-ups start counting from now.</span>
            </div>
          )}
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[13px]">
            <dt className="text-slate">Next</dt>
            <dd className="min-w-0">{v.next ? <><span className="font-medium">{v.next.subject}</span><span className="text-slate"> · {v.next.when}</span></> : "—"}</dd>
            <dt className="text-slate">Last sent</dt>
            <dd className="min-w-0">{v.lastSent ? <><span>{v.lastSent.subject}</span><span className="text-slate"> · {v.lastSent.when}</span></> : "—"}</dd>
            <dt className="text-slate">Still to come</dt>
            <dd>{v.remaining} {v.remaining === 1 ? "email" : "emails"} in this stage</dd>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            {v.canPause && v.state !== "awaiting" && (
              <button type="button" disabled={pending} onClick={() => act(() => setFollowupState(q.id, "replied"))}
                className="h-8 rounded-control bg-forest px-3 text-[13px] font-semibold text-white hover:bg-[#0A2F25] disabled:opacity-60">Guest replied</button>
            )}
            {v.canPause && (
              <button type="button" disabled={pending} onClick={() => act(() => setFollowupState(q.id, "paused"))}
                className="h-8 rounded-control border border-field bg-white px-3 text-[13px] font-medium hover:bg-[#F4F5F2] disabled:opacity-60">Pause</button>
            )}
            {v.canResume && (
              <button type="button" disabled={pending} onClick={() => act(() => setFollowupState(q.id, "active"))}
                className="h-8 rounded-control border border-field bg-white px-3 text-[13px] font-medium hover:bg-[#F4F5F2] disabled:opacity-60">Resume</button>
            )}
            {v.confirmed && v.state === "scheduled" && (
              <button type="button" disabled={pending} onClick={() => act(() => confirmFollowupMessage(q.id))} title="Pushes the next automatic email back 3 days"
                className="h-8 rounded-control px-2 text-[13px] font-medium text-brand hover:underline disabled:opacity-60">I just messaged them</button>
            )}
            <label className="ml-auto inline-flex items-center gap-2 text-[13px]">
              <span className="text-slate">{q.followups_stopped_at ? "Stopped for this guest" : "On for this guest"}</span>
              <button type="button" role="switch" aria-checked={!q.followups_stopped_at} aria-label="Automatic follow-ups for this guest" disabled={pending} onClick={toggleStop}
                className={"relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60 " + (q.followups_stopped_at ? "bg-[#C9CDD6]" : "bg-brand")}>
                <span className={"absolute top-[3px] size-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,3,33,0.25)] transition-[left] " + (q.followups_stopped_at ? "left-[3px]" : "left-[19px]")} />
              </button>
            </label>
          </div>
          {v.canResume && <p className="text-xs text-slate">Resuming sends only what&apos;s still ahead. Emails missed while paused are skipped, never sent at once.</p>}
        </>
      )}

      {error && <p role="alert" className="text-[13px] text-danger-text">{error}</p>}

      {v.history.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-line-soft pt-2.5">
          <span className="text-xs font-semibold text-slate">History</span>
          <ul className="flex flex-col gap-1.5">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <span className={"rounded-badge px-1.5 py-px text-[11px] font-semibold " + (STATUS_TONE[h.status] ?? "bg-[#F1F2F4] text-[#4A4F63]")}>{h.status}</span>
                <span className="min-w-0 flex-1 truncate text-body">{h.channel === "whatsapp" ? "WhatsApp · " : ""}{h.subject}</span>
                <span className="text-slate">{h.when}</span>
                {h.note && <span className="w-full pl-1 text-slate">{h.note}</span>}
              </li>
            ))}
          </ul>
          {v.history.length > 5 && (
            <button type="button" onClick={() => setShowAll((x) => !x)} className="self-start text-xs font-medium text-brand">{showAll ? "Show less" : `Show all ${v.history.length}`}</button>
          )}
        </div>
      )}
    </section>
  );
}
