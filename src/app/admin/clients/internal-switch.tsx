"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setClientInternal } from "./actions";

// "This is our own business": keeps Safari Digital's own account out of client counts, income and invoices.
export function InternalSwitch({ clientId, internal }: { clientId: string; internal: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(internal);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-line px-4 py-3">
      <span className="flex min-w-[220px] flex-1 flex-col">
        <span className="font-medium">Internal: our own business</span>
        <span className="text-[13px] text-slate">For Safari Digital&apos;s own inquiries, ads and website. Left out of client counts, income charts and invoices, and gets the agency follow-up template.</span>
        {error && <span role="alert" className="text-[13px] text-danger-text">{error}</span>}
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label="Internal: our own business" disabled={pending}
        onClick={() => { const next = !on; setOn(next); setError(null); start(async () => { const r = await setClientInternal(clientId, next); if (!r.ok) { setOn(!next); setError(r.error ?? "Couldn't save."); } else router.refresh(); }); }}
        className={"relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60 " + (on ? "bg-brand" : "bg-[#C9CDD6]")}>
        <span className={"absolute top-[3px] size-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,3,33,0.25)] transition-[left] " + (on ? "left-[19px]" : "left-[3px]")} />
      </button>
    </div>
  );
}
