"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteClient } from "./delete-actions";

export function DangerZone({ clientId, name, logins }: { clientId: string; name: string; logins: number }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending]);

  function confirm() {
    setError(null);
    start(async () => {
      const r = await deleteClient(clientId, typed);
      if (r?.error) setError(r.error);
    });
  }

  return (
    <section aria-labelledby="dz-h" className="flex flex-col gap-3 rounded-card border border-[#F2C9C6] px-5 py-4">
      <h2 id="dz-h" className="text-[15px] font-semibold text-danger-text">Danger zone</h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-[240px] flex-1 text-[13px] text-body">
          Delete {name} and everything linked to them. This can&apos;t be undone. To stop work for now, set the account to <strong className="font-semibold">Paused</strong> above instead.
        </p>
        <button type="button" onClick={() => { setOpen(true); setTyped(""); setError(null); }}
          className="h-9 shrink-0 rounded-control border border-danger px-3.5 text-[13px] font-semibold text-danger-text hover:bg-[#FDF4F3]">
          Delete client
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,3,33,0.45)] p-4" onClick={(e) => { if (e.target === e.currentTarget && !pending) setOpen(false); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="dz-t" aria-describedby="dz-d" className="flex w-full max-w-[460px] flex-col gap-4 rounded-card bg-white p-6 shadow-[0_24px_64px_rgba(0,3,33,0.25)]">
            <div className="flex flex-col gap-1">
              <h3 id="dz-t" className="text-[17px] font-semibold">Delete {name}?</h3>
              <p id="dz-d" className="text-[13px] text-body">This permanently deletes:</p>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-body">
              <li>Their inquiries, content, ad reports and requests</li>
              <li>Their invoices and billing details</li>
              <li>Onboarding answers and uploaded files</li>
              <li>Website visitor stats and Meta event history</li>
              <li>{logins === 0 ? "No portal logins are linked" : `${logins} portal ${logins === 1 ? "login" : "logins"}: they won't be able to sign in`}</li>
            </ul>
            <p className="rounded-control bg-[#FDF4F3] px-3 py-2 text-[13px] font-medium text-[#7A2724]">This can&apos;t be undone.</p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="dz-name" className="text-[13px] font-medium">Type <span className="font-semibold">{name}</span> to confirm</label>
              <input id="dz-name" ref={input} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={pending}
                onKeyDown={(e) => { if (e.key === "Enter" && matches && !pending) confirm(); }}
                className="h-10 rounded-control border border-field px-3" />
            </div>
            {error && <p role="alert" className="text-[13px] text-danger-text">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className="h-10 px-4 font-medium text-slate hover:text-ink">Cancel</button>
              <button type="button" onClick={confirm} disabled={!matches || pending}
                className="h-10 rounded-control bg-danger px-4 font-semibold text-white hover:bg-[#A83833] disabled:cursor-not-allowed disabled:opacity-50">
                {pending ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
