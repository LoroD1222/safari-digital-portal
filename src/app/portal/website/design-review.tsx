"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Alert, Textarea } from "@/components/ui";
import { Icon } from "@/components/icons";
import { reviewDesign } from "./actions";

// "Review design" button + dialog, as in the design.
export function DesignReview({ previewUrl }: { previewUrl: string }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [done, setDone] = useState<null | "approved" | "changes">(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const go = (approve: boolean) => {
    if (!approve && !text.trim()) { setInvalid(true); return; }
    start(async () => {
      const r = await reviewDesign(approve, text);
      if (r.error) { setError(r.error); return; }
      setDone(approve ? "approved" : "changes");
      setOpen(false);
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-control border border-[#F1E2C3] bg-[#FFFAF0] px-3.5 py-3">
        <span className="flex min-w-[260px] flex-1 flex-col">
          <span className="font-semibold">{done === "approved" ? "Design approved — thank you" : done === "changes" ? "Feedback sent" : "Your website design is ready to review"}</span>
          <span className="text-[13px] text-body">{done ? "Safari Digital has been notified." : "Approve it or tell us what to change."}</span>
        </span>
        {!done && (
          <button type="button" onClick={() => { setOpen(true); setFeedback(false); setError(null); }}
            className="h-9 rounded-control bg-brand px-3.5 font-semibold text-white hover:bg-brand-hover">Review design</button>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,3,33,0.45)] p-6" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="rv-h" className="flex w-full max-w-[520px] flex-col gap-4 rounded-card bg-white px-6 py-[22px] shadow-[0_24px_64px_rgba(0,3,33,0.25)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 id="rv-h" className="text-[17px] font-semibold">Review your website design</h2>
                <span className="text-[13px] text-slate">Look through every page, on your phone too.</span>
              </div>
              <button ref={closeRef} type="button" aria-label="Close" onClick={() => setOpen(false)} className="inline-flex size-8 flex-none items-center justify-center rounded-control text-slate hover:bg-[#F4F5F2]">
                <Icon name="close" size={18} />
              </button>
            </div>
            <a href={previewUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-control border border-field px-3.5 py-3 text-ink no-underline hover:bg-[#F4F5F2]">
              <Icon name="external" size={18} className="text-brand" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">Open design preview</span>
                <span className="truncate text-xs text-slate">{previewUrl.replace(/^https?:\/\//, "")}</span>
              </span>
            </a>
            {!feedback ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={pending} onClick={() => go(true)} className="h-10 flex-1 rounded-control bg-brand font-semibold text-white hover:bg-brand-hover disabled:opacity-60">{pending ? "Saving…" : "Approve design"}</button>
                <button type="button" disabled={pending} onClick={() => setFeedback(true)} className="h-10 flex-1 rounded-control border border-field bg-white font-medium hover:bg-[#F4F5F2]">Request changes</button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label htmlFor="fb" className="font-medium">Your feedback</label>
                <Textarea id="fb" rows={4} value={text} autoFocus aria-invalid={invalid}
                  onChange={(e) => { setText(e.target.value); setInvalid(false); }} placeholder="What would you like us to change?" />
                {invalid && <span className="text-xs text-danger-text">Tell us what you&apos;d like changed.</span>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setFeedback(false); setInvalid(false); }} className="h-9 px-3 font-medium text-slate hover:text-ink">Cancel</button>
                  <button type="button" disabled={pending} onClick={() => go(false)} className="h-9 rounded-control bg-brand px-3.5 font-semibold text-white hover:bg-brand-hover disabled:opacity-60">{pending ? "Sending…" : "Send feedback"}</button>
                </div>
              </div>
            )}
            {error && <Alert>{error}</Alert>}
          </div>
        </div>
      )}
    </>
  );
}
