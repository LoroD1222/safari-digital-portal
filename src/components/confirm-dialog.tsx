"use client";
import { useEffect, useRef, type ReactNode } from "react";

// Small "are you sure?" dialog for destructive actions.
export function ConfirmDialog({ title, children, confirmLabel, pending, error, onConfirm, onClose }: {
  title: string; children: ReactNode; confirmLabel: string; pending?: boolean; error?: string | null; onConfirm: () => void; onClose: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pending]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,3,33,0.45)] p-4" onClick={(e) => { if (e.target === e.currentTarget && !pending) onClose(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="cd-t" className="flex w-full max-w-[420px] flex-col gap-3 rounded-card bg-white p-6 shadow-[0_24px_64px_rgba(0,3,33,0.25)]">
        <h3 id="cd-t" className="text-[17px] font-semibold">{title}</h3>
        <div className="text-[13px] text-body">{children}</div>
        {error && <p role="alert" className="text-[13px] text-danger-text">{error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <button ref={cancel} type="button" onClick={onClose} disabled={pending} className="h-10 px-4 font-medium text-slate hover:text-ink">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={pending} className="h-10 rounded-control bg-danger px-4 font-semibold text-white hover:bg-[#A83833] disabled:opacity-60">
            {pending ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
