"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { REQUEST_TONE } from "@/lib/status-tone";
import { CATEGORY_LABEL, REQUEST_LABEL_ADMIN, type SupportRequest } from "@/lib/types";
import { deleteRequests } from "@/app/request-actions";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

// Admin request list with checkboxes to delete several at once.
export function RequestSelectList({ items, clientNames }: { items: SupportRequest[]; clientNames?: Record<string, string> }) {
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
      const r = await deleteRequests([...picked]);
      if (r.error) { setError(r.error); return; }
      setDone(`${r.deleted} ${r.deleted === 1 ? "request" : "requests"} deleted.`);
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
        {items.map((r) => {
          const unread = r.last_message_role === "client" && r.status !== "completed";
          return (
            <li key={r.id} className={"flex items-center " + (picked.has(r.id) ? "bg-[#F1FAF6]" : "")}>
              <label className="flex cursor-pointer items-center self-stretch py-3 pl-4 pr-1">
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.subject}`} className="size-4 accent-[#1A6647]" />
              </label>
              <Link href={`/admin/requests/${r.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3.5 gap-y-1.5 py-3 pl-2.5 pr-4 text-ink no-underline hover:bg-[#FAFAF8]">
                <span className={"size-2 flex-none rounded-full " + (unread ? "bg-[#E0A458]" : "bg-transparent")} aria-hidden="true" />
                <span className="flex min-w-0 flex-[1_1_240px] flex-col">
                  <span className="truncate font-medium">{r.subject}</span>
                  <span className="truncate text-xs text-slate">
                    {[clientNames?.[r.client_id], CATEGORY_LABEL[r.category], `${unread ? "Client replied" : "Updated"} ${ago(r.last_message_at)}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <Badge tone={REQUEST_TONE[r.status]}>{REQUEST_LABEL_ADMIN[r.status]}</Badge>
              </Link>
            </li>
          );
        })}
      </ul>
      {asking && (
        <ConfirmDialog title={`Delete ${picked.size} ${picked.size === 1 ? "request" : "requests"}?`} confirmLabel="Delete" pending={pending} error={error}
          onConfirm={remove} onClose={() => setAsking(false)}>
          The conversations and their attachments are removed for the client too, and can&apos;t be brought back. To close finished requests, mark them Completed instead.
        </ConfirmDialog>
      )}
    </div>
  );
}
