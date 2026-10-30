"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { INQUIRY_TONE } from "@/lib/status-tone";
import { INQUIRY_LABEL, SOURCE_LABEL, type Inquiry } from "@/lib/types";
import { fmtDate } from "@/lib/dates";
import { deleteInquiries } from "./actions";

// Admin inquiry list with checkboxes to delete several at once.
export function InquirySelectList({ items, clientNames }: { items: Inquiry[]; clientNames?: Record<string, string> }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const all = items.length > 0 && items.every((i) => picked.has(i.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function remove() {
    setError(null);
    start(async () => {
      const r = await deleteInquiries([...picked]);
      if (r.error) { setError(r.error); return; }
      setDone(`${r.deleted} ${r.deleted === 1 ? "inquiry" : "inquiries"} deleted.`);
      setPicked(new Set()); setAsking(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-9 flex-wrap items-center gap-3 text-[13px]">
        <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-body">
          <input type="checkbox" checked={all} onChange={() => setPicked(all ? new Set() : new Set(items.map((i) => i.id)))} className="size-4 accent-[#1A6647]" />
          Select all
        </label>
        {picked.size > 0 && (
          <>
            <span className="text-slate">{picked.size} selected</span>
            <button type="button" onClick={() => { setAsking(true); setError(null); }}
              className="h-8 rounded-control border border-danger px-3 font-semibold text-danger-text hover:bg-[#FDF4F3]">Delete</button>
          </>
        )}
        {done && picked.size === 0 && <span role="status" className="font-medium text-forest">{done}</span>}
      </div>
      <ul className="overflow-hidden rounded-card border border-line [&>li+li]:border-t [&>li+li]:border-line-soft">
        {items.map((q) => (
          <li key={q.id} className={"flex items-center " + (picked.has(q.id) ? "bg-[#F1FAF6]" : "")}>
            <label className="flex cursor-pointer items-center self-stretch py-3 pl-4 pr-1">
              <input type="checkbox" checked={picked.has(q.id)} onChange={() => toggle(q.id)} aria-label={`Select ${q.customer_name}`} className="size-4 accent-[#1A6647]" />
            </label>
            <Link href={`/admin/inquiries/${q.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3.5 gap-y-1.5 py-3 pl-2.5 pr-4 text-ink no-underline hover:bg-[#FAFAF8]">
              <span className="flex min-w-0 flex-[1_1_220px] flex-col">
                <span className="font-medium">{q.customer_name}</span>
                <span className="truncate text-xs text-slate">
                  {[clientNames?.[q.client_id], q.interested_in, q.country].filter(Boolean).join(" · ") || q.email || q.phone}
                </span>
              </span>
              <span className="w-44 text-[13px] text-body">{SOURCE_LABEL[q.source]}</span>
              <span className="w-16 text-[13px] text-slate">{fmtDate(q.received_at)}</span>
              <span className="w-24"><Badge tone={INQUIRY_TONE[q.status]}>{INQUIRY_LABEL[q.status]}</Badge></span>
            </Link>
          </li>
        ))}
      </ul>
      {asking && (
        <ConfirmDialog title={`Delete ${picked.size} ${picked.size === 1 ? "inquiry" : "inquiries"}?`} confirmLabel="Delete" pending={pending} error={error}
          onConfirm={remove} onClose={() => setAsking(false)}>
          They&apos;re removed for the client too, and can&apos;t be brought back. Use this for test or spam inquiries; for real ones, set the status to Closed instead.
        </ConfirmDialog>
      )}
    </div>
  );
}
